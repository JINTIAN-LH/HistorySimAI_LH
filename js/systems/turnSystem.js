import { getState, setState } from "../state.js";
import { renderStoryTurn, pushCurrentTurnToHistory, applyEffects, estimateEffectsFromEdict } from "./storySystem.js";
import { autoSaveIfEnabled } from "../storage.js";
import { updateTopbarByState } from "../layout.js";
import { applyProgressionToChoiceEffects, extractCustomPoliciesFromEdict, mergeCustomPolicies, processCoreGameplayTurn, resolveHostileForcesAfterChoice, scaleEffectsByExecution } from "./coreGameplaySystem.js";
import { sanitizeStoryEffects } from "../api/validators.js";
import { loadJSON } from "../dataLoader.js";
import { buildOutcomeDisplayDelta, captureDisplayStateSnapshot } from "../utils/displayStateMetrics.js";
import { deriveAppointmentEffectsFromText, normalizeAppointmentEffects } from "../utils/appointmentEffects.js";
import { advanceKejuSession, advanceWujuSession, getKejuStateSnapshot, getWujuStateSnapshot, resetKejuForNextCycle, resetWujuForNextCycle } from "./kejuSystem.js";
import { buildStoryFactsFromState } from "../utils/storyFacts.js";
import { getAbsoluteYearForEraYear } from "../utils/eraYear.js";
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

async function remindVacantCourtPositionsYearEnd() {
  const state = getState();
  const meta = await getPositionsMeta();
  const positions = Array.isArray(meta?.positions) ? meta.positions : [];
  if (!positions.length) return;

  const appointments = { ...(state.appointments || {}) };

  const vacancies = positions
    .filter((p) => p && p.id && !appointments[p.id])
    .sort((a, b) => {
      const rankA = typeof a.rank === "number" ? a.rank : 99;
      const rankB = typeof b.rank === "number" ? b.rank : 99;
      return rankA - rankB;
    });

  if (!vacancies.length) return;
  const summary = vacancies.slice(0, 5).map((pos) => pos.name || pos.id).join("、");

  setState({
    systemNewsToday: [
      ...(state.systemNewsToday || []),
      {
        title: "岁末吏部提醒补官",
        summary: `当前有 ${vacancies.length} 个官职空缺（如：${summary}${vacancies.length > 5 ? "等" : ""}），请于年终自行任命以稳朝局。`,
        tag: "重",
        icon: "📝",
      },
    ],
  });
}

function progressNaturalMinisterDeaths(nextYear, nextMonth) {
  // Natural deaths are evaluated quarterly to avoid over-dense monthly losses.
  if ((Number(nextMonth) || 1) % 3 !== 0) return;

  const state = getState();
  const ministers = Array.isArray(state.ministers) ? state.ministers : [];
  if (!ministers.length) return;

  const absoluteYear = getAbsoluteYearForEraYear(nextYear || 1, state.config);
  const characterStatus = { ...(state.characterStatus || {}) };
  const appointments = { ...(state.appointments || {}) };
  const deathList = [];

  ministers.forEach((m) => {
    if (!m || !m.id) return;
    if (!isAliveCharacter(state, m.id)) return;
    if (typeof m.deathYear !== "number") return;

    // 延缓自然死亡：默认在史实卒年后增加 2 年缓冲，再进入缓慢概率触发。
    const delayedStartYear = m.deathYear + 2;
    if (absoluteYear < delayedStartYear) return;

    // Guardrail: do not trigger natural death too early for younger characters.
    if (typeof character.birthYear === "number") {
      const age = absoluteYear - character.birthYear;
      if (age < 58) return;
    }

    const yearsPast = absoluteYear - delayedStartYear;
    const quarterlyChance = Math.min(0.015 + yearsPast * 0.008, 0.12);
    if (Math.random() >= quarterlyChance) return;

    const current = characterStatus[m.id] || {};
    characterStatus[m.id] = {
      ...current,
      isAlive: false,
      deathReason: current.deathReason || "寿终病逝",
      deathDay: nextMonth || 1,
      deathYear: nextYear || 1,
    };
    for (const [posId, holderId] of Object.entries(appointments)) {
      if (holderId === m.id) {
        delete appointments[posId];
      }
    }
    deathList.push(m.name || m.id);
  });

  if (!deathList.length) return;

  const news = {
    title: "群臣讣告",
    summary: `${deathList.join("、")} 因年老病逝，相关官职已出缺。`,
    tag: "重",
    icon: "⚱️",
  };

  setState({
    characterStatus,
    appointments,
    systemNewsToday: [...(state.systemNewsToday || []), news],
  });
}

function resetPublishedExamCyclesForMonth() {
  const state = getState();
  const nextPatch = {};
  const kejuSnapshot = getKejuStateSnapshot(state);
  const wujuSnapshot = getWujuStateSnapshot(state);

  if (kejuSnapshot.stage === "published") {
    nextPatch.keju = resetKejuForNextCycle(
      kejuSnapshot,
      "上届科举已毕，礼部按月重置考务，等待重新开科。"
    );
  }

  if (wujuSnapshot.stage === "published") {
    nextPatch.wuju = resetWujuForNextCycle(
      wujuSnapshot,
      "上届武举已毕，兵部按月重置考务，等待重新开科。"
    );
  }

  if (Object.keys(nextPatch).length) {
    setState(nextPatch);
  }
}

function grantQuarterlyProgressPoints(nextMonth) {
  if ((Number(nextMonth) || 1) % 3 !== 0) return;

  const state = getState();
  const currentAbilityPoints = Number.isFinite(Number(state.abilityPoints))
    ? Number(state.abilityPoints)
    : 0;
  const currentPolicyPoints = Number.isFinite(Number(state.policyPoints))
    ? Number(state.policyPoints)
    : 0;

  setState({
    abilityPoints: currentAbilityPoints + 1,
    policyPoints: currentPolicyPoints + 1,
  });
}

export function runCurrentTurn(container, options = {}) {
  const state = getState();
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
        tag: "重",
        icon: "🏛️",
      }));
      setState({
        customPolicies: mergedPolicies,
        systemNewsToday: [...(state.systemNewsToday || []), ...policyNews],
      });
    }
  }

  // 如果是自拟诏书，优先根据文本做一个简单的效果预估，让数值立刻能体现变化
  let appliedEffects = effects;
  const isLLMStoryMode = (state.config?.storyMode || "template") === "llm";
  if (choiceId === "custom_edict" && !effects && !isLLMStoryMode) {
    const estimated = estimateEffectsFromEdict(effectiveChoiceText || "");
    if (estimated) appliedEffects = estimated;
  }

  const roster = getAllCharacters(state);
  const derivedAppointmentEffects = deriveAppointmentEffectsFromText(effectiveChoiceText || "", {
    positions: positionsMeta?.positions || [],
    ministers: state.ministers || [],
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
      ministers: state.ministers || [],
    })
    : appliedEffects;

  const progressedEffects = normalizedAppointmentEffects
    ? applyProgressionToChoiceEffects(normalizedAppointmentEffects, state, effectiveChoiceText || "")
    : normalizedAppointmentEffects;
  const effectiveEffects = progressedEffects ? scaleEffectsByExecution(progressedEffects, state) : progressedEffects;
  const guardedEffects = effectiveEffects ? sanitizeStoryEffects(effectiveEffects) : effectiveEffects;
  if (guardedEffects) {
    applyEffects(guardedEffects);
  }

  pushCurrentTurnToHistory(state, { text: effectiveChoiceText || "", hint: choiceHint ?? undefined }, guardedEffects);

  setState({
    lastChoiceId: choiceId,
    lastChoiceText: effectiveChoiceText || "",
    lastChoiceHint: choiceHint || null,
    currentStoryTurn: null,
  });
  if (preparedChoice.consumed) clearPendingPolicyEdictState();

  // 每一轮代表一个月（按 state.currentMonth/Year 走），并且每12个月增长一年
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
    currentPhase: "morning", // 保持单一阶段展示
  });

  const coreTurn = processCoreGameplayTurn(getState(), effectiveChoiceText || "", guardedEffects, nextYear, nextMonth);
  setState(coreTurn.statePatch);
  if (coreTurn.consequenceEffects) {
    applyEffects(coreTurn.consequenceEffects);
  }

  const hostileTurn = resolveHostileForcesAfterChoice(getState(), effectiveChoiceText || "", guardedEffects || {}, nextYear, nextMonth);
  if (hostileTurn) {
    setState(hostileTurn.statePatch);
    if (hostileTurn.effectsPatch) {
      applyEffects(hostileTurn.effectsPatch);
    }
    if (hostileTurn.prestigeDelta) {
      const s = getState();
      setState({ prestige: Math.max(0, Math.min(100, (s.prestige || 0) + hostileTurn.prestigeDelta)) });
    }
  }

  grantQuarterlyProgressPoints(nextMonth);

  progressNaturalMinisterDeaths(nextYear, nextMonth);

  if (nextMonth === 12) {
    await remindVacantCourtPositionsYearEnd();
  }

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

  provinces.forEach((p) => {
    if (!p) return;
    rawSilver += p.taxSilver || 0;
    rawGrain += p.taxGrain || 0;
    sumCorruption += typeof p.corruption === "number" ? p.corruption : 0;
    count += 1;
  });

  if (!count) return;
  const avgCorruption = sumCorruption / count;
  const effectiveRate = Math.max(0, 1 - avgCorruption / 100);

  const silverIncome = Math.max(0, Math.round(rawSilver * effectiveRate));
  const grainIncome = Math.max(0, Math.round(rawGrain * effectiveRate));

  nation.treasury = Math.max(0, (nation.treasury || 0) + silverIncome);
  nation.grain = Math.max(0, (nation.grain || 0) + grainIncome);

  setState({ nation });
}
