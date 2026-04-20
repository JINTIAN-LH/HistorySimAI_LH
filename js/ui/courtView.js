import { router } from "../router.js";
import { getState, setState } from "../state.js";
import { updateMinisterTabBadge, updateTopbarByState } from "../layout.js";
import { loadJSON } from "../dataLoader.js";
import { getLoyaltyTags, getLoyaltyStage, getLoyaltyColor, getFactionClass } from "../systems/courtSystem.js";
import { requestMinisterReply } from "../api/ministerChat.js";
import { getApiBase, shouldUseLlmProxy } from "../api/httpClient.js";
import { AVAILABLE_AVATAR_NAMES, buildNameById } from "../utils/sharedConstants.js";
import { showError, showSuccess } from "../utils/toast.js";
import { applyEffects as applyEffectsModule } from "../utils/effectsProcessor.js";
import { mergeDerivedAppointmentStateEffects, normalizeAppointmentEffects } from "../utils/appointmentEffects.js";
import { buildOutcomeDisplayDelta, captureDisplayStateSnapshot, hasOutcomeDisplayDelta, renderOutcomeDisplayCard } from "../utils/displayStateMetrics.js";
import { KEJU_STAGE_LABELS, WUJU_STAGE_LABELS, advanceKejuSession, advanceWujuSession, appendTalentReserve, appendWujuTalentReserve, applyKejuAppointLoyaltyBonus, getKejuStateSnapshot, getSeasonLabelByMonth, getWujuStateSnapshot, mergeKejuState, mergeWujuState } from "../systems/kejuSystem.js";
import { deriveCharacterArchetypes } from "../utils/characterArchetype.js";
import { getAppointedCharactersFromState, getKnownCharactersFromState } from "../utils/characterRegistry.js";
import { createActionButton, createElement, createFeedCard, createGameplayPageTemplate, createOverlayPanel, createSectionCard, createStatCard, createTag } from "./viewPrimitives.js";
import { renderTalentView, ensureTalentViewDataLoaded } from "./talentView.js";
import { renderPolicyView } from "./policyView.js";
import { formatEraTimeByRelativeYear } from "../worldview/worldviewRuntimeAccessor.js";

let currentMinisterChatId = null;
let tagsConfigCache = null;
let factionsCache = null;
let positionsCache = null;
const sendingFlags = {};
let appointUIState = {
  mode: null,
  positionId: null,
  ministerId: null,
  keyword: "",
  selectedId: null,
};

const courtDeptUIState = {
  expandedDeptId: null,
  touchStartX: 0,
  touchStartY: 0,
  swipeHintVisible: false,
  swipeHintDismissed: false,
  swipeHintTimer: null,
};

const courtModuleUIState = {
  expandedModuleId: 'neige',
  expandedDeptId: null
};

const COURT_SWIPE_HINT_STORAGE_KEY = "courtSwipeHintSeenV1";

function useLegacyLayoutForContainer(container) {
  return container?.dataset?.legacyLayout === "true";
}

function getCourtRenderContainer(preferredContainer = null) {
  return document.getElementById("court-legacy-root")
    || preferredContainer
    || document.getElementById("main-view")
    || document.getElementById("view-container");
}

function rerenderCourtLegacyView(preferredContainer = null) {
  const container = getCourtRenderContainer(preferredContainer);
  if (!container) return;
  container.innerHTML = "";
  renderCourtInteractiveView(container, {
    useLegacyLayout: useLegacyLayoutForContainer(container) || container.id === "court-legacy-root",
  });
}

export async function ensureCourtViewDataLoaded() {
  if (!tagsConfigCache) {
    tagsConfigCache = await getLoyaltyTags();
  }
  if (!factionsCache) {
    try {
      factionsCache = await loadJSON("data/factions.json");
    } catch (e) {
      factionsCache = { factions: [] };
    }
  }
  if (!positionsCache) {
    try {
      positionsCache = await loadJSON("data/positions.json");
    } catch (e) {
      positionsCache = { positions: [], departments: [], modules: [] };
    }
  }
}

export function getCourtTagsConfig() {
  return tagsConfigCache;
}

function patchKejuState(partial) {
  const state = getState();
  setState({
    keju: mergeKejuState(state, partial),
  });
}

function patchWujuState(partial) {
  const state = getState();
  setState({
    wuju: mergeWujuState(state, partial),
  });
}

function getAllCharactersFromState(state) {
  return getKnownCharactersFromState(state);
}

function getCourtMinistersFromState(state) {
  return getAppointedCharactersFromState(state);
}

function getActiveAppointmentHolderCount(state) {
  const appointments = state?.appointments && typeof state.appointments === "object"
    ? state.appointments
    : {};
  const allCharacters = getAllCharactersFromState(state);
  const validIds = new Set(allCharacters.map((c) => c?.id).filter((id) => typeof id === "string" && id));
  const aliveStatus = state?.characterStatus || {};
  const holders = new Set();
  Object.values(appointments).forEach((id) => {
    if (typeof id !== "string" || !id) return;
    if (!validIds.has(id)) return;
    if (aliveStatus[id]?.isAlive === false) return;
    holders.add(id);
  });
  return holders.size;
}

function buildAppointmentPatch(state, positionId, characterId) {
  const nextAppointments = { ...(state.appointments || {}) };
  for (const [posId, holderId] of Object.entries(nextAppointments)) {
    if (holderId === characterId) {
      delete nextAppointments[posId];
    }
  }
  nextAppointments[positionId] = characterId;
  return { appointments: nextAppointments };
}

function promoteGeneratedCandidate(state, characterId) {
  const generatedKeju = Array.isArray(state?.keju?.generatedCandidates) ? state.keju.generatedCandidates : [];
  const generatedWuju = Array.isArray(state?.wuju?.generatedCandidates) ? state.wuju.generatedCandidates : [];
  const candidate = [...generatedKeju, ...generatedWuju].find((item) => item?.id === characterId);
  if (!candidate) return {};
  const allCharacters = Array.isArray(state?.allCharacters) ? state.allCharacters : [];
  if (allCharacters.some((item) => item?.id === characterId)) return {};
  return {
    allCharacters: [...allCharacters, { ...candidate }],
  };
}

function getCharacterLoyaltyValue(state, character) {
  const loyaltyMap = state?.loyalty || {};
  if (!character?.id) return 0;
  const value = loyaltyMap[character.id];
  if (typeof value === "number") return value;
  return Number(character.loyalty || 30);
}

function filterAndSortCharactersForAppointment(characters, state, filterText = "", traitFilter = "all", sortMode = "default") {
  const keyword = String(filterText || "").trim();
  let list = Array.isArray(characters) ? characters.slice() : [];
  if (keyword) {
    list = list.filter((item) => {
      const name = String(item?.name || "");
      const courtesyName = String(item?.courtesyName || "");
      return name.includes(keyword) || courtesyName.includes(keyword);
    });
  }

  if (traitFilter !== "all") {
    list = list.filter((item) => {
      const archetypes = deriveCharacterArchetypes(item);
      if (traitFilter === "scholar") return archetypes.has("scholar");
      if (traitFilter === "warrior") return archetypes.has("warrior");
      if (traitFilter === "both") return archetypes.has("scholar") && archetypes.has("warrior");
      return true;
    });
  }

  if (sortMode === "loyalty_desc") {
    list.sort((a, b) => getCharacterLoyaltyValue(state, b) - getCharacterLoyaltyValue(state, a));
  } else if (sortMode === "loyalty_asc") {
    list.sort((a, b) => getCharacterLoyaltyValue(state, a) - getCharacterLoyaltyValue(state, b));
  }

  return list;
}

function createDismissibleOverlayPanel({
  overlayId,
  title,
  subtitle = "",
  overlayClassName = "",
  panelClassName = "",
  bodyClassName = "",
  footerClassName = "",
  closeLabel = "✕",
} = {}) {
  let overlayRef = null;
  const close = () => {
    if (overlayRef) overlayRef.remove();
  };
  const panel = createOverlayPanel({
    overlayId,
    overlayClassName,
    panelClassName,
    title,
    subtitle,
    bodyClassName,
    footerClassName,
    closeLabel,
    onClose: close,
  });
  overlayRef = panel.overlay;
  panel.overlay.addEventListener("click", (event) => {
    if (event.target === panel.overlay) close();
  });
  return { ...panel, close };
}

function createOverlayFooterButton(text, onClick, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className || "relationship-panel-card__footer-close";
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

export async function showKejuPanel() {
  const app = document.getElementById("app");
  if (!app) return;

  const currentState = getState();
  const kejuState = getKejuStateSnapshot(currentState);

  const existing = document.getElementById("keju-panel-overlay");
  if (existing) existing.remove();
  const panel = createDismissibleOverlayPanel({
    overlayId: "keju-panel-overlay",
    title: "科举大典",
    subtitle: "统一弹窗骨架后，文官选拔、待录用推荐与后续人才系统都走同一套面板结构。",
    panelClassName: "keju-panel-card",
    bodyClassName: "keju-panel-body",
  });
  const { overlay, body, footer, close } = panel;

  const season = getSeasonLabelByMonth(Number(currentState.currentMonth) || 1);
  const stageLabel = KEJU_STAGE_LABELS[kejuState.stage] || KEJU_STAGE_LABELS.idle;

  const summary = document.createElement("div");
  summary.className = "keju-summary";
  const eraTime = formatEraTimeByRelativeYear(currentState, currentState.currentYear || 1, currentState.currentMonth || 1);
  summary.innerHTML = `
    <div class="keju-summary__meta">${eraTime} · ${season}</div>
    <div class="keju-summary__meta">当前阶段：${stageLabel}</div>
    <div class="keju-summary__meta">在册考生：${kejuState.candidatePool.length} 人</div>
    <div class="keju-summary__meta">礼部科举声望：${kejuState.bureauMomentum}</div>
    <div class="keju-summary__meta">人才储备质量：${kejuState.reserveQuality}</div>
    <div class="keju-summary__note">科举模块当前仅提供人才选拔与推荐，不自动任命，不推进回合。</div>
  `;

  const steps = document.createElement("div");
  steps.className = "keju-steps";
  const stageOrder = ["xiangshi", "huishi", "dianshi"];
  stageOrder.forEach((stage, idx) => {
    const step = document.createElement("div");
    step.className = "keju-step";
    const active = stageOrder.indexOf(kejuState.stage) >= idx || kejuState.stage === "published";
    if (active) step.classList.add("is-active");
    step.textContent = `${idx + 1}. ${KEJU_STAGE_LABELS[stage].replace("进行中", "")}`;
    steps.appendChild(step);
  });

  const actions = document.createElement("div");
  actions.className = "keju-actions";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "keju-btn keju-btn--primary";
  if (kejuState.stage === "idle") {
    nextBtn.textContent = "开启乡试";
  } else if (kejuState.stage === "xiangshi") {
    nextBtn.textContent = "执行会试遴选";
  } else if (kejuState.stage === "huishi") {
    nextBtn.textContent = "执行殿试遴选";
  } else if (kejuState.stage === "dianshi") {
    nextBtn.textContent = "放榜";
  } else {
    nextBtn.textContent = "本科已放榜";
    nextBtn.disabled = true;
  }

  nextBtn.addEventListener("click", async () => {
    const latestState = getState();
    const latestKeju = getKejuStateSnapshot(latestState);
    const nextKeju = advanceKejuSession(
      latestKeju,
      { state: latestState, characters: getAllCharactersFromState(latestState) },
      { formatName: getDisplayName, isAliveCharacter, enableGeneratedCandidates: true }
    );
    patchKejuState(nextKeju);
    if (latestKeju.stage === "idle") {
      showSuccess("乡试已开启，考生名单已入册。", 1800);
    } else if (latestKeju.stage === "xiangshi") {
      showSuccess("会试候选名单已生成。", 1800);
    } else if (latestKeju.stage === "huishi") {
      showSuccess("殿试候选名单已生成。", 1800);
    } else if (latestKeju.stage === "dianshi") {
      showSuccess("殿试放榜完成。", 1800);
    }
    showKejuPanel();
  });

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "keju-btn keju-btn--ghost";
  resetBtn.textContent = "重开本届";
  resetBtn.addEventListener("click", () => {
    patchKejuState({
      stage: "idle",
      candidatePool: [],
      publishedList: [],
      generatedCandidates: [],
      bureauMomentum: 52,
      reserveQuality: 0,
      talentReserve: [],
      note: "",
    });
    showKejuPanel();
  });

  actions.appendChild(nextBtn);
  actions.appendChild(resetBtn);

  if (kejuState.stage === "published" && kejuState.publishedList.length) {
    const reserveBtn = document.createElement("button");
    reserveBtn.type = "button";
    reserveBtn.className = "keju-btn keju-btn--ghost";
    reserveBtn.textContent = "加入待录用名单";
    reserveBtn.addEventListener("click", async () => {
      if (!positionsCache) {
        try {
          positionsCache = await loadJSON("data/positions.json");
        } catch (_e) {
          positionsCache = { positions: [], departments: [] };
        }
      }
      const latestState = getState();
      const latestKeju = getKejuStateSnapshot(latestState);
      patchKejuState({
        talentReserve: appendTalentReserve(
          latestKeju,
          positionsCache,
          latestState.appointments || {},
          latestState.currentYear || 1,
          latestState.currentMonth || 1
        ),
        note: "前三甲已加入待录用名单（仅记录，不自动任命）。",
      });
      showSuccess("已写入待录用名单。", 1800);
      showKejuPanel();
    });
    actions.appendChild(reserveBtn);
  }

  const list = document.createElement("div");
  list.className = "keju-candidate-list";
  const candidates = kejuState.candidatePool;
  if (!candidates.length) {
    const empty = document.createElement("div");
    empty.className = "keju-empty";
    empty.textContent = "尚未开科。点击“开启乡试”生成本届考生。";
    list.appendChild(empty);
  } else {
    candidates.forEach((candidate, idx) => {
      const row = document.createElement("div");
      row.className = "keju-candidate-row";
      if (kejuState.stage === "published" && idx < 3) {
        row.classList.add("is-top");
      }
      const rankLabel = kejuState.stage === "published"
        ? (idx === 0 ? "状元" : idx === 1 ? "榜眼" : idx === 2 ? "探花" : `${idx + 1}`)
        : `第${idx + 1}名`;
      row.innerHTML = `
        <div class="keju-candidate-row__rank">${rankLabel}</div>
        <div class="keju-candidate-row__main">
          <div class="keju-candidate-row__name">${candidate.name}</div>
          <div class="keju-candidate-row__meta">${candidate.factionLabel || "无党籍"} · 文采 ${candidate.literary} · 德行 ${candidate.morality} · 潜力 ${candidate.potential} · 总评 ${candidate.total}</div>
        </div>
      `;
      list.appendChild(row);
    });
  }

  const reserve = document.createElement("div");
  reserve.className = "keju-reserve";
  const reserveList = Array.isArray(kejuState.talentReserve) ? kejuState.talentReserve : [];
  if (!reserveList.length) {
    reserve.textContent = "待录用名单：暂无";
  } else {
    const reserveTitle = document.createElement("div");
    reserveTitle.className = "keju-reserve__title";
    reserveTitle.textContent = "待录用名单";
    reserve.appendChild(reserveTitle);

    reserveList.forEach((item) => {
      const row = document.createElement("div");
      row.className = "keju-reserve-row";

      const meta = document.createElement("div");
      meta.className = "keju-reserve-row__meta";
      meta.textContent = `${item.candidateName} → ${item.positionName}`;

      const actionWrap = document.createElement("div");
      actionWrap.className = "keju-reserve-row__actions";

      const appointBtn = document.createElement("button");
      appointBtn.type = "button";
      appointBtn.className = "keju-btn keju-btn--ghost keju-reserve-row__appoint";
      appointBtn.textContent = item.positionId ? "任命" : "待定";
      if (!item.positionId || (currentState.appointments || {})[item.positionId]) {
        appointBtn.disabled = true;
      }

      appointBtn.addEventListener("click", async () => {
        if (!item.positionId) return;
        const latestState = getState();
        if ((latestState.appointments || {})[item.positionId]) {
          showError("该官职已有人在任，请重新生成推荐名单。", 2200);
          showKejuPanel();
          return;
        }
        if (!isAliveCharacter(latestState, item.candidateId)) {
          showError("该人物已故，无法任命。", 2200);
          return;
        }
        appointBtn.disabled = true;
        appointBtn.textContent = "任命中...";
        try {
          const result = await requestAppoint(item.positionId, item.candidateId);
          if (result?.success === false) {
            showError(`任命失败: ${result.error || "未知错误"}`);
            showKejuPanel();
            return;
          }
          const appointmentEffects = buildAppointmentOutcomeEffects(latestState, result?.appointments, result?.effects);
          const nextNation = applyEffectsModule(latestState.nation || {}, appointmentEffects, latestState.loyalty || {}).nation;
          const appointmentPatch = buildAppointmentPatch(latestState, item.positionId, item.candidateId);
          const loyaltyWithBonus = applyKejuAppointLoyaltyBonus(latestState.loyalty || {}, item.candidateId, 6);
          const updatedReserve = reserveList.filter((entry) => entry.candidateId !== item.candidateId);
          const currentSnapshot = getKejuStateSnapshot(getState());
          setState({
            ...appointmentPatch,
            ...promoteGeneratedCandidate(latestState, item.candidateId),
            nation: nextNation,
            loyalty: loyaltyWithBonus,
            keju: mergeKejuState(getState(), {
              talentReserve: updatedReserve,
              bureauMomentum: Math.min(100, (currentSnapshot.bureauMomentum || 0) + 1),
              note: `${item.candidateName} 已授 ${item.positionName}，忠诚度提升。`,
            }),
          });
          showSuccess("科举入仕已生效。", 1800);
          showKejuPanel();
          rerenderCourtMainView();
        } catch (error) {
          showError(`任命失败: ${error.message}`);
          showKejuPanel();
        }
      });

      const adjustBtn = document.createElement("button");
      adjustBtn.type = "button";
      adjustBtn.className = "keju-btn keju-btn--ghost keju-reserve-row__adjust";
      adjustBtn.textContent = "调岗推荐";
      adjustBtn.addEventListener("click", () => {
        const latestState = getState();
        if (!isAliveCharacter(latestState, item.candidateId)) {
          showError("该人物已故，无法调岗。", 2200);
          return;
        }
          close();
        openInlineAppointByMinister(item.candidateId);
      });

      row.appendChild(meta);
      actionWrap.appendChild(appointBtn);
      actionWrap.appendChild(adjustBtn);
      row.appendChild(actionWrap);
      reserve.appendChild(row);
    });
  }

  const note = document.createElement("div");
  note.className = "keju-note";
  note.textContent = kejuState.note || "";

  body.appendChild(summary);
  body.appendChild(steps);
  body.appendChild(actions);
  body.appendChild(list);
  body.appendChild(reserve);
  body.appendChild(note);

  footer.appendChild(createOverlayFooterButton("关闭", close));
  app.appendChild(overlay);
}

export async function showWujuPanel() {
  const app = document.getElementById("app");
  if (!app) return;

  const currentState = getState();
  const wujuState = getWujuStateSnapshot(currentState);

  const existing = document.getElementById("wuju-panel-overlay");
  if (existing) existing.remove();
  const panel = createDismissibleOverlayPanel({
    overlayId: "wuju-panel-overlay",
    title: "武举",
    subtitle: "统一朝堂人才弹窗骨架，武举与科举共享同类信息布局与操作区。",
    panelClassName: "keju-panel-card",
    bodyClassName: "keju-panel-body",
  });
  const { overlay, body, footer, close } = panel;

  const stageLabel = WUJU_STAGE_LABELS[wujuState.stage] || WUJU_STAGE_LABELS.idle;
  const summary = document.createElement("div");
  summary.className = "keju-summary";
  summary.innerHTML = `
    <div class="keju-summary__meta">当前阶段：${stageLabel}</div>
    <div class="keju-summary__meta">候选武人：${wujuState.candidatePool.length} 人</div>
    <div class="keju-summary__meta">武举声望：${wujuState.bureauMomentum}</div>
    <div class="keju-summary__meta">人才储备质量：${wujuState.reserveQuality}</div>
    <div class="keju-summary__note">武举仅进行会试，放榜只取一名武状元，并推荐至内廷/地方/军事官缺。</div>
  `;

  const actions = document.createElement("div");
  actions.className = "keju-actions";
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "keju-btn keju-btn--primary";
  nextBtn.textContent = wujuState.stage === "idle" ? "开启武会试" : (wujuState.stage === "huishi" ? "武举放榜" : "本届已放榜");
  nextBtn.disabled = wujuState.stage === "published";
  nextBtn.addEventListener("click", () => {
    const latestState = getState();
    const latestWuju = getWujuStateSnapshot(latestState);
    const nextWuju = advanceWujuSession(
      latestWuju,
      { state: latestState, characters: getAllCharactersFromState(latestState) },
      { formatName: getDisplayName, isAliveCharacter, enableGeneratedCandidates: true }
    );
    patchWujuState(nextWuju);
    showWujuPanel();
  });
  actions.appendChild(nextBtn);

  if (wujuState.stage === "published" && wujuState.publishedList.length) {
    const reserveBtn = document.createElement("button");
    reserveBtn.type = "button";
    reserveBtn.className = "keju-btn keju-btn--ghost";
    reserveBtn.textContent = "加入待录用名单";
    reserveBtn.addEventListener("click", async () => {
      if (!positionsCache) {
        try {
          positionsCache = await loadJSON("data/positions.json");
        } catch (_e) {
          positionsCache = { positions: [], departments: [] };
        }
      }
      const latestState = getState();
      const latestWuju = getWujuStateSnapshot(latestState);
      patchWujuState({
        talentReserve: appendWujuTalentReserve(
          latestWuju,
          positionsCache,
          latestState.appointments || {},
          latestState.currentYear || 1,
          latestState.currentMonth || 1
        ),
        note: "武状元已加入待录用名单（仅记录，不自动任命）。",
      });
      showWujuPanel();
    });
    actions.appendChild(reserveBtn);
  }

  const list = document.createElement("div");
  list.className = "keju-candidate-list";
  if (!wujuState.candidatePool.length) {
    const empty = document.createElement("div");
    empty.className = "keju-empty";
    empty.textContent = "尚未开武举。";
    list.appendChild(empty);
  } else {
    wujuState.candidatePool.forEach((candidate, idx) => {
      const row = document.createElement("div");
      row.className = "keju-candidate-row";
      const rankLabel = wujuState.stage === "published" && idx === 0 ? "武状元" : `第 ${idx + 1} 名`;
      row.innerHTML = `
        <div class="keju-candidate-row__rank">${rankLabel}</div>
        <div class="keju-candidate-row__main">
          <div class="keju-candidate-row__name">${candidate.name}</div>
          <div class="keju-candidate-row__meta">${candidate.factionLabel || "无党籍"} · 武力 ${candidate.force} · 统率 ${candidate.command} · 军纪 ${candidate.discipline} · 总评 ${candidate.total}</div>
        </div>
      `;
      list.appendChild(row);
    });
  }

  const reserve = document.createElement("div");
  reserve.className = "keju-reserve";
  const reserveList = Array.isArray(wujuState.talentReserve) ? wujuState.talentReserve : [];
  if (!reserveList.length) {
    reserve.textContent = "待录用名单：暂无";
  } else {
    const reserveTitle = document.createElement("div");
    reserveTitle.className = "keju-reserve__title";
    reserveTitle.textContent = "待录用名单";
    reserve.appendChild(reserveTitle);
    reserveList.forEach((item) => {
      const row = document.createElement("div");
      row.className = "keju-reserve-row";
      const meta = document.createElement("div");
      meta.className = "keju-reserve-row__meta";
      meta.textContent = `${item.candidateName} → ${item.positionName}`;
      const actionWrap = document.createElement("div");
      actionWrap.className = "keju-reserve-row__actions";
      const appointBtn = document.createElement("button");
      appointBtn.type = "button";
      appointBtn.className = "keju-btn keju-btn--ghost keju-reserve-row__appoint";
      appointBtn.textContent = item.positionId ? "任命" : "待定";
      if (!item.positionId || (currentState.appointments || {})[item.positionId]) appointBtn.disabled = true;
      appointBtn.addEventListener("click", async () => {
        if (!item.positionId) return;
        const latestState = getState();
        if ((latestState.appointments || {})[item.positionId]) {
          showError("该官职已有人在任，请重新生成名单。", 2200);
          showWujuPanel();
          return;
        }
        const result = await requestAppoint(item.positionId, item.candidateId);
        if (result?.success === false) {
          showError(`任命失败: ${result.error || "未知错误"}`);
          return;
        }
        const appointmentEffects = buildAppointmentOutcomeEffects(latestState, result?.appointments, result?.effects);
        const nextNation = applyEffectsModule(latestState.nation || {}, appointmentEffects, latestState.loyalty || {}).nation;
        const updatedReserve = reserveList.filter((entry) => entry.candidateId !== item.candidateId);
        const snapshot = getWujuStateSnapshot(getState());
        setState({
          ...buildAppointmentPatch(latestState, item.positionId, item.candidateId),
          ...promoteGeneratedCandidate(latestState, item.candidateId),
          nation: nextNation,
          loyalty: applyKejuAppointLoyaltyBonus(latestState.loyalty || {}, item.candidateId, 8),
          wuju: mergeWujuState(getState(), {
            talentReserve: updatedReserve,
            bureauMomentum: Math.min(100, (snapshot.bureauMomentum || 0) + 1),
            note: `${item.candidateName} 已授 ${item.positionName}。`,
          }),
        });
        showWujuPanel();
        rerenderCourtMainView();
      });
      actionWrap.appendChild(appointBtn);
      row.appendChild(meta);
      row.appendChild(actionWrap);
      reserve.appendChild(row);
    });
  }

  const note = document.createElement("div");
  note.className = "keju-note";
  note.textContent = wujuState.note || "";

  body.appendChild(summary);
  body.appendChild(actions);
  body.appendChild(list);
  body.appendChild(reserve);
  body.appendChild(note);

  footer.appendChild(createOverlayFooterButton("关闭", close));
  app.appendChild(overlay);
}

export async function showTalentPanel() {
  const app = document.getElementById("app");
  if (!app) return;

  const existing = document.getElementById("talent-panel-overlay");
  if (existing) existing.remove();

  await ensureTalentViewDataLoaded();

  const panel = createDismissibleOverlayPanel({
    overlayId: "talent-panel-overlay",
    title: "人才储备",
    subtitle: "延揽招募与职位任用，同科举武举共用弹窗结构。",
    panelClassName: "keju-panel-card",
    bodyClassName: "keju-panel-body",
  });
  const { overlay, body, footer, close } = panel;

  footer.appendChild(createOverlayFooterButton("关闭", close));
  app.appendChild(overlay);

  renderTalentView(body, { inPanel: true });
}

export async function showPolicyPanel() {
  const app = document.getElementById("app");
  if (!app) return;

  const existing = document.getElementById("policy-panel-overlay");
  if (existing) existing.remove();

  const panel = createDismissibleOverlayPanel({
    overlayId: "policy-panel-overlay",
    title: "问政廷议",
    subtitle: "廷议群臣、建言采纳与诏令起草，统一弹窗骨架。",
    panelClassName: "keju-panel-card",
    bodyClassName: "keju-panel-body",
  });
  const { overlay, body, footer, close } = panel;

  footer.appendChild(createOverlayFooterButton("关闭", close));
  app.appendChild(overlay);

  renderPolicyView(body, { inPanel: true });
}

function isAliveCharacter(state, characterId) {
  return state?.characterStatus?.[characterId]?.isAlive !== false;
}

function createAvatarFallback(parent, fallbackChar) {
  if (!parent) return;
  let fallbackNode = parent.querySelector(".avatar-fallback-text");
  if (!fallbackNode) {
    fallbackNode = document.createElement("span");
    fallbackNode.className = "avatar-fallback-text";
    fallbackNode.textContent = fallbackChar || "臣";
    parent.appendChild(fallbackNode);
  }
}

function resolveApiUrl(pathname) {
  const apiBase = getApiBase(getState().config || {}, "courtView");
  if (!apiBase) return pathname;
  return `${apiBase}${pathname}`;
}

function buildAppointRequestState(state) {
  return {
    appointments: state.appointments || {},
    characterStatus: state.characterStatus || {},
    extraCharacters: getAllCharactersFromState(state).map((item) => ({ ...item })),
  };
}

async function buildLocalAppointmentFallback(positionId, characterId, state) {
  const roster = getAllCharactersFromState(state);
  const targetCharacter = roster.find((item) => item?.id === characterId);
  if (!targetCharacter) {
    throw new Error("character not found");
  }
  if (!isAliveCharacter(state, characterId)) {
    throw new Error("该角色已故，无法任命");
  }

  if (!positionsCache) {
    try {
      positionsCache = await loadJSON("data/positions.json");
    } catch (_error) {
      positionsCache = { positions: [], departments: [], modules: [] };
    }
  }

  const positions = positionsCache?.positions || [];
  const targetPosition = positions.find((item) => item?.id === positionId);
  if (!targetPosition) {
    throw new Error("position not found");
  }

  const appointments = { ...(state.appointments || {}) };
  const oldHolder = appointments[positionId];
  let oldPosition;

  for (const [posId, holderId] of Object.entries(appointments)) {
    if (holderId === characterId && posId !== positionId) {
      oldPosition = posId;
      delete appointments[posId];
    }
  }

  appointments[positionId] = characterId;

  return {
    success: true,
    appointment: {
      positionId,
      characterId,
      positionName: targetPosition.name || positionId,
      characterName: targetCharacter.name || characterId,
      oldHolder,
      oldPosition,
    },
    appointments,
    effects: buildAppointmentOutcomeEffects(state, appointments),
    localFallback: true,
  };
}

async function requestAppoint(positionId, characterId) {
  const state = getState();
  const requestState = buildAppointRequestState(state);
  const localFallbackResult = await buildLocalAppointmentFallback(positionId, characterId, state);

  try {
    const response = await fetch(resolveApiUrl("/api/chongzhen/appoint"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        positionId,
        characterId,
        state: requestState,
      }),
    });

    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (_error) {
      data = null;
    }

    if (!response.ok) {
      const serverError = data?.error || text || `HTTP ${response.status}`;
      console.warn("requestAppoint falling back to local apply", serverError);
      return localFallbackResult;
    }

    return data || localFallbackResult;
  } catch (error) {
    console.warn("requestAppoint fetch failed, applying local fallback", error);
    return localFallbackResult;
  }
}

function rerenderCourtMainView() {
  rerenderCourtLegacyView();
}

function closeInlineAppointPanel() {
  appointUIState = {
    mode: null,
    positionId: null,
    ministerId: null,
    keyword: "",
    selectedId: null,
  };
}

function openInlineAppointByPosition(positionId) {
  showAppointmentDialogByPosition(positionId);
}

function openInlineAppointByMinister(ministerId) {
  showAppointmentDialogByMinister(ministerId);
}

async function showAppointmentDialogByPosition(positionId) {
  const app = document.getElementById("app");
  if (!app) return;

  const state = getState();
  const allCharacters = getAllCharactersFromState(state);
  const positionsData = await loadJSON("data/positions.json");
  const positions = positionsData?.positions || [];
  const position = positions.find(p => p.id === positionId);
  
  if (!position) return;

  const excludedIds = new Set([
    'chongzhendi', 'zhouhuanghou', 'yuanfei', 'tianfei',
    'duoergun', 'duoduo', 'haoge', 'aji', 'huangtaiji', 'daishan', 'jierhalang', 'fanwencheng',
    'lizicheng', 'zhangxianzhong', 'gaoyingxiang', 'luorucai', 'liuzongmin',
    'liyan', 'niujinxing', 'songxiance',
    'lidingguo', 'sunkewang', 'liuwenxiu', 'ainengqi'
  ]);
  const excludedFactions = new Set(['rebel', 'qing']);
  
  const aliveCharacters = allCharacters.filter(c => 
    isAliveCharacter(state, c.id) &&
    !excludedIds.has(c.id) && 
    !excludedFactions.has(c.faction)
  );
  const appointedIds = new Set(Object.values(state.appointments || {}));
  const currentHolder = (state.appointments || {})[positionId];
  if (currentHolder) appointedIds.delete(currentHolder);
  const availableCharacters = aliveCharacters.filter(c => !appointedIds.has(c.id));

  const existing = document.getElementById("appointment-dialog-overlay");
  if (existing) existing.remove();
  const panel = createDismissibleOverlayPanel({
    overlayId: "appointment-dialog-overlay",
    title: `任命 ${position.name}`,
    subtitle: "统一任命类弹窗骨架，后续扩展筛选、排序与推荐逻辑时不再重复写外层结构。",
    panelClassName: "appointment-dialog-card",
    bodyClassName: "appointment-dialog-card__body",
    footerClassName: "appointment-dialog-card__footer",
  });
  const { overlay, body, footer, close } = panel;

  const positionInfo = document.createElement("div");
  positionInfo.className = "appointment-dialog-position-info";
  positionInfo.innerHTML = `
    <div class="position-info-item"><span>品级:</span> ${position.grade || '未设置'}</div>
    <div class="position-info-item"><span>职责:</span> ${position.description || '无'}</div>
  `;

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "appointment-search-input";
  searchInput.placeholder = "搜索角色姓名或字号...";

  const traitSelect2 = document.createElement("select");
  traitSelect2.className = "appointment-search-input";
  traitSelect2.innerHTML = `
    <option value="all">全部类型</option>
    <option value="scholar">文人</option>
    <option value="warrior">武人</option>
    <option value="both">文武兼备</option>
  `;
  const sortSelect2 = document.createElement("select");
  sortSelect2.className = "appointment-search-input";
  sortSelect2.innerHTML = `
    <option value="default">默认排序</option>
    <option value="loyalty_desc">忠诚度从高到低</option>
    <option value="loyalty_asc">忠诚度从低到高</option>
  `;

  const traitSelect = document.createElement("select");
  traitSelect.className = "appointment-search-input";
  traitSelect.innerHTML = `
    <option value="all">全部类型</option>
    <option value="scholar">文人</option>
    <option value="warrior">武人</option>
    <option value="both">文武兼备</option>
  `;
  const sortSelect = document.createElement("select");
  sortSelect.className = "appointment-search-input";
  sortSelect.innerHTML = `
    <option value="default">默认排序</option>
    <option value="loyalty_desc">忠诚度从高到低</option>
    <option value="loyalty_asc">忠诚度从低到高</option>
  `;

  const characterList = document.createElement("div");
  characterList.className = "appointment-character-list";

  const selectedHint = document.createElement("div");
  selectedHint.className = "appointment-selected-hint";
  selectedHint.textContent = "请先选择一位角色，再点击「确认任命」。";

  let selectedCharacter = null;
  let appointing = false;

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "appointment-dialog-confirm";
  confirmBtn.textContent = "确认任命";
  confirmBtn.disabled = true;

  const updateConfirmState = () => {
    confirmBtn.disabled = !selectedCharacter || appointing;
    selectedHint.textContent = selectedCharacter
      ? `已选择：${getDisplayName(selectedCharacter.name)}`
      : "请先选择一位角色，再点击「确认任命」。";
  };

  const selectCharacter = (item, char) => {
    characterList.querySelectorAll(".appointment-character-item--selected").forEach((el) => {
      el.classList.remove("appointment-character-item--selected");
    });
    item.classList.add("appointment-character-item--selected");
    selectedCharacter = char;
    updateConfirmState();
  };

  const renderCharacters = (filter = "") => {
    characterList.innerHTML = "";
    const filtered = filterAndSortCharactersForAppointment(
      availableCharacters,
      state,
      filter,
      traitSelect.value || "all",
      sortSelect.value || "default"
    );

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "appointment-empty";
      empty.textContent = filter ? "未找到匹配的角色" : "暂无可用角色";
      characterList.appendChild(empty);
      return;
    }

    filtered.slice(0, 50).forEach(char => {
      const displayName = getDisplayName(char.name);
      const item = document.createElement("div");
      item.className = "appointment-character-item";
      
      const avatar = document.createElement("div");
      avatar.className = "appointment-character-avatar";
      avatar.appendChild(createAvatarImg(displayName, displayName?.charAt(0) || "?"));

      const info = document.createElement("div");
      info.className = "appointment-character-info";
      
      const nameEl = document.createElement("div");
      nameEl.className = "appointment-character-name";
      nameEl.textContent = displayName;
      
      const metaEl = document.createElement("div");
      metaEl.className = "appointment-character-meta";
      const metaParts = [];
      if (char.courtesyName) metaParts.push(`字${char.courtesyName}`);
      if (char.factionLabel) metaParts.push(char.factionLabel);
      metaEl.textContent = metaParts.join(" · ");

      const loyaltyEl = document.createElement("div");
      loyaltyEl.className = "appointment-character-loyalty";
      const stateLoyalty = state.loyalty || {};
      const loyaltyValue = stateLoyalty[char.id] !== undefined ? stateLoyalty[char.id] : (char.loyalty || 30);
      loyaltyEl.textContent = `忠诚: ${loyaltyValue}`;

      info.appendChild(nameEl);
      info.appendChild(metaEl);
      info.appendChild(loyaltyEl);

      item.appendChild(avatar);
      item.appendChild(info);

      item.addEventListener("click", () => selectCharacter(item, char));

      characterList.appendChild(item);
    });
  };

  searchInput.addEventListener("input", (e) => {
    renderCharacters(e.target.value);
  });
  traitSelect.addEventListener("change", () => {
    renderCharacters(searchInput.value);
  });
  sortSelect.addEventListener("change", () => {
    renderCharacters(searchInput.value);
  });

  confirmBtn.addEventListener("click", async () => {
    if (!selectedCharacter || appointing) return;

    appointing = true;
    confirmBtn.textContent = "任命中...";
    updateConfirmState();

    try {
      const result = await requestAppoint(positionId, selectedCharacter.id);
      if (result?.success === false) {
        showError(`任命失败: ${result.error || "未知错误"}`);
        return;
      }

      const s = getState();
      const appointmentEffects = buildAppointmentOutcomeEffects(s, result?.appointments, result?.effects);
      const nextNation = applyEffectsModule(s.nation || {}, appointmentEffects, s.loyalty || {}).nation;
      setState({
        ...buildAppointmentPatch(s, positionId, selectedCharacter.id),
        ...promoteGeneratedCandidate(s, selectedCharacter.id),
        nation: nextNation,
      });
      overlay.remove();
      rerenderCourtLegacyView();
    } catch (e) {
      showError(`任命失败: ${e.message}`);
    } finally {
      appointing = false;
      confirmBtn.textContent = "确认任命";
      updateConfirmState();
    }
  });

  body.appendChild(positionInfo);
  body.appendChild(selectedHint);
  body.appendChild(searchInput);
  body.appendChild(traitSelect);
  body.appendChild(sortSelect);
  body.appendChild(characterList);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "appointment-dialog-cancel";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", close);
  footer.appendChild(confirmBtn);
  footer.appendChild(cancelBtn);

  app.appendChild(overlay);
  renderCharacters();
  searchInput.focus();
}

async function showAppointmentDialogByMinister(ministerId) {
  const app = document.getElementById("app");
  if (!app) return;

  const state = getState();
  const allCharacters = getAllCharactersFromState(state);
  const minister = allCharacters.find(m => m.id === ministerId);
  if (!minister) return;
  if (!isAliveCharacter(state, ministerId)) {
    showError("该人物已故，无法授予官职。");
    return;
  }

  const positionsData = await loadJSON("data/positions.json");
  const positions = positionsData?.positions || [];
  const appointments = state.appointments || {};

  const existing = document.getElementById("appointment-dialog-overlay");
  if (existing) existing.remove();
  const panel = createDismissibleOverlayPanel({
    overlayId: "appointment-dialog-overlay",
    title: `调整官职：${getDisplayName(minister.name)}`,
    subtitle: "统一任命弹窗骨架，官员与官职两种调整路径沿用同一外层模板。",
    panelClassName: "appointment-dialog-card",
    bodyClassName: "appointment-dialog-card__body",
    footerClassName: "appointment-dialog-card__footer",
  });
  const { overlay, body, footer, close } = panel;

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "appointment-search-input";
  searchInput.placeholder = "搜索官职名称...";

  const positionList = document.createElement("div");
  positionList.className = "appointment-character-list";

  const selectedHint = document.createElement("div");
  selectedHint.className = "appointment-selected-hint";
  selectedHint.textContent = "请先选择一个官职，再点击「确认调整」。";

  let selectedPosition = null;
  let appointing = false;

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "appointment-dialog-confirm";
  confirmBtn.textContent = "确认调整";
  confirmBtn.disabled = true;

  const characterMap = new Map(allCharacters.map(c => [c.id, c]));

  const updateConfirmState = () => {
    confirmBtn.disabled = !selectedPosition || appointing;
    selectedHint.textContent = selectedPosition
      ? `已选择：${selectedPosition.name}`
      : "请先选择一个官职，再点击「确认调整」。";
  };

  const selectPosition = (item, pos) => {
    positionList.querySelectorAll(".appointment-character-item--selected").forEach((el) => {
      el.classList.remove("appointment-character-item--selected");
    });
    item.classList.add("appointment-character-item--selected");
    selectedPosition = pos;
    updateConfirmState();
  };

  const renderPositions = (filter = "") => {
    positionList.innerHTML = "";
    const filtered = filter 
      ? positions.filter(p => p.name.includes(filter) || (p.description && p.description.includes(filter)))
      : positions;

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "appointment-empty";
      empty.textContent = filter ? "未找到匹配的官职" : "暂无可用官职";
      positionList.appendChild(empty);
      return;
    }

    filtered.slice(0, 50).forEach(pos => {
      const item = document.createElement("div");
      item.className = "appointment-character-item";
      
      const info = document.createElement("div");
      info.className = "appointment-character-info";
      info.style.flex = "1";
      
      const nameEl = document.createElement("div");
      nameEl.className = "appointment-character-name";
      nameEl.textContent = pos.name;
      
      const metaEl = document.createElement("div");
      metaEl.className = "appointment-character-meta";
      const holderId = appointments[pos.id];
      const holderName = holderId ? getDisplayName(characterMap.get(holderId)?.name || holderId) : "空缺";
      metaEl.textContent = `${pos.grade || ''} · 当前：${holderName}`;

      info.appendChild(nameEl);
      info.appendChild(metaEl);
      item.appendChild(info);

      item.addEventListener("click", () => selectPosition(item, pos));

      positionList.appendChild(item);
    });
  };

  searchInput.addEventListener("input", (e) => {
    renderPositions(e.target.value);
  });

  confirmBtn.addEventListener("click", async () => {
    if (!selectedPosition || appointing) return;

    appointing = true;
    confirmBtn.textContent = "调整中...";
    updateConfirmState();

    try {
      const result = await requestAppoint(selectedPosition.id, ministerId);
      if (result?.success === false) {
        showError(`调整失败: ${result.error || "未知错误"}`);
        return;
      }

      const s = getState();
      const appointmentPatch = buildAppointmentPatch(s, selectedPosition.id, ministerId);
      const kejuSnapshot = getKejuStateSnapshot(s);
      const updatedReserve = (kejuSnapshot.talentReserve || []).filter((entry) => entry.candidateId !== ministerId);
      const patch = {
        ...appointmentPatch,
        ...promoteGeneratedCandidate(s, ministerId),
      };
      if (updatedReserve.length !== (kejuSnapshot.talentReserve || []).length) {
        patch.keju = mergeKejuState(s, {
          talentReserve: updatedReserve,
          note: `${getDisplayName(minister.name)} 已通过调岗推荐完成任命。`,
        });
      }

      setState(patch);
      overlay.remove();
      rerenderCourtLegacyView();
    } catch (e) {
      showError(`调整失败: ${e.message}`);
    } finally {
      appointing = false;
      confirmBtn.textContent = "确认调整";
      updateConfirmState();
    }
  });

  body.appendChild(selectedHint);
  body.appendChild(searchInput);
  body.appendChild(positionList);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "appointment-dialog-cancel";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", close);
  footer.appendChild(confirmBtn);
  footer.appendChild(cancelBtn);

  app.appendChild(overlay);
  renderPositions();
  searchInput.focus();
}

function applyLocalAppointmentState(positionId, characterId) {
  const state = getState();
  const currentAppointments = state.appointments || {};
  const nextAppointments = { ...currentAppointments };
  for (const [posId, charId] of Object.entries(nextAppointments)) {
    if (charId === characterId) {
      delete nextAppointments[posId];
    }
  }
  nextAppointments[positionId] = characterId;
  setState({ appointments: nextAppointments });
}

function buildAppointmentOutcomeEffects(state, appointmentsMap, baseEffects = null) {
  const roster = getAllCharactersFromState(state);
  const effects = baseEffects && typeof baseEffects === "object" && !Array.isArray(baseEffects)
    ? { ...baseEffects }
    : {};

  if (appointmentsMap && typeof appointmentsMap === "object" && !Array.isArray(appointmentsMap)) {
    effects.appointments = {
      ...(effects.appointments && typeof effects.appointments === "object" ? effects.appointments : {}),
      ...appointmentsMap,
    };
  }

  return mergeDerivedAppointmentStateEffects(effects, {
    positions: state.positionsMeta?.positions || positionsCache?.positions || [],
    ministers: roster,
    currentAppointments: state.appointments || {},
  }) || effects;
}

function applyLocalAppointmentEffects(appointmentsMap) {
  if (!appointmentsMap || typeof appointmentsMap !== "object" || Array.isArray(appointmentsMap)) return false;
  const state = getState();
  const roster = getAllCharactersFromState(state);
  const normalized = normalizeAppointmentEffects(
    { appointments: appointmentsMap },
    {
      positions: state.positionsMeta?.positions || positionsCache?.positions || [],
      ministers: roster,
    }
  );
  const normalizedAppointments = normalized?.appointments && typeof normalized.appointments === "object"
    ? normalized.appointments
    : {};
  const validCharacterIds = new Set(
    roster.map((item) => item?.id).filter((id) => typeof id === "string" && id)
  );
  const currentAppointments = state.appointments || {};
  const nextAppointments = { ...currentAppointments };
  let changed = false;

  for (const [positionId, characterId] of Object.entries(normalizedAppointments)) {
    if (typeof positionId !== "string" || typeof characterId !== "string") continue;
    if (!validCharacterIds.has(characterId)) continue;
    if (state.characterStatus?.[characterId]?.isAlive === false) continue;

    for (const [posId, holderId] of Object.entries(nextAppointments)) {
      if (holderId === characterId && posId !== positionId) {
        delete nextAppointments[posId];
        changed = true;
      }
    }

    if (nextAppointments[positionId] !== characterId) {
      nextAppointments[positionId] = characterId;
      changed = true;
    }
  }

  if (changed) {
    setState({ appointments: nextAppointments });
  }
  return changed;
}

function triggerTapFeedback() {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(10);
}

function buildMinisterRoleMap(state) {
  const roleMap = new Map();
  const positions = positionsCache?.positions || [];
  const appointments = state?.appointments || {};
  if (!positions.length) return roleMap;

  const positionById = new Map(positions.map((p) => [p.id, p]));
  for (const [positionId, ministerId] of Object.entries(appointments)) {
    if (!ministerId) continue;
    const position = positionById.get(positionId);
    if (!position?.name) continue;
    roleMap.set(ministerId, position.name);
  }
  return roleMap;
}

function resolveMinisterRoleLabel(minister, roleMap) {
  const dynamicRole = roleMap?.get(minister?.id);
  if (dynamicRole) return dynamicRole;
  const fallbackRole = (minister?.role && String(minister.role).trim()) || "";
  return fallbackRole || "未任官职";
}

function createAvatarImg(name, fallbackChar) {
  const img = document.createElement("img");
  const displayName = getDisplayName(name);
  img.alt = displayName || "";
  img.onerror = function () {
    this.style.display = "none";
    createAvatarFallback(this.parentElement, fallbackChar || (displayName ? displayName.charAt(0) : "臣"));
  };

  if (displayName && AVAILABLE_AVATAR_NAMES.has(displayName)) {
    img.src = `assets/${displayName}.jpg`;
  } else {
    queueMicrotask(() => img.onerror());
  }

  return img;
}

const MINISTER_NAME_COLORS = [
  "#8B0000", "#2e7d32", "#1565c0", "#e65100", "#6a1b9a",
  "#00695c", "#ad1457", "#4527a0",
];

function stripEnglishParenAfterChinese(text) {
  if (typeof text !== "string") return "";
  return text.replace(/([\u4e00-\u9fa5]{2,})\s*[（(]\s*([^（）()]+)\s*[）)]/g, (full, cnName, inner) => {
    const hasAscii = /[A-Za-z0-9_\-./:@]/.test(inner);
    const hasChinese = /[\u4e00-\u9fa5]/.test(inner);
    return hasAscii && !hasChinese ? cnName : full;
  }).trim();
}

function getDisplayName(name) {
  return stripEnglishParenAfterChinese(name || "");
}

function showMinisterDetail(minister, state, tagsConfig) {
  const app = document.getElementById("app");
  if (!app || !minister) return;
  const loyalty = state.loyalty || {};
  const score = loyalty[minister.id] || 0;
  const max = (state.config && state.config.loyaltyMax) || 100;
  const label = getLoyaltyStage(score, tagsConfig);
  const color = getLoyaltyColor(score, tagsConfig);

  const existing = document.getElementById("minister-detail-overlay");
  if (existing) existing.remove();
  const panel = createDismissibleOverlayPanel({
    overlayId: "minister-detail-overlay",
    title: "大臣详情",
    subtitle: "统一详情弹窗骨架，内部仍保留头像、忠诚、态度与转岗入口。",
    panelClassName: "minister-detail-card",
    bodyClassName: "minister-detail-card__body",
    footerClassName: "relationship-panel-card__footer",
  });
  const { overlay, body, footer, close } = panel;
  const displayName = getDisplayName(minister.name);

  const avatar = document.createElement("div");
  avatar.className = "minister-detail-avatar";
  avatar.appendChild(createAvatarImg(displayName, displayName ? displayName.charAt(0) : "臣"));

  const nameEl = document.createElement("div");
  nameEl.className = "minister-detail-card__name";
  nameEl.textContent = displayName;

  const roleEl = document.createElement("div");
  roleEl.className = "minister-detail-card__role";
  const roleMap = buildMinisterRoleMap(state);
  roleEl.textContent = `${resolveMinisterRoleLabel(minister, roleMap)} · ${minister.factionLabel || ""}`;

  const summary = document.createElement("p");
  summary.className = "minister-detail-card__summary";
  summary.textContent = minister.summary || "";

  const loyaltyBlock = document.createElement("div");
  loyaltyBlock.className = "minister-detail-card__loyalty";
  loyaltyBlock.textContent = `忠诚度 ${score} / ${max}`;
  loyaltyBlock.style.color = color;

  const attitudeBlock = document.createElement("div");
  attitudeBlock.className = "minister-detail-card__attitude";
  attitudeBlock.textContent = minister.attitude || "";

  const actionButtons = document.createElement("div");
  actionButtons.className = "minister-detail-actions";
  
  const appointBtn = document.createElement("button");
  appointBtn.type = "button";
  appointBtn.className = "minister-detail-appoint-btn";
  appointBtn.textContent = "转到官职调整";
  appointBtn.addEventListener("click", () => {
    close();
    openInlineAppointByMinister(minister.id);
  });
  actionButtons.appendChild(appointBtn);
  
  body.appendChild(avatar);
  body.appendChild(nameEl);
  body.appendChild(roleEl);
  body.appendChild(summary);
  body.appendChild(loyaltyBlock);
  body.appendChild(attitudeBlock);
  body.appendChild(actionButtons);

  footer.appendChild(createOverlayFooterButton("关闭", close));

  app.appendChild(overlay);
}

async function showPositionSelectDialog(minister, state) {
  const app = document.getElementById("app");
  if (!app) return;

  if (!positionsCache) {
    try {
      positionsCache = await loadJSON("data/positions.json");
    } catch (e) {
      positionsCache = { positions: [], departments: [] };
    }
  }

  const positions = positionsCache?.positions || [];
  const appointments = state.appointments || {};
  const ministers = getCourtMinistersFromState(state);
  const characterMap = new Map(ministers.map((character) => [character.id, character]));
  
  const existing = document.getElementById("position-select-overlay");
  if (existing) existing.remove();
  const panel = createDismissibleOverlayPanel({
    overlayId: "position-select-overlay",
    title: `为 ${getDisplayName(minister.name)} 调整官职`,
    subtitle: "统一官职选择弹窗骨架，保持任命与调岗流程使用同一套外层结构。",
    panelClassName: "appointment-dialog-card",
    bodyClassName: "appointment-dialog-card__body",
    footerClassName: "appointment-dialog-card__footer",
  });
  const { overlay, body, footer, close } = panel;

  const positionList = document.createElement("div");
  positionList.className = "appointment-character-list";
  positionList.style.maxHeight = "300px";

  const selectedHint = document.createElement("div");
  selectedHint.className = "appointment-selected-hint";
  selectedHint.textContent = "请选择一个官职后点击“确认调整”。";

  let selectedPosition = null;
  let appointing = false;

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "appointment-dialog-confirm";
  confirmBtn.textContent = "确认调整";
  confirmBtn.disabled = true;

  const updateConfirmState = () => {
    confirmBtn.disabled = !selectedPosition || appointing;
    selectedHint.textContent = selectedPosition
      ? `已选择：${selectedPosition.name}`
      : "请选择一个官职后点击“确认调整”。";
  };

  const selectPosition = (item, pos) => {
    positionList.querySelectorAll(".appointment-character-item--selected").forEach((el) => {
      el.classList.remove("appointment-character-item--selected");
    });
    item.classList.add("appointment-character-item--selected");
    selectedPosition = pos;
    updateConfirmState();
  };

  positions.forEach((pos) => {
    const item = document.createElement("div");
    item.className = "appointment-character-item";

    const info = document.createElement("div");
    info.className = "appointment-character-info";
    info.style.flex = "1";

    const nameEl = document.createElement("div");
    nameEl.className = "appointment-character-name";
    nameEl.textContent = pos.name;

    const metaEl = document.createElement("div");
    metaEl.className = "appointment-character-meta";
    const holderId = appointments[pos.id];
    const holderName = holderId ? getDisplayName(characterMap.get(holderId)?.name || holderId) : "空缺";
    const metaParts = [pos.grade || "未设品级", `当前：${holderName}`];
    if (pos.description) {
      metaParts.push(pos.description);
    }
    metaEl.textContent = metaParts.join(" · ");

    info.appendChild(nameEl);
    info.appendChild(metaEl);
    item.appendChild(info);
    item.addEventListener("click", () => selectPosition(item, pos));

    positionList.appendChild(item);
  });

  confirmBtn.addEventListener("click", async () => {
    if (!selectedPosition || appointing) return;

    appointing = true;
    confirmBtn.textContent = "调整中...";
    updateConfirmState();

    try {
      const result = await requestAppoint(selectedPosition.id, minister.id);
      if (result?.success === false) {
        showError(`调整失败: ${result.error || "未知错误"}`);
        return;
      }

      const s = getState();
      setState({
        ...buildAppointmentPatch(s, selectedPosition.id, minister.id),
        ...promoteGeneratedCandidate(s, minister.id),
      });
      overlay.remove();
      rerenderCourtLegacyView();
    } catch (e) {
      showError(`调整失败: ${e.message}`);
    } finally {
      appointing = false;
      confirmBtn.textContent = "确认调整";
      updateConfirmState();
    }
  });

  body.appendChild(selectedHint);
  body.appendChild(positionList);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "appointment-dialog-cancel";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", close);
  footer.appendChild(confirmBtn);
  footer.appendChild(cancelBtn);

  app.appendChild(overlay);
}

export function showFactionPanel(state) {
  const app = document.getElementById("app");
  if (!app) return;

  const existing = document.getElementById("relationship-panel-overlay");
  if (existing) existing.remove();
  const panel = createDismissibleOverlayPanel({
    overlayId: "relationship-panel-overlay",
    title: "朝堂派系",
    subtitle: "统一派系弹窗骨架，后续可继续接入派系成员、忠诚与党争信息。",
    bodyClassName: "relationship-panel-card__body",
    footerClassName: "relationship-panel-card__footer",
  });
  const { overlay, body, footer, close } = panel;
  body.style.flexDirection = "column";
  body.style.alignItems = "stretch";
  body.style.gap = "8px";

  const factions = factionsCache?.factions || [];
  const ministers = getCourtMinistersFromState(state);
  const loyalty = state.loyalty || {};
  const roleMap = buildMinisterRoleMap(state);

  factions.forEach((f) => {
    const section = document.createElement("div");
    section.className = "faction-panel-section";
    section.style.borderColor = `${f.color}33`;
    section.style.background = `${f.color}08`;

    const fName = document.createElement("div");
    fName.className = "faction-panel-section__name";
    fName.style.color = f.color;
    fName.textContent = f.name;
    section.appendChild(fName);

    const fDesc = document.createElement("div");
    fDesc.className = "faction-panel-section__desc";
    fDesc.textContent = f.description;
    section.appendChild(fDesc);

    body.appendChild(section);
  });

  footer.appendChild(createOverlayFooterButton("关闭", close));

  app.appendChild(overlay);
}

function createMinisterListElement(state, tagsConfig, onSelectMinister) {
  const ministers = getCourtMinistersFromState(state);
  const loyalty = state.loyalty || {};
  const roleMap = buildMinisterRoleMap(state);
  const list = document.createElement("div");
  list.className = "minister-list";

  const ministerUnread = state.ministerUnread || {};
  const preferredFaction = state.currentQuarterFocus?.factionId || null;
  const orderedMinisters = [...(ministers || [])].sort((a, b) => {
    if (!preferredFaction) return 0;
    const aScore = a.faction === preferredFaction ? 1 : 0;
    const bScore = b.faction === preferredFaction ? 1 : 0;
    return bScore - aScore;
  });
  orderedMinisters.forEach((m, index) => {
    const item = document.createElement("div");
    item.className = "minister-item" + (ministerUnread[m.id] ? " minister-item--unread" : "");
    const alive = isAliveCharacter(state, m.id);
    if (!alive) item.className += " minister-item--deceased";

    const displayName = getDisplayName(m.name);
    const avatar = document.createElement("div");
    avatar.className = "minister-avatar";
    avatar.appendChild(createAvatarImg(displayName, displayName ? displayName.charAt(0) : "臣"));
    const score = loyalty ? loyalty[m.id] || 0 : 0;

    avatar.addEventListener("click", (e) => {
      e.stopPropagation();
      showMinisterDetail({ ...m, role: resolveMinisterRoleLabel(m, roleMap) }, state, tagsConfig);
    });

    const main = document.createElement("div");
    main.className = "minister-main";
    
    const nameRow = document.createElement("div");
    nameRow.className = "minister-name-row";
    
    const nameLine = document.createElement("span");
    nameLine.className = "minister-name";
    nameLine.textContent = displayName;
    nameLine.style.color = MINISTER_NAME_COLORS[index % MINISTER_NAME_COLORS.length];

    if (!alive) {
      const deceasedTag = document.createElement("span");
      deceasedTag.className = "minister-status-tag minister-status-tag--deceased";
      deceasedTag.textContent = "已故";
      nameRow.appendChild(nameLine);
      nameRow.appendChild(deceasedTag);
    } else {
      nameRow.appendChild(nameLine);
    }
    
    const factionTag = document.createElement("span");
    factionTag.className = "minister-faction-tag " + getFactionClass(m.faction);
    factionTag.textContent = m.factionLabel || m.faction || "";
    
    nameRow.appendChild(factionTag);
    
    const roleLine = document.createElement("div");
    roleLine.className = "minister-role";
    const roleLabel = resolveMinisterRoleLabel(m, roleMap);
    roleLine.textContent = alive
      ? roleLabel
      : `${roleLabel || "群臣"} · ${state.characterStatus?.[m.id]?.deathReason || "病逝"}`;

    const preview = document.createElement("div");
    preview.className = "minister-preview";
    const chats = state.courtChats?.[m.id];
    const lastMsg = Array.isArray(chats) && chats.length > 0 ? chats[chats.length - 1] : null;
    preview.textContent = lastMsg ? (lastMsg.text || "").slice(0, 40) : m.attitude || "";

    main.appendChild(nameRow);
    main.appendChild(roleLine);
    main.appendChild(preview);

    const meta = document.createElement("div");
    meta.className = "minister-meta";
    const stageLabel = getLoyaltyStage(score, tagsConfig);
    const stageColor = getLoyaltyColor(score, tagsConfig);
    const scoreEl = document.createElement("div");
    scoreEl.className = "minister-loyalty-score";
    scoreEl.textContent = score;
    scoreEl.style.color = stageColor;
    meta.appendChild(scoreEl);
    const stageEl = document.createElement("div");
    stageEl.className = "minister-loyalty-label";
    stageEl.textContent = stageLabel;
    stageEl.style.color = stageColor;
    meta.appendChild(stageEl);

    if (ministerUnread[m.id]) {
      const badge = document.createElement("span");
      badge.className = "minister-item__badge";
      meta.appendChild(badge);
    }

    item.appendChild(avatar);
    item.appendChild(main);
    item.appendChild(meta);

    item.addEventListener("click", () => {
      onSelectMinister(m.id);
    });

    list.appendChild(item);
  });

  return list;
}

export function showMinisterPanel(state, tagsConfig) {
  const app = document.getElementById("app");
  if (!app) return;

  const existing = document.getElementById("minister-panel-overlay");
  if (existing) existing.remove();
  const panel = createDismissibleOverlayPanel({
    overlayId: "minister-panel-overlay",
    title: "朝堂群臣",
    subtitle: "统一群臣列表弹窗骨架，保留点击人物进入奏对与详情的现有流转。",
    panelClassName: "minister-panel-card",
    bodyClassName: "minister-panel-body",
    footerClassName: "relationship-panel-card__footer",
  });
  const { overlay, body, footer, close } = panel;
  body.appendChild(createMinisterListElement(state, tagsConfig, (ministerId) => {
    close();
    currentMinisterChatId = ministerId;
    rerenderCourtMainView();
  }));

  footer.appendChild(createOverlayFooterButton("关闭", close));

  app.appendChild(overlay);
}

function renderMinisterList(container, state, tagsConfig) {
  const ministers = getCourtMinistersFromState(state);

  const panel = createSectionCard({
    className: "court-minister-card",
    title: `朝堂群臣 ${ministers?.length || 0} 人`,
    hint: "",
  });

  const actions = document.createElement("div");
  actions.className = "court-view-header__actions";

  const ministerBtn = document.createElement("button");
  ministerBtn.type = "button";
  ministerBtn.className = "court-relations-btn";
  ministerBtn.textContent = "群臣列表";
  ministerBtn.addEventListener("click", () => showMinisterPanel(state, tagsConfig));

  const relBtn = document.createElement("button");
  relBtn.type = "button";
  relBtn.className = "court-relations-btn";
  relBtn.textContent = "派系";
  relBtn.addEventListener("click", () => showFactionPanel(state));

  const kejuBtn = document.createElement("button");
  kejuBtn.type = "button";
  kejuBtn.className = "court-relations-btn";
  kejuBtn.textContent = "科举";
  kejuBtn.addEventListener("click", () => {
    showKejuPanel();
  });

  const wujuBtn = document.createElement("button");
  wujuBtn.type = "button";
  wujuBtn.className = "court-relations-btn";
  wujuBtn.textContent = "武举";
  wujuBtn.addEventListener("click", () => {
    showWujuPanel();
  });

  const talentBtn = document.createElement("button");
  talentBtn.type = "button";
  talentBtn.className = "court-relations-btn";
  talentBtn.textContent = "人才";
  talentBtn.addEventListener("click", () => {
    showTalentPanel();
  });

  const policyBtn = document.createElement("button");
  policyBtn.type = "button";
  policyBtn.className = "court-relations-btn";
  policyBtn.textContent = "问政";
  policyBtn.addEventListener("click", () => {
    showPolicyPanel();
  });

  actions.appendChild(ministerBtn);
  actions.appendChild(relBtn);
  actions.appendChild(kejuBtn);
  actions.appendChild(wujuBtn);
  actions.appendChild(talentBtn);
  actions.appendChild(policyBtn);
  panel.body.appendChild(actions);

  container.appendChild(panel.section);
}

function createCourtPositionItem({ pos, holder, state }) {
  const isVacant = !holder;
  const { card, body } = createFeedCard({
    className: `court-position-item${isVacant ? " court-position-item--vacant" : ""}`,
  });
  body.innerHTML = "";

  const avatarWrap = document.createElement("div");
  avatarWrap.className = "court-position-avatar";
  if (holder) {
    const displayName = getDisplayName(holder.name);
    avatarWrap.appendChild(createAvatarImg(displayName, displayName?.charAt(0) || "臣"));
  } else {
    const placeholder = document.createElement("div");
    placeholder.className = "court-position-avatar-placeholder";
    placeholder.textContent = "+";
    avatarWrap.appendChild(placeholder);
  }

  const textWrap = document.createElement("div");
  textWrap.className = "court-position-text";

  const roleEl = document.createElement("div");
  roleEl.className = "court-position-item__role";
  roleEl.textContent = pos.name;

  const metaLine = document.createElement("div");
  metaLine.className = "court-position-item__meta";

  const nameEl = document.createElement("div");
  nameEl.className = "court-position-item__name";
  nameEl.textContent = holder ? getDisplayName(holder.name) : "+ 点击任命";
  if (!holder) nameEl.classList.add("court-position-item__name--vacant");

  const gradeEl = document.createElement("div");
  gradeEl.className = "court-position-item__grade";
  gradeEl.textContent = pos.grade || "";

  metaLine.appendChild(nameEl);
  metaLine.appendChild(gradeEl);
  textWrap.appendChild(roleEl);
  textWrap.appendChild(metaLine);

  const actionWrap = document.createElement("div");
  actionWrap.className = "court-position-item__actions";

  const appointBtn = document.createElement("button");
  appointBtn.type = "button";
  appointBtn.className = "court-position-appoint-btn" + (isVacant ? " court-position-appoint-btn--appoint" : " court-position-appoint-btn--adjust");
  appointBtn.textContent = isVacant ? "任命" : "调整";
  appointBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    triggerTapFeedback();
    openInlineAppointByPosition(pos.id);
  });
  actionWrap.appendChild(appointBtn);
  textWrap.appendChild(actionWrap);

  card.insertBefore(avatarWrap, body);
  body.appendChild(textWrap);

  card.addEventListener("click", () => {
    triggerTapFeedback();
    if (holder) {
      showMinisterDetail({ ...holder, role: pos.name, id: holder.id }, state, tagsConfigCache);
    } else {
      openInlineAppointByPosition(pos.id);
    }
  });

  return card;
}

async function renderCourtPageShell(container, state, { mainTitle, mainHint, renderMain }) {
  const currentModeLabel = state.mode === "rigid_v1" ? "困难模式" : "经典模式";
  const { root, actionsBody, dataBody, mainBody } = createGameplayPageTemplate({
    pageClass: "court-page",
    title: "朝堂总览",
    subtitle: "固定保留标题区、操作区、数据区与主内容区，后续新增官职、议政和人才模块时可直接复用。",
    actionsTitle: "快捷入口",
    actionsHint: "把群臣、派系、科举和武举等高频入口固定在这里。",
    dataTitle: "朝堂数据",
    dataHint: "统一放朝堂最先需要判断的核心状态，减少每个页面都单独拼统计区。",
    mainTitle,
    mainHint,
  });

  const metaRow = createElement("div", { className: "gameplay-page__meta-row" });
  metaRow.appendChild(createTag(currentModeLabel));
  metaRow.appendChild(createTag(`群臣 ${getCourtMinistersFromState(state).length} 人`));
  metaRow.appendChild(createTag(`未读 ${Object.values(state.ministerUnread || {}).filter(Boolean).length}`));
  actionsBody.appendChild(metaRow);

  const actionGrid = createElement("div", { className: "gameplay-page__action-grid" });
  [
    { label: "群臣列表", description: "快速查看所有在朝人物与忠诚层级。", onClick: () => showMinisterPanel(state, tagsConfigCache) },
    { label: "派系关系", description: "快速查看派系分布与朝局牵引。", onClick: () => showFactionPanel(state) },
    { label: "科举", description: "查看文官方向人才补充与待录用名单。", onClick: () => showKejuPanel() },
    { label: "武举", description: "查看军事人才补充与推荐任命。", onClick: () => showWujuPanel() },
    { label: "人才", description: "人才储备、延揽招募与职位任用。", onClick: () => showTalentPanel() },
    { label: "问政", description: "廷议群臣、建言采纳与诏令起草。", onClick: () => showPolicyPanel() },
  ].forEach((item) => {
    const button = createActionButton({
      label: item.label,
      description: item.description,
      block: true,
    });
    button.addEventListener("click", item.onClick);
    actionGrid.appendChild(button);
  });
  actionsBody.appendChild(actionGrid);

  const statsGrid = createElement("div", { className: "gameplay-page__stat-grid" });
  const activeHolderCount = getActiveAppointmentHolderCount(state);
  const positionCount = Array.isArray(positionsCache?.positions) ? positionsCache.positions.length : 0;
  const vacancyCount = Math.max(0, positionCount - activeHolderCount);
  const unreadCount = Object.values(state.ministerUnread || {}).filter(Boolean).length;
  const kejuStage = KEJU_STAGE_LABELS[state.keju?.stage] || KEJU_STAGE_LABELS.idle;
  const wujuStage = WUJU_STAGE_LABELS[state.wuju?.stage] || WUJU_STAGE_LABELS.idle;
  [
    createStatCard({ label: "未读奏对", value: String(unreadCount), detail: "等待玩家查看的大臣回复。" }),
    createStatCard({ label: "在任官员", value: `${activeHolderCount}/${positionCount}`, detail: `空缺 ${vacancyCount} 个官职` }),
    createStatCard({ label: "朝堂派系", value: String((state.factions || []).length), detail: "当前已入场的主要政治集团。" }),
    createStatCard({ label: "文武储备", value: `${kejuStage} / ${wujuStage}`, detail: "科举与武举当前推进阶段。" }),
  ].forEach((card) => statsGrid.appendChild(card));
  dataBody.appendChild(statsGrid);

  const mainHost = createElement("div", { className: "gameplay-page__content-stack" });
  mainBody.appendChild(mainHost);
  await renderMain(mainHost);

  container.appendChild(root);
}

async function renderPositionMap(container, state) {
  if (!positionsCache) {
    try {
      positionsCache = await loadJSON("data/positions.json");
    } catch (e) {
      positionsCache = { positions: [], departments: [], modules: [] };
    }
  }

  const positions = positionsCache?.positions || [];
  const departments = positionsCache?.departments || [];
  const modules = positionsCache?.modules || [];
  const currentAppointments = getState().appointments || {};
  const appointments = currentAppointments;
  const charactersData = await loadJSON("data/characters.json");
  const characters = charactersData?.characters || [];
  const stateCharacters = getAllCharactersFromState(getState());
  const characterMap = new Map(characters.map(c => [c.id, c]));
  stateCharacters.forEach((character) => {
    if (!character?.id) return;
    characterMap.set(character.id, character);
  });
  const aliveStatus = getState().characterStatus || {};
  const getActiveHolder = (positionId) => {
    const holderId = appointments[positionId];
    if (typeof holderId !== "string" || !holderId) return null;
    if (aliveStatus[holderId]?.isAlive === false) return null;
    return characterMap.get(holderId) || null;
  };
  const isPositionVacant = (positionId) => !getActiveHolder(positionId);

  const card = document.createElement("div");
  card.className = "edict-block court-position-card";

  const header = document.createElement("div");
  header.className = "court-position-header";
  const activeHolderCount = getActiveAppointmentHolderCount(getState());
  header.innerHTML = `
    <span>朝廷官职</span>
    <span class="court-position-count">在任官员 ${activeHolderCount} 人 / 官职 ${positions.length}</span>
  `;
  card.appendChild(header);

  const swipeHint = document.createElement("div");
  swipeHint.className = "court-swipe-hint";
  swipeHint.setAttribute("aria-hidden", "true");
  swipeHint.textContent = "左右滑动可切换部门";
  card.appendChild(swipeHint);

  const deptMap = new Map(departments.map(d => [d.id, d]));
  const moduleMap = new Map(modules.map(m => [m.id, m]));

  const groupedPositions = new Map();
  positions.forEach(pos => {
    const deptId = pos.department || 'other';
    if (!groupedPositions.has(deptId)) {
      groupedPositions.set(deptId, []);
    }
    groupedPositions.get(deptId).push(pos);
  });

  const moduleOrder = ['neige', 'liubu', 'fasisi', 'neiting', 'difang', 'junshi'];
  const orderedModuleIds = moduleOrder.filter((moduleId) => {
    const mod = moduleMap.get(moduleId);
    if (!mod || !mod.departments) return false;
    return mod.departments.some(deptId => (groupedPositions.get(deptId) || []).length > 0);
  });

  const getModuleDepartments = (moduleId) => {
    const mod = moduleMap.get(moduleId);
    if (!mod || !mod.departments) return [];
    return mod.departments.filter(deptId => (groupedPositions.get(deptId) || []).length > 0);
  };

  const orderedDeptIds = orderedModuleIds.flatMap(mId => getModuleDepartments(mId));

  if (courtDeptUIState.swipeHintTimer) {
    clearTimeout(courtDeptUIState.swipeHintTimer);
    courtDeptUIState.swipeHintTimer = null;
  }

  const unmountSwipeHint = () => {
    swipeHint.classList.remove("is-mounted");
  };

  const hideSwipeHint = ({ markDismissed = false } = {}) => {
    courtDeptUIState.swipeHintVisible = false;
    swipeHint.classList.remove("is-visible");
    const finalizeUnmount = () => {
      unmountSwipeHint();
    };
    swipeHint.addEventListener("transitionend", finalizeUnmount, { once: true });
    setTimeout(finalizeUnmount, 320);

    if (markDismissed) {
      courtDeptUIState.swipeHintDismissed = true;
      try {
        localStorage.setItem(COURT_SWIPE_HINT_STORAGE_KEY, "1");
      } catch (_error) {
        // ignore storage failure
      }
    }
  };

  const showSwipeHint = () => {
    swipeHint.classList.add("is-mounted");
    requestAnimationFrame(() => {
      swipeHint.classList.add("is-visible");
    });
    courtDeptUIState.swipeHintVisible = true;
  };

  if (!courtDeptUIState.swipeHintDismissed) {
    let seenBefore = false;
    try {
      seenBefore = localStorage.getItem(COURT_SWIPE_HINT_STORAGE_KEY) === "1";
    } catch (_error) {
      seenBefore = false;
    }
    courtDeptUIState.swipeHintDismissed = seenBefore;
  }

  const shouldShowSwipeHint = orderedDeptIds.length > 1 && !courtDeptUIState.swipeHintDismissed;
  if (shouldShowSwipeHint) {
    showSwipeHint();
    courtDeptUIState.swipeHintTimer = setTimeout(() => {
      hideSwipeHint({ markDismissed: true });
      courtDeptUIState.swipeHintTimer = null;
    }, 2600);
  } else {
    unmountSwipeHint();
  }

  const fallbackDeptId = orderedDeptIds.includes("neige") ? "neige" : (orderedDeptIds[0] || null);
  const preferredDeptId = courtDeptUIState.expandedDeptId || fallbackDeptId;
  courtDeptUIState.expandedDeptId = orderedDeptIds.includes(preferredDeptId) ? preferredDeptId : fallbackDeptId;

  const switchExpandedDept = (delta) => {
    if (!orderedDeptIds.length) return;
    const currentIndex = orderedDeptIds.indexOf(courtDeptUIState.expandedDeptId);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + delta + orderedDeptIds.length) % orderedDeptIds.length;
    courtDeptUIState.expandedDeptId = orderedDeptIds[nextIndex];
    rerenderCourtMainView();
  };

  card.addEventListener("touchstart", (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    courtDeptUIState.touchStartX = touch.clientX;
    courtDeptUIState.touchStartY = touch.clientY;
  }, { passive: true });

  card.addEventListener("touchend", (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    const deltaX = touch.clientX - courtDeptUIState.touchStartX;
    const deltaY = touch.clientY - courtDeptUIState.touchStartY;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;
    if (deltaX < 0) {
      switchExpandedDept(1);
    } else {
      switchExpandedDept(-1);
    }

    if (!courtDeptUIState.swipeHintDismissed) {
      hideSwipeHint({ markDismissed: true });
      if (courtDeptUIState.swipeHintTimer) {
        clearTimeout(courtDeptUIState.swipeHintTimer);
        courtDeptUIState.swipeHintTimer = null;
      }
    }
  }, { passive: true });

  orderedModuleIds.forEach(moduleId => {
    const mod = moduleMap.get(moduleId);
    const moduleDepts = getModuleDepartments(moduleId);
    if (!moduleDepts.length) return;

    const isSingleDept = moduleDepts.length === 1;
    const isModuleExpanded = courtModuleUIState.expandedModuleId === moduleId;

    const moduleSection = document.createElement("div");
    moduleSection.className = "court-module-section" + (isModuleExpanded ? " is-open" : "");
    
    const moduleHeader = document.createElement("button");
    moduleHeader.type = "button";
    moduleHeader.className = "court-module-header";
    
    const totalVacant = moduleDepts.reduce((sum, deptId) => {
      const posList = groupedPositions.get(deptId) || [];
      return sum + posList.filter((p) => isPositionVacant(p.id)).length;
    }, 0);
    
    moduleHeader.innerHTML = `
      <span class="court-module-header__name">${mod?.name || moduleId}</span>
      <span class="court-module-header__badge">${totalVacant}</span>
      <span class="court-module-header__desc">${mod?.description || ''}</span>
      <span class="court-module-header__arrow">▸</span>
    `;
    
    moduleHeader.addEventListener("click", () => {
      triggerTapFeedback();
      if (courtModuleUIState.expandedModuleId === moduleId) {
        courtModuleUIState.expandedModuleId = null;
        courtModuleUIState.expandedDeptId = null;
      } else {
        courtModuleUIState.expandedModuleId = moduleId;
        if (!isSingleDept) {
          courtModuleUIState.expandedDeptId = moduleDepts[0];
        }
      }
      rerenderCourtMainView();
    });
    
    moduleSection.appendChild(moduleHeader);

    if (isModuleExpanded) {
      if (isSingleDept) {
        const deptId = moduleDepts[0];
        const posList = groupedPositions.get(deptId) || [];
        if (posList.length > 0) {
          const grid = document.createElement("div");
          grid.className = "court-position-grid court-position-grid--direct";
          
          const sortedPosList = [...posList].sort((a, b) => (b.importance || 0) - (a.importance || 0));
          
          sortedPosList.forEach((pos) => {
            const holder = getActiveHolder(pos.id);
            grid.appendChild(createCourtPositionItem({ pos, holder, state }));
          });

          moduleSection.appendChild(grid);
        }
      } else {
        moduleDepts.forEach(deptId => {
          const posList = groupedPositions.get(deptId);
          if (!posList || posList.length === 0) return;

          const dept = deptMap.get(deptId) || { name: deptId, color: '#666' };
          const vacantCount = posList.filter((p) => isPositionVacant(p.id)).length;

          const section = document.createElement("section");
          const sectionIsOpen = courtModuleUIState.expandedDeptId === deptId;
          section.className = "court-dept-section" + (sectionIsOpen ? " is-open" : "");
          section.style.setProperty("--court-dept-accent", dept.color || "#666");

          const groupTitle = document.createElement("div");
          groupTitle.className = "court-position-group-title";
          groupTitle.innerHTML = `
            <span class="court-position-group-title__name">${dept.name || deptId}</span>
            <span class="court-position-group-title__badge" aria-label="空缺职位数">${vacantCount}</span>
            <span class="court-position-group-title__arrow">▸</span>
          `;
          groupTitle.addEventListener("click", () => {
            triggerTapFeedback();
            courtModuleUIState.expandedDeptId = courtModuleUIState.expandedDeptId === deptId ? null : deptId;
            rerenderCourtMainView();
          });
          section.appendChild(groupTitle);

          if (sectionIsOpen) {
            const grid = document.createElement("div");
            grid.className = "court-position-grid";

            const sortedPosList = [...posList].sort((a, b) => {
              if (deptId === "neige") {
                const neiGeOrder = new Map([
                  ["neige_shoufu", 1],
                  ["neige_cifu", 2],
                  ["neige_daxueshi", 3],
                ]);
                const aOrder = neiGeOrder.get(a.id) || 99;
                const bOrder = neiGeOrder.get(b.id) || 99;
                if (aOrder !== bOrder) return aOrder - bOrder;
              }
              return (b.importance || 0) - (a.importance || 0);
            });

            sortedPosList.forEach((pos) => {
              const holder = getActiveHolder(pos.id);
              grid.appendChild(createCourtPositionItem({ pos, holder, state }));
            });

            section.appendChild(grid);
          }

          moduleSection.appendChild(section);
        });
      }
    }

    card.appendChild(moduleSection);
  });

  container.appendChild(card);
}

function ensureConversation(minister) {
  if (!minister) return;
  const state = getState();
  const list = state.courtChats?.[minister.id];
  const opening = (minister.openingLine || "").trim();
  if (!opening) return;
  if (Array.isArray(list) && list.length > 0) return;
  setState({
    courtChats: { ...(state.courtChats || {}), [minister.id]: [{ from: "minister", text: opening }] },
  });
}

function renderMinisterChat(container, state, tagsConfig, minister) {
  const ministerId = minister.id;
  setState({ ministerUnread: { ...(state.ministerUnread || {}), [ministerId]: false } });
  updateMinisterTabBadge(getState());

  const root = document.createElement("div");
  root.className = "court-chat-root";

  const header = document.createElement("div");
  header.className = "court-chat-header";
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "court-chat-back";
  backBtn.textContent = "← 朝堂";
  backBtn.addEventListener("click", () => {
    currentMinisterChatId = null;
    root.remove();
    renderCourtInteractiveView(container, { useLegacyLayout: useLegacyLayoutForContainer(container) });
  });
  const title = document.createElement("div");
  title.className = "court-chat-title";
  const displayName = getDisplayName(minister.name);
  const updateTitle = () => {
    const latestRoleMap = buildMinisterRoleMap(getState());
    title.textContent = `${displayName}（${resolveMinisterRoleLabel(minister, latestRoleMap)}）`;
  };
  updateTitle();
  header.appendChild(backBtn);
  header.appendChild(title);
  root.appendChild(header);

  const thread = document.createElement("div");
  thread.className = "court-chat-thread";
  root.appendChild(thread);

  const deltaPanel = document.createElement("div");
  deltaPanel.className = "court-chat-delta-panel";
  root.appendChild(deltaPanel);

  const inputBar = document.createElement("div");
  inputBar.className = "court-chat-input-bar";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "court-chat-input";
  input.placeholder = "与臣子议事…";
  const sendBtn = document.createElement("button");
  sendBtn.type = "button";
  sendBtn.className = "court-chat-send";
  sendBtn.textContent = "谕旨";

  const appendMessage = (from, text) => {
    const s = getState();
    const list = [...(s.courtChats?.[ministerId] || []), { from, text }];
    setState({ courtChats: { ...(s.courtChats || {}), [ministerId]: list } });
  };

  const rerenderThread = () => {
    const latestState = getState();
    const latest = latestState.courtChats?.[ministerId] || [];
    const latestRoleMap = buildMinisterRoleMap(latestState);
    thread.innerHTML = "";
    latest.forEach((msg) => {
      const row = document.createElement("div");
      row.className = "chat-row " + (msg.from === "player" ? "chat-row--me" : "chat-row--minister");

      const playerName = latestState?.player?.name || "主上";
      const playerTitle = latestState?.player?.title || "主上";

      const avatar = document.createElement("div");
      avatar.className = "chat-avatar-small";
      if (msg.from === "player") {
        avatar.appendChild(createAvatarImg(playerName, playerTitle));
      } else {
        avatar.appendChild(createAvatarImg(displayName, displayName ? displayName.charAt(0) : "臣"));
      }

      const bubble = document.createElement("div");
      bubble.className = "chat-bubble " + (msg.from === "player" ? "chat-bubble--me" : "chat-bubble--minister");
      const speakerLabel = msg.from === "player"
        ? `${playerTitle}·${playerName}`
        : `${resolveMinisterRoleLabel(minister, latestRoleMap)}·${displayName}`;
      bubble.textContent = `${speakerLabel}：${msg.text || ""}`;

      if (msg.from === "player") {
        row.appendChild(bubble);
        row.appendChild(avatar);
      } else {
        row.appendChild(avatar);
        row.appendChild(bubble);
      }
      thread.appendChild(row);
    });
    thread.scrollTop = thread.scrollHeight;
    updateTitle();
  };

  const applyDialogueEffects = (result) => {
    const before = getState();
    const beforeSnapshot = captureDisplayStateSnapshot(before);
    const sourceEffects = result?.effects && typeof result.effects === "object" ? { ...result.effects } : {};

    if (typeof result?.loyaltyDelta === "number" && result.loyaltyDelta !== 0) {
      const nextLoyalty = sourceEffects.loyalty && typeof sourceEffects.loyalty === "object" ? { ...sourceEffects.loyalty } : {};
      nextLoyalty[ministerId] = (nextLoyalty[ministerId] || 0) + result.loyaltyDelta;
      sourceEffects.loyalty = nextLoyalty;
    }

    if (result?.appointments && typeof result.appointments === "object" && !Array.isArray(result.appointments)) {
      sourceEffects.appointments = { ...result.appointments };
    }

    const effectiveEffects = buildAppointmentOutcomeEffects(before, sourceEffects.appointments, sourceEffects);

    const hasEffects = hasOutcomeDisplayDelta(effectiveEffects) || Object.keys(effectiveEffects).length > 0;
    if (!hasEffects) {
      deltaPanel.innerHTML = "";
      return;
    }

    const { nation: nextNation, loyalty: nextLoyalty } = applyEffectsModule(before.nation || {}, effectiveEffects, before.loyalty || {});
    setState({ nation: nextNation, loyalty: nextLoyalty });

    const appointmentsChanged = applyLocalAppointmentEffects(effectiveEffects.appointments);
    const after = getState();
    const afterSnapshot = captureDisplayStateSnapshot(after);
    const delta = buildOutcomeDisplayDelta(beforeSnapshot, afterSnapshot);
    deltaPanel.innerHTML = "";
    renderOutcomeDisplayCard(deltaPanel, delta, after, "本轮对话数值变化");

    updateTopbarByState(after);
    if (appointmentsChanged) {
      showSuccess("官职任免已生效");
    }
  };

  const handleSend = async () => {
    const content = input.value.trim();
    if (!content || sendingFlags[ministerId]) return;
    if (!isAliveCharacter(getState(), ministerId)) {
      showError("该人物已故，无法继续议事。请返回朝堂。");
      return;
    }
    appendMessage("player", content);
    input.value = "";
    rerenderThread();

    const config = getState().config || {};
    const useLLM = shouldUseLlmProxy(config, "courtViewMinisterChat");

    sendingFlags[ministerId] = true;
    sendBtn.disabled = true;

    if (useLLM) {
      const chats = getState().courtChats?.[ministerId] || [];
      const history = chats.map((m) => ({
        role: m.from === "player" ? "user" : "assistant",
        content: m.text || "",
      }));
      const result = await requestMinisterReply(ministerId, history);
      sendingFlags[ministerId] = false;
      sendBtn.disabled = false;

      if (result && result.reply) {
        appendMessage("minister", result.reply);
        applyDialogueEffects(result);
      } else {
        const fallback = getAutoReplies(minister, content);
        appendMessage("minister", fallback);
        deltaPanel.innerHTML = "";
      }
      rerenderThread();
    } else {
      setTimeout(() => {
        sendingFlags[ministerId] = false;
        sendBtn.disabled = false;
        const replies = getAutoReplies(minister, content);
        if (replies) {
          appendMessage("minister", replies);
          rerenderThread();
        }
      }, 500);
    }
  };

  sendBtn.addEventListener("click", handleSend);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); handleSend(); }
  });

  inputBar.appendChild(input);
  inputBar.appendChild(sendBtn);
  root.appendChild(inputBar);
  container.appendChild(root);

  rerenderThread();
}

function getAutoReplies(minister, playerText) {
  const state = getState();
  const rulerTitle = state?.player?.title || "主上";
  if (typeof minister?.openingLine === "string" && minister.openingLine.trim()) {
    return minister.openingLine.trim();
  }
  if (typeof minister?.attitude === "string" && minister.attitude.trim()) {
    return `${rulerTitle}，${minister.attitude.trim()}`;
  }
  return `${rulerTitle}明鉴，臣领旨，定当尽心竭力。`;
}

function showAppointmentDialog(position, state) {
  showAppointmentDialogAsync(position, state);
}

async function showAppointmentDialogAsync(position, state) {
  const app = document.getElementById("app");
  if (!app) return;

  const charactersData = await loadJSON("data/characters.json");
  const mergedCharacters = new Map();
  (charactersData?.characters || []).forEach((character) => {
    if (!character?.id) return;
    mergedCharacters.set(character.id, character);
  });
  getAllCharactersFromState(getState()).forEach((character) => {
    if (!character?.id) return;
    mergedCharacters.set(character.id, character);
  });
  const allCharacters = Array.from(mergedCharacters.values());
  
  const excludedIds = new Set([
    'chongzhendi', 'zhouhuanghou', 'yuanfei', 'tianfei',
    'duoergun', 'duoduo', 'haoge', 'aji', 'huangtaiji', 'daishan', 'jierhalang', 'fanwencheng',
    'lizicheng', 'zhangxianzhong', 'gaoyingxiang', 'luorucai', 'liuzongmin',
    'liyan', 'niujinxing', 'songxiance',
    'lidingguo', 'sunkewang', 'liuwenxiu', 'ainengqi'
  ]);
  
  const excludedFactions = new Set(['rebel', 'qing']);
  
  const aliveCharacters = allCharacters.filter(c => 
    c.isAlive !== false && 
    !excludedIds.has(c.id) && 
    !excludedFactions.has(c.faction)
  );
  const appointedIds = new Set(Object.values(state.appointments || {}));
  const availableCharacters = aliveCharacters.filter(c => !appointedIds.has(c.id));

  const existing = document.getElementById("appointment-dialog-overlay");
  if (existing) existing.remove();
  const panel = createDismissibleOverlayPanel({
    overlayId: "appointment-dialog-overlay",
    title: `任命 ${position.name}`,
    subtitle: "统一老任命路径的弹窗骨架，保留现有角色筛选与确认逻辑。",
    panelClassName: "appointment-dialog-card",
    bodyClassName: "appointment-dialog-card__body",
    footerClassName: "appointment-dialog-card__footer",
  });
  const { overlay, body, footer, close } = panel;

  const positionInfo = document.createElement("div");
  positionInfo.className = "appointment-dialog-position-info";
  positionInfo.innerHTML = `
    <div class="position-info-item"><span>品级:</span> ${position.grade || '未设置'}</div>
    <div class="position-info-item"><span>职责:</span> ${position.description || '无'}</div>
  `;

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "appointment-search-input";
  searchInput.placeholder = "搜索角色姓名或字号...";

  const characterList = document.createElement("div");
  characterList.className = "appointment-character-list";

  const selectedHint = document.createElement("div");
  selectedHint.className = "appointment-selected-hint";
  selectedHint.textContent = "请先选择一位角色，再点击“确认任命”。";

  let selectedCharacter = null;
  let appointing = false;

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  confirmBtn.className = "appointment-dialog-confirm";
  confirmBtn.textContent = "确认任命";
  confirmBtn.disabled = true;

  const updateConfirmState = () => {
    confirmBtn.disabled = !selectedCharacter || appointing;
    selectedHint.textContent = selectedCharacter
      ? `已选择：${getDisplayName(selectedCharacter.name)}`
      : "请先选择一位角色，再点击“确认任命”。";
  };

  const selectCharacter = (item, char) => {
    characterList.querySelectorAll(".appointment-character-item--selected").forEach((el) => {
      el.classList.remove("appointment-character-item--selected");
    });
    item.classList.add("appointment-character-item--selected");
    selectedCharacter = char;
    updateConfirmState();
  };

  const renderCharacters = (filter = "") => {
    characterList.innerHTML = "";
    const filtered = filter 
      ? availableCharacters.filter(c => c.name.includes(filter) || (c.courtesyName && c.courtesyName.includes(filter)))
      : availableCharacters;

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "appointment-empty";
      empty.textContent = filter ? "未找到匹配的角色" : "暂无可用角色";
      characterList.appendChild(empty);
      return;
    }

    filtered.slice(0, 30).forEach(char => {
      const displayName = getDisplayName(char.name);
      const item = document.createElement("div");
      item.className = "appointment-character-item";
      
      const avatar = document.createElement("div");
      avatar.className = "appointment-character-avatar";
      avatar.appendChild(createAvatarImg(displayName, displayName?.charAt(0) || "?"));

      const info = document.createElement("div");
      info.className = "appointment-character-info";
      
      const nameEl = document.createElement("div");
      nameEl.className = "appointment-character-name";
      nameEl.textContent = displayName;
      
      const metaEl = document.createElement("div");
      metaEl.className = "appointment-character-meta";
      const metaParts = [];
      if (char.courtesyName) metaParts.push(`字${char.courtesyName}`);
      if (char.factionLabel) metaParts.push(char.factionLabel);
      if (char.birthYear) metaParts.push(`${char.birthYear}年生`);
      metaEl.textContent = metaParts.join(" · ");

      const loyaltyEl = document.createElement("div");
      loyaltyEl.className = "appointment-character-loyalty";
      const stateLoyalty = state.loyalty || {};
      const loyaltyValue = stateLoyalty[char.id] !== undefined ? stateLoyalty[char.id] : (char.loyalty || 30);
      loyaltyEl.textContent = `忠诚: ${loyaltyValue}`;

      info.appendChild(nameEl);
      info.appendChild(metaEl);
      info.appendChild(loyaltyEl);

      item.appendChild(avatar);
      item.appendChild(info);

      item.addEventListener("click", () => selectCharacter(item, char));

      characterList.appendChild(item);
    });
  };

  searchInput.addEventListener("input", (e) => {
    renderCharacters(e.target.value);
  });

  confirmBtn.addEventListener("click", async () => {
    if (!selectedCharacter || appointing) return;

    appointing = true;
    confirmBtn.textContent = "任命中...";
    updateConfirmState();

    try {
      const result = await requestAppoint(position.id, selectedCharacter.id);
      if (result?.success === false) {
        showError(`任命失败: ${result.error || "未知错误"}`);
        return;
      }

      const s = getState();
      const appointmentEffects = buildAppointmentOutcomeEffects(s, result?.appointments, result?.effects);
      const nextNation = applyEffectsModule(s.nation || {}, appointmentEffects, s.loyalty || {}).nation;
      setState({
        ...buildAppointmentPatch(s, position.id, selectedCharacter.id),
        ...promoteGeneratedCandidate(s, selectedCharacter.id),
        nation: nextNation,
      });
      overlay.remove();
      const container = document.getElementById("view-container");
      if (container) {
        container.innerHTML = "";
        renderCourtInteractiveView(container, { useLegacyLayout: useLegacyLayoutForContainer(container) });
      }
    } catch (e) {
      showError(`任命失败: ${e.message}`);
    } finally {
      appointing = false;
      confirmBtn.textContent = "确认任命";
      updateConfirmState();
    }
  });

  body.appendChild(positionInfo);
  body.appendChild(selectedHint);
  body.appendChild(searchInput);
  body.appendChild(characterList);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "appointment-dialog-cancel";
  cancelBtn.textContent = "取消";
  cancelBtn.addEventListener("click", close);
  footer.appendChild(confirmBtn);
  footer.appendChild(cancelBtn);

  app.appendChild(overlay);
  renderCharacters();
  searchInput.focus();
}

export async function renderCourtView(container, options = {}) {
  const { useLegacyLayout = false } = options;
  const state = getState();
  await ensureCourtViewDataLoaded();

  container.innerHTML = "";

  if (useLegacyLayout) {
    if (!currentMinisterChatId) {
      renderMinisterList(container, state, tagsConfigCache);
      await renderPositionMap(container, state);
      return;
    }
    const minister = getCourtMinistersFromState(state).find((m) => m.id === currentMinisterChatId);
    if (!minister) {
      currentMinisterChatId = null;
      await renderPositionMap(container, state);
      return;
    }
    ensureConversation(minister);
    renderMinisterChat(container, state, tagsConfigCache, minister);
    return;
  }

  await renderCourtPageShell(container, state, {
    mainTitle: currentMinisterChatId ? "奏对与交互" : "官职与流转",
    mainHint: currentMinisterChatId
      ? "保留对话与任命交互，同时把其承载位置统一到玩法页模板里。"
      : "保留原有官职图和部门折叠交互，只替换外层壳。",
    renderMain: async (mainHost) => {
      if (!currentMinisterChatId) {
        await renderPositionMap(mainHost, state);
        return;
      }
      const minister = getCourtMinistersFromState(state).find((m) => m.id === currentMinisterChatId);
      if (!minister) {
        currentMinisterChatId = null;
        await renderPositionMap(mainHost, state);
        return;
      }
      ensureConversation(minister);
      renderMinisterChat(mainHost, state, tagsConfigCache, minister);
    },
  });
}

export async function renderCourtInteractiveView(container, options = {}) {
  const { useLegacyLayout = false } = options;
  const state = getState();
  await ensureCourtViewDataLoaded();

  container.innerHTML = "";

  if (useLegacyLayout) {
    if (!currentMinisterChatId) {
      renderMinisterList(container, state, tagsConfigCache);
      await renderPositionMap(container, state);
      return;
    }

    const minister = getCourtMinistersFromState(state).find((item) => item.id === currentMinisterChatId);
    if (!minister) {
      currentMinisterChatId = null;
      await renderPositionMap(container, state);
      return;
    }

    ensureConversation(minister);
    renderMinisterChat(container, state, tagsConfigCache, minister);
    return;
  }

  await renderCourtPageShell(container, state, {
    mainTitle: currentMinisterChatId ? "奏对与交互" : "官职与流转",
    mainHint: currentMinisterChatId
      ? "对话区与任命区继续保留原交互，只统一壳层与摘要区。"
      : "官职地图、部门折叠与任命流转继续保留原逻辑。",
    renderMain: async (mainHost) => {
      if (!currentMinisterChatId) {
        await renderPositionMap(mainHost, state);
        return;
      }

      const minister = getCourtMinistersFromState(state).find((item) => item.id === currentMinisterChatId);
      if (!minister) {
        currentMinisterChatId = null;
        await renderPositionMap(mainHost, state);
        return;
      }

      ensureConversation(minister);
      renderMinisterChat(mainHost, state, tagsConfigCache, minister);
    },
  });
}

export function registerCourtView() {
  router.registerView("court", (container) => {
    renderCourtInteractiveView(container, { useLegacyLayout: useLegacyLayoutForContainer(container) });
  });
}
