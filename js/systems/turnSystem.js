import { getState, setState } from "../state.js";
import { renderStoryTurn, pushCurrentTurnToHistory, applyEffects, computeQuarterlyEffects, estimateEffectsFromEdict } from "./storySystem.js";
import { autoSaveIfEnabled } from "../storage.js";
import { updateTopbarByState } from "../layout.js";
import { applyProgressionToChoiceEffects, extractCustomPoliciesFromEdict, mergeCustomPolicies, processCoreGameplayTurn, refreshQuarterAgendaByState, resolveHostileForcesAfterChoice, scaleEffectsByExecution } from "./coreGameplaySystem.js";
import { sanitizeStoryEffects } from "../api/validators.js";
import { loadJSON } from "../dataLoader.js";
import { buildOutcomeDisplayDelta, captureDisplayStateSnapshot } from "../utils/displayStateMetrics.js";
import { deriveAppointmentEffectsFromText, normalizeAppointmentEffects } from "../utils/appointmentEffects.js";
import { advanceKejuSession, advanceWujuSession, getKejuStateSnapshot, getWujuStateSnapshot, resetKejuForNextCycle, resetWujuForNextCycle } from "./kejuSystem.js";
import { buildStoryFactsFromState } from "../utils/storyFacts.js";
import { getAbsoluteYearForEraYear } from "../utils/eraYear.js";
import { isRigidMode } from "../rigid/config.js";
import { ensureRigidState, runRigidTurn } from "../rigid/engine.js";
import { appendMemoryAnchor, createMemoryAnchor } from "../rigid/memory.js";
import { computeRigidSettlementDelta } from "../rigid/settlement.js";
import { showError } from "../utils/toast.js";

let positionsMetaCache = null;

function cloneStateSnapshot(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

async function getPositionsMeta() {
  if (positionsMetaCache) return positionsMetaCache;
  try {
    positionsMetaCache = await loadJSON("data/positions.json");
  } catch (_e) {
    positionsMetaCache = { positions: [], departments: [] };
  }
  return positionsMetaCache;
}

function isAliveCharacter(state, id) {
  return state.characterStatus?.[id]?.isAlive !== false;
}

function getAllCharacters(state) {
  return Array.isArray(state?.allCharacters) && state.allCharacters.length
    ? state.allCharacters
    : Array.isArray(state?.ministers)
      ? state.ministers
      : [];
}

function mergeMissingEstimatedEffects(baseEffects, estimatedEffects) {
  if (!estimatedEffects || typeof estimatedEffects !== "object") return baseEffects;

  const next = baseEffects && typeof baseEffects === "object" ? { ...baseEffects } : {};
  const mergeableKeys = [
    "treasury",
    "grain",
    "militaryStrength",
    "civilMorale",
    "borderThreat",
    "disasterLevel",
    "corruptionLevel",
  ];

  let changed = false;
  mergeableKeys.forEach((key) => {
    if (typeof next[key] === "number") return;
    if (typeof estimatedEffects[key] !== "number") return;
    next[key] = estimatedEffects[key];
    changed = true;
  });

  return changed ? next : baseEffects;
}

export function buildCustomPolicyQuarterNews(customPolicyCount, customBonus) {
  if (!customPolicyCount || !customBonus) return null;
  return {
    title: "自定义国策生效",
    summary: `本季 ${customPolicyCount} 条自定义国策参与结算：财政系数 x${customBonus.treasuryRatio.toFixed(2)}，粮储系数 x${customBonus.grainRatio.toFixed(2)}，军力 +${customBonus.militaryDelta}，贪腐 ${customBonus.corruptionDelta}。`,
    tag: "重要",
    icon: "📜",
  };
}

async function remindVacantCourtPositionsYearEnd() {
  const state = getState();
  const meta = await getPositionsMeta();
  const positions = Array.isArray(meta?.positions) ? meta.positions : [];
  if (!positions.length) return;

  const appointments = { ...(state.appointments || {}) };
  const vacancies = positions
    .filter((position) => position && position.id && !appointments[position.id])
    .sort((a, b) => {
      const rankA = typeof a.rank === "number" ? a.rank : 99;
      const rankB = typeof b.rank === "number" ? b.rank : 99;
      return rankA - rankB;
    });

  if (!vacancies.length) return;
  const summary = vacancies.slice(0, 5).map((position) => position.name || position.id).join("、");

  setState({
    systemNewsToday: [
      ...(state.systemNewsToday || []),
      {
        title: "岁末吏部提醒补官",
        summary: `当前有 ${vacancies.length} 个官职空缺（如：${summary}${vacancies.length > 5 ? "等" : ""}），请于年终自行任命以稳朝局。`,
        tag: "重要",
        icon: "📑",
      },
    ],
  });
}

function progressNaturalMinisterDeaths(nextYear, nextMonth) {
  const state = getState();
  const allCharacters = getAllCharacters(state);
  if (!allCharacters.length) return;

  const absoluteYear = getAbsoluteYearForEraYear(nextYear || 1, state.config);
  const characterStatus = { ...(state.characterStatus || {}) };
  const appointments = { ...(state.appointments || {}) };
  const deathList = [];

  allCharacters.forEach((character) => {
    if (!character?.id) return;
    if (!isAliveCharacter(state, character.id)) return;
    if (typeof character.deathYear !== "number") return;

    const currentStatus = characterStatus[character.id] || {};
    const maxDeathYear = typeof character.birthYear === "number"
      ? Math.min(1700, character.birthYear + 110)
      : 1700;

    let lifespanPatchYears = Number.isInteger(currentStatus.lifespanPatchYears)
      ? currentStatus.lifespanPatchYears
      : null;
    if (lifespanPatchYears === null) {
      const baseRoll = 6 + Math.floor(Math.random() * 44); // 6..49
      const maxAllowedPatch = Math.max(0, maxDeathYear - character.deathYear);
      lifespanPatchYears = Math.min(baseRoll, maxAllowedPatch);
      characterStatus[character.id] = {
        ...currentStatus,
        lifespanPatchYears,
      };
    }
    const delayedStartYear = Math.min(character.deathYear + lifespanPatchYears, maxDeathYear);
    if (absoluteYear < delayedStartYear) return;

    const yearsPast = absoluteYear - delayedStartYear;
    const monthlyChance = Math.min(0.03 + yearsPast * 0.02, 0.25);
    if (Math.random() >= monthlyChance) return;

    const current = characterStatus[character.id] || {};
    characterStatus[character.id] = {
      ...current,
      lifespanPatchYears,
      isAlive: false,
      deathReason: current.deathReason || "寿终病逝",
      deathDay: nextMonth || 1,
      deathYear: nextYear || 1,
    };

    for (const [positionId, holderId] of Object.entries(appointments)) {
      if (holderId === character.id) delete appointments[positionId];
    }
    deathList.push(character.name || character.id);
  });

  if (!deathList.length) return;

  setState({
    characterStatus,
    appointments,
    systemNewsToday: [
      ...(state.systemNewsToday || []),
      {
        title: "群臣讣告",
        summary: `${deathList.join("、")} 因年老病逝，相关官职已出缺。`,
        tag: "重要",
        icon: "⚰️",
      },
    ],
  });
}

async function progressKejuByMonth(nextYear, nextMonth) {
  const state = getState();
  const snapshot = getKejuStateSnapshot(state);

  if (snapshot.stage === "published") {
    setState({
      keju: {
        ...resetKejuForNextCycle(snapshot),
        talentReserve: [],
        note: "上一届待录用名单已归档，新一届科举重新筹备。",
      },
    });
    return;
  }

  setState({
    keju: advanceKejuSession(snapshot, {
      state,
      characters: getAllCharacters(state),
    }, { enableGeneratedCandidates: true }),
  });
}

async function progressWujuByMonth(nextYear, nextMonth) {
  const state = getState();
  const snapshot = getWujuStateSnapshot(state);

  if (snapshot.stage === "published") {
    setState({
      wuju: {
        ...resetWujuForNextCycle(snapshot),
        talentReserve: [],
        note: "上一届武举待录用名单已归档，新一届武举重新筹备。",
      },
    });
    return;
  }

  setState({
    wuju: advanceWujuSession(snapshot, {
      state,
      characters: getAllCharacters(state),
    }, { enableGeneratedCandidates: true }),
  });
}

export function runCurrentTurn(container, options = {}) {
  const state = getState();
  if (isRigidMode(state)) {
    const ensured = ensureRigidState(state);
    const syncPatch = {
      rigid: ensured.rigid,
      currentYear: Math.max(1, (ensured.rigid?.calendar?.year || 1627) - 1626),
      currentMonth: ensured.rigid?.calendar?.month || 8,
      currentPhase: "morning",
    };
    if (
      !state.rigid ||
      state.rigid !== ensured.rigid ||
      state.currentYear !== syncPatch.currentYear ||
      state.currentMonth !== syncPatch.currentMonth
    ) {
      setState(syncPatch);
    }
    return renderStoryTurn(getState(), container, handleChoice, options);
  }
  return renderStoryTurn(state, container, handleChoice, options);
}

function getEdictRerenderTarget() {
  if (typeof document === "undefined") return null;
  return document.querySelector(".main-view--edict") || document.getElementById("main-view");
}

function scrollEdictToLatest(target) {
  if (!target) return;
  const scrollHost = target?._storyLayout?.mainBody || target;
  requestAnimationFrame(() => {
    scrollHost.scrollTop = scrollHost.scrollHeight;
  });
}

function normalizePolicyText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function consumePendingPolicyEdictChoiceText(state, choiceText) {
  const baseChoiceText = normalizePolicyText(choiceText);
  const pendingPolicyEdict = normalizePolicyText(state?.policyDiscussion?.pendingIssuedEdict?.content);
  if (!pendingPolicyEdict) {
    return {
      choiceText: baseChoiceText,
      consumed: false,
    };
  }

  return {
    choiceText: baseChoiceText ? `${baseChoiceText}\n【问政】${pendingPolicyEdict}` : `【问政】${pendingPolicyEdict}`,
    consumed: true,
  };
}

function clearPendingPolicyEdictState() {
  const policyDiscussion = getState().policyDiscussion || {};
  if (!policyDiscussion.pendingIssuedEdict) return;
  setState({
    policyDiscussion: {
      ...policyDiscussion,
      pendingIssuedEdict: null,
    },
  });
}

async function handleChoice(choiceId, choiceText, choiceHint, effects) {
  const preparedChoice = consumePendingPolicyEdictChoiceText(getState(), choiceText);
  const effectiveChoiceText = preparedChoice.choiceText;

  if (isRigidMode(getState())) {
    const beforeRigidState = getState();
    const rigidStateSnapshot = cloneStateSnapshot(beforeRigidState);
    const historyKey = `${beforeRigidState.currentYear || 1}_${beforeRigidState.currentMonth || 1}_${beforeRigidState.currentPhase || "morning"}`;

    if (choiceId === "custom_edict") {
      const newlyFound = extractCustomPoliciesFromEdict(effectiveChoiceText || "", beforeRigidState.currentYear, beforeRigidState.currentMonth);
      if (newlyFound.length) {
        const mergedPolicies = mergeCustomPolicies(beforeRigidState.customPolicies, newlyFound);
        const fresh = mergedPolicies.filter((item) => !(beforeRigidState.customPolicies || []).some((old) => old.id === item.id));
        const policyNews = fresh.map((item) => ({
          title: "新国策设立",
          summary: `自拟诏书已将“${item.name}”纳入国策，季度结算将同步其长期影响。`,
          tag: "重要",
          icon: "📜",
        }));
        setState({
          customPolicies: mergedPolicies,
          systemNewsToday: [...(beforeRigidState.systemNewsToday || []), ...policyNews],
        });
      }
    }

    const positionsMeta = await getPositionsMeta();
    const roster = getAllCharacters(beforeRigidState);
    const derivedAppointmentEffects = deriveAppointmentEffectsFromText(effectiveChoiceText || "", {
      positions: positionsMeta?.positions || [],
      ministers: roster,
      currentAppointments: beforeRigidState.appointments || {},
    });
    let rigidAppliedEffects = effects;
    if (derivedAppointmentEffects) {
      const base = rigidAppliedEffects && typeof rigidAppliedEffects === "object" ? { ...rigidAppliedEffects } : {};
      if (derivedAppointmentEffects.appointments) {
        base.appointments = {
          ...(base.appointments && typeof base.appointments === "object" ? base.appointments : {}),
          ...derivedAppointmentEffects.appointments,
        };
      }
      if (Array.isArray(derivedAppointmentEffects.appointmentDismissals)) {
        const currentDismissals = Array.isArray(base.appointmentDismissals) ? base.appointmentDismissals : [];
        base.appointmentDismissals = Array.from(new Set([...currentDismissals, ...derivedAppointmentEffects.appointmentDismissals]));
      }
      rigidAppliedEffects = base;
    }

    const estimatedRigidEffects = estimateEffectsFromEdict(`${effectiveChoiceText || ""}\n${choiceHint || ""}`);
    rigidAppliedEffects = mergeMissingEstimatedEffects(rigidAppliedEffects, estimatedRigidEffects);

    const normalizedRigidEffects = rigidAppliedEffects
      ? normalizeAppointmentEffects(rigidAppliedEffects, {
        positions: positionsMeta?.positions || beforeRigidState.positionsMeta?.positions || [],
        ministers: roster,
      })
      : rigidAppliedEffects;
    const guardedRigidEffects = normalizedRigidEffects ? sanitizeStoryEffects(normalizedRigidEffects) : normalizedRigidEffects;

    const rigidResult = runRigidTurn(getState(), { choiceId, choiceText: effectiveChoiceText, choiceHint, effects: guardedRigidEffects || effects });
    const systemNewsPatch = rigidResult.rejected
      ? {
        systemNewsToday: [
          ...(getState().systemNewsToday || []),
          {
            title: "刚性规则拦截",
            summary: rigidResult.message,
            tag: "警告",
            icon: "⚠",
          },
        ],
      }
      : {};
    setState({
      ...rigidResult.statePatch,
      lastChoiceId: choiceId,
      lastChoiceText: effectiveChoiceText || "",
      lastChoiceHint: choiceHint || null,
      currentStoryTurn: null,
      ...systemNewsPatch,
    });
    if (preparedChoice.consumed && !rigidResult.rejected) clearPendingPolicyEdictState();
    if (guardedRigidEffects) applyEffects(guardedRigidEffects);

    const beforeHostiles = Array.isArray(getState().hostileForces) ? getState().hostileForces.map((item) => ({ ...item })) : [];
    const rigidHostileTurn = resolveHostileForcesAfterChoice(
      getState(),
      effectiveChoiceText || "",
      guardedRigidEffects || {},
      getState().currentYear,
      getState().currentMonth
    );
    if (rigidHostileTurn) {
      setState(rigidHostileTurn.statePatch);
      if (rigidHostileTurn.effectsPatch) applyEffects(rigidHostileTurn.effectsPatch);
      if (rigidHostileTurn.prestigeDelta) {
        const current = getState();
        setState({ prestige: Math.max(0, Math.min(100, (current.prestige || 0) + rigidHostileTurn.prestigeDelta)) });
      }

      const hostileAfter = Array.isArray(rigidHostileTurn.statePatch?.hostileForces)
        ? rigidHostileTurn.statePatch.hostileForces
        : [];
      const beforeById = new Map(beforeHostiles.map((item) => [item.id, item]));
      const newlyDefeatedNames = hostileAfter
        .filter((item) => item?.id && item.isDefeated && !beforeById.get(item.id)?.isDefeated)
        .map((item) => item.name || item.id);

      if (newlyDefeatedNames.length) {
        const current = getState();
        const nextRigid = { ...(current.rigid || {}) };
        const anchor = createMemoryAnchor(nextRigid, {
          summary: `军事开拓结果：${newlyDefeatedNames.join("、")}已灭亡，相关故事线已闭锁。`,
        });
        appendMemoryAnchor(nextRigid, anchor);
        setState({ rigid: nextRigid });
      }
    }

    const afterRigidState = getState();
    const rigidDisplayDelta = computeRigidSettlementDelta(beforeRigidState, afterRigidState);

    pushCurrentTurnToHistory(beforeRigidState, { text: effectiveChoiceText || "", hint: choiceHint ?? undefined }, rigidDisplayDelta);

    const historyAfterTurn = Array.isArray(getState().storyHistory) ? [...getState().storyHistory] : [];
    const targetIndex = historyAfterTurn.findIndex((entry) => entry?.key === historyKey);
    if (targetIndex >= 0) {
      historyAfterTurn[targetIndex] = {
        ...historyAfterTurn[targetIndex],
        displayEffects: rigidDisplayDelta,
      };
    }

    setState({
      storyHistory: historyAfterTurn,
      rigid: {
        ...(getState().rigid || {}),
        lastSettlementDelta: rigidDisplayDelta,
      },
    });

    setState({ storyFacts: buildStoryFactsFromState(getState()) });
    if (typeof window !== "undefined") {
      const edictTarget = getEdictRerenderTarget();
      if (edictTarget) {
        const strictLlmTurnLoad = (beforeRigidState.config?.storyMode || "template") === "llm";
        const nextTurnRendered = await runCurrentTurn(
          edictTarget,
          strictLlmTurnLoad
            ? { suppressStoryError: true, requireLlmSuccess: true }
            : {}
        );
        if (strictLlmTurnLoad && nextTurnRendered === false) {
          setState(cloneStateSnapshot(rigidStateSnapshot));
          updateTopbarByState(getState());
          await runCurrentTurn(edictTarget);
          scrollEdictToLatest(edictTarget);
          showError("大模型本回合生成失败，未推进新回合，请稍后重试。");
          return;
        }
        scrollEdictToLatest(edictTarget);
      }
    }
    autoSaveIfEnabled();
    updateTopbarByState(getState());
    return;
  }

  const state = getState();
  const stateSnapshot = cloneStateSnapshot(state);
  const beforeTurnSnapshot = captureDisplayStateSnapshot(state);
  const positionsMeta = await getPositionsMeta();

  if (choiceId === "custom_edict") {
    const newlyFound = extractCustomPoliciesFromEdict(effectiveChoiceText || "", state.currentYear, state.currentMonth);
    if (newlyFound.length) {
      const mergedPolicies = mergeCustomPolicies(state.customPolicies, newlyFound);
      const fresh = mergedPolicies.filter((item) => !(state.customPolicies || []).some((old) => old.id === item.id));
      const policyNews = fresh.map((item) => ({
        title: "新国策设立",
        summary: `自拟诏书已将“${item.name}”纳入国策，季度结算将同步其长期影响。`,
        tag: "重要",
        icon: "📜",
      }));
      setState({
        customPolicies: mergedPolicies,
        systemNewsToday: [...(state.systemNewsToday || []), ...policyNews],
      });
    }
  }

  let appliedEffects = effects;
  const isLLMStoryMode = (state.config?.storyMode || "template") === "llm";
  if (choiceId === "custom_edict" && !effects && !isLLMStoryMode) {
    const estimated = estimateEffectsFromEdict(effectiveChoiceText || "");
    if (estimated) appliedEffects = estimated;
  }

  const roster = getAllCharacters(state);
  const derivedAppointmentEffects = deriveAppointmentEffectsFromText(effectiveChoiceText || "", {
    positions: positionsMeta?.positions || [],
    ministers: roster,
    currentAppointments: state.appointments || {},
  });

  if (derivedAppointmentEffects) {
    const base = appliedEffects && typeof appliedEffects === "object" ? { ...appliedEffects } : {};
    if (derivedAppointmentEffects.appointments) {
      base.appointments = {
        ...(base.appointments && typeof base.appointments === "object" ? base.appointments : {}),
        ...derivedAppointmentEffects.appointments,
      };
    }
    if (Array.isArray(derivedAppointmentEffects.appointmentDismissals)) {
      const currentDismissals = Array.isArray(base.appointmentDismissals) ? base.appointmentDismissals : [];
      base.appointmentDismissals = Array.from(new Set([...currentDismissals, ...derivedAppointmentEffects.appointmentDismissals]));
    }
    appliedEffects = base;
  }

  const estimatedClassicEffects = estimateEffectsFromEdict(`${effectiveChoiceText || ""}\n${choiceHint || ""}`);
  appliedEffects = mergeMissingEstimatedEffects(appliedEffects, estimatedClassicEffects);

  const normalizedAppointmentEffects = appliedEffects
    ? normalizeAppointmentEffects(appliedEffects, {
      positions: positionsMeta?.positions || state.positionsMeta?.positions || [],
      ministers: roster,
    })
    : appliedEffects;

  const progressedEffects = normalizedAppointmentEffects
    ? applyProgressionToChoiceEffects(normalizedAppointmentEffects, state, effectiveChoiceText || "")
    : normalizedAppointmentEffects;
  const effectiveEffects = progressedEffects ? scaleEffectsByExecution(progressedEffects, state) : progressedEffects;
  const guardedEffects = effectiveEffects ? sanitizeStoryEffects(effectiveEffects) : effectiveEffects;
  if (guardedEffects) applyEffects(guardedEffects);

  pushCurrentTurnToHistory(state, { text: effectiveChoiceText || "", hint: choiceHint ?? undefined }, guardedEffects);

  setState({
    lastChoiceId: choiceId,
    lastChoiceText: effectiveChoiceText || "",
    lastChoiceHint: choiceHint || null,
    currentStoryTurn: null,
  });
  if (preparedChoice.consumed) clearPendingPolicyEdictState();

  let nextMonth = (state.currentMonth || 1) + 1;
  let nextYear = state.currentYear || 1;
  if (nextMonth > 12) {
    nextMonth = 1;
    nextYear += 1;
  }

  setState({
    currentDay: (state.currentDay || 1) + 1,
    currentMonth: nextMonth,
    currentYear: nextYear,
    currentPhase: "morning",
  });

  const coreTurn = processCoreGameplayTurn(getState(), effectiveChoiceText || "", guardedEffects, nextYear, nextMonth);
  setState(coreTurn.statePatch);
  if (coreTurn.consequenceEffects) applyEffects(coreTurn.consequenceEffects);

  const hostileTurn = resolveHostileForcesAfterChoice(getState(), effectiveChoiceText || "", guardedEffects || {}, nextYear, nextMonth);
  if (hostileTurn) {
    setState(hostileTurn.statePatch);
    if (hostileTurn.effectsPatch) applyEffects(hostileTurn.effectsPatch);
    if (hostileTurn.prestigeDelta) {
      const current = getState();
      setState({ prestige: Math.max(0, Math.min(100, (current.prestige || 0) + hostileTurn.prestigeDelta)) });
    }
  }

  progressNaturalMinisterDeaths(nextYear, nextMonth);
  await progressKejuByMonth(nextYear, nextMonth);
  await progressWujuByMonth(nextYear, nextMonth);

  const quarterEffects = computeQuarterlyEffects(getState(), nextMonth);
  if (quarterEffects) {
    applyEffects(quarterEffects);
    const stateAfterQuarter = getState();
    const customPolicyCount = (stateAfterQuarter.customPolicies || []).length;
    const customBonus = quarterEffects._customPolicyBonus || null;
    const customPolicyNews = buildCustomPolicyQuarterNews(customPolicyCount, customBonus);
    if (customPolicyNews) {
      setState({
        systemNewsToday: [
          ...(stateAfterQuarter.systemNewsToday || []),
          customPolicyNews,
        ],
      });
    }
    setState({
      lastQuarterSettlement: {
        year: nextYear,
        month: nextMonth,
        effects: quarterEffects,
      },
    });
  } else {
    setState({ lastQuarterSettlement: null });
  }

  if (nextMonth === 12) {
    await remindVacantCourtPositionsYearEnd();
  }

  const agendaPatch = refreshQuarterAgendaByState(getState());
  setState(agendaPatch);
  setState({ storyFacts: buildStoryFactsFromState(getState()) });

  const stateAfterTurn = getState();
  const displayEffects = buildOutcomeDisplayDelta(beforeTurnSnapshot, captureDisplayStateSnapshot(stateAfterTurn));
  const historyAfterTurn = Array.isArray(stateAfterTurn.storyHistory) ? [...stateAfterTurn.storyHistory] : [];
  if (historyAfterTurn.length > 0) {
    const lastIndex = historyAfterTurn.length - 1;
    historyAfterTurn[lastIndex] = {
      ...historyAfterTurn[lastIndex],
      displayEffects,
    };
    setState({ storyHistory: historyAfterTurn });
  }

  if (typeof window !== "undefined") {
    const edictTarget = getEdictRerenderTarget();
    if (edictTarget) {
      const strictLlmTurnLoad = (state.config?.storyMode || "template") === "llm";
      const nextTurnRendered = await runCurrentTurn(
        edictTarget,
        strictLlmTurnLoad
          ? { suppressStoryError: true, requireLlmSuccess: true }
          : {}
      );
      if (strictLlmTurnLoad && nextTurnRendered === false) {
        setState(cloneStateSnapshot(stateSnapshot));
        updateTopbarByState(getState());
        await runCurrentTurn(edictTarget);
        scrollEdictToLatest(edictTarget);
        showError("大模型本回合生成失败，未推进新回合，请稍后重试。");
        return;
      }
      scrollEdictToLatest(edictTarget);
    }
  }

  autoSaveIfEnabled();
  updateTopbarByState(getState());
}

function applyMonthlyIncome() {
  const state = getState();
  const nation = { ...(state.nation || {}) };
  const provinceStats = state.provinceStats || {};
  const provinces = Object.values(provinceStats);
  if (!provinces.length) return;

  let rawSilver = 0;
  let rawGrain = 0;
  let sumCorruption = 0;
  let count = 0;

  provinces.forEach((province) => {
    if (!province) return;
    rawSilver += province.taxSilver || 0;
    rawGrain += province.taxGrain || 0;
    sumCorruption += typeof province.corruption === "number" ? province.corruption : 0;
    count += 1;
  });

  if (!count) return;
  const avgCorruption = sumCorruption / count;
  const effectiveRate = Math.max(0, 1 - avgCorruption / 100);

  nation.treasury = Math.max(0, (nation.treasury || 0) + Math.round(rawSilver * effectiveRate));
  nation.grain = Math.max(0, (nation.grain || 0) + Math.round(rawGrain * effectiveRate));

  setState({ nation });
}
