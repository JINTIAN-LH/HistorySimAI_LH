import { initLayout, updateTopbarByState, updateMinisterTabBadge, updateGoalBar } from "./layout.js";
import { router } from "./router.js";
import { setStartPhase } from "@client/ui/registerViews.js";
import "@client/ui/registerViews.js";
import { loadJSON, setActiveWorldviewOverrides, clearDataCache } from "./dataLoader.js";
import { getState, setState } from "./state.js";
import { loadGame, applyLoadedGame, getSavedGameplayMode, resolveInitialLoadSlotId, getSaveList, clearGame } from "./storage.js";
import { initializeCoreGameplayState } from "./systems/coreGameplaySystem.js";
import { buildStoryFactsFromState } from "./utils/storyFacts.js";
import { createDefaultRigidState, DEFAULT_RIGID_INITIAL, DEFAULT_RIGID_TRIGGERS } from "./rigid/config.js";
import { getConfiguredWorldVersion, isSaveCompatibleWithWorld } from "./worldVersion.js";
import { mergePlayerRuntimeConfig } from "./playerRuntimeConfig.js";
import { hydratePersistentLocalStorage } from "./persistentBrowserStorage.js";
import { repairImpossibleNaturalDeaths } from "./utils/characterStatusRepair.js";
import { loadCustomWorldview } from "./worldview/worldviewStorage.js";
import { isRigidModeAllowed } from "./worldview/worldviewRuntimeAccessor.js";

function normalizeCharacterId(rawId, aliasToCanonical) {
  if (typeof rawId !== "string") return "";
  const id = rawId.trim();
  if (!id) return "";
  return aliasToCanonical.get(id) || aliasToCanonical.get(id.replace(/_/g, "")) || id;
}

function normalizeAppointmentsMap(appointments, aliasToCanonical) {
  const source = appointments && typeof appointments === "object" ? appointments : {};
  const out = {};
  Object.entries(source).forEach(([positionId, holderId]) => {
    if (typeof positionId !== "string" || typeof holderId !== "string") return;
    const normalizedHolder = normalizeCharacterId(holderId, aliasToCanonical);
    if (!normalizedHolder) return;
    out[positionId] = normalizedHolder;
  });
  return out;
}

async function loadWorldviewDataWithFallback() {
  const worldviewCandidates = [
    "data/worldview.json",
    "data/fallbacks/southernSong.worldview.json",
  ];
  for (const path of worldviewCandidates) {
    try {
      const res = await fetch(path, { cache: "no-cache" });
      if (res.ok) {
        return await res.json();
      }
    } catch {
      // Try next candidate.
    }
  }
  return {};
}

async function loadWorldviewOverridesWithFallback() {
  const overrideCandidates = [
    "data/worldviewOverrides.json",
    "data/fallbacks/southernSong.worldviewOverrides.json",
  ];
  for (const path of overrideCandidates) {
    try {
      const res = await fetch(path, { cache: "no-cache" });
      if (res.ok) {
        const parsed = await res.json();
        if (parsed && typeof parsed === "object") {
          return parsed;
        }
      }
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

async function preloadBasicData(preferredMode = null) {
  // ── 自定义世界观注入 ──
  const customWorldview = loadCustomWorldview();
  let resolvedWorldviewData = null;
  let resolvedWorldviewOverrides = null;
  if (customWorldview && customWorldview.overrides) {
    resolvedWorldviewData = customWorldview.worldview || {};
    resolvedWorldviewOverrides = customWorldview.overrides;
    console.info("[bootstrap] 使用自定义世界观:", customWorldview.meta?.title || customWorldview.worldview?.id || "unknown");
  } else {
    const [worldviewData, worldviewOverrides] = await Promise.all([
      loadWorldviewDataWithFallback(),
      loadWorldviewOverridesWithFallback(),
    ]);
    resolvedWorldviewData = worldviewData || {};
    resolvedWorldviewOverrides = worldviewOverrides;
  }

  setActiveWorldviewOverrides(resolvedWorldviewOverrides);
  clearDataCache();

  const [config, balanceConfig, characters, factionsData, goals, nationInit, positionsData, rigidInitialData, rigidTriggerData, rigidHistoryEvents] = await Promise.all([
    loadJSON("data/config.json"),
    loadJSON("data/balanceConfig.json").catch(() => ({})),
    loadJSON("data/characters.json"),
    loadJSON("data/factions.json").catch(() => ({ factions: [] })),
    loadJSON("data/goals.json").catch(() => []),
    loadJSON("data/nationInit.json").catch(() => ({})),
    loadJSON("data/positions.json").catch(() => ({ positions: [] })),
    loadJSON("data/rigidInitialState.json").catch(() => DEFAULT_RIGID_INITIAL),
    loadJSON("data/rigidTriggers.json").catch(() => DEFAULT_RIGID_TRIGGERS),
    loadJSON("data/rigidHistoryEvents.json").catch(() => []),
  ]);

  const worldviewConfigPatch = {
    ...(resolvedWorldviewData?.gameTitle ? { gameTitle: resolvedWorldviewData.gameTitle } : {}),
    ...(resolvedWorldviewData?.phaseLabels && typeof resolvedWorldviewData.phaseLabels === "object"
      ? { phaseLabels: resolvedWorldviewData.phaseLabels }
      : {}),
  };
  const overridesConfigPatch = customWorldview?.overrides?.config && typeof customWorldview.overrides.config === "object"
    ? customWorldview.overrides.config
    : {};
  const resolvedConfig = {
    ...(config || {}),
    ...worldviewConfigPatch,
    ...overridesConfigPatch,
  };

  const allCharacters = characters.characters || characters.ministers || [];
  const aliasToCanonical = (() => {
    const map = new Map();
    allCharacters.forEach((m) => {
      if (!m || typeof m.id !== "string") return;
      const id = m.id.trim();
      if (!id) return;
      map.set(id, id);
      map.set(id.replace(/_/g, ""), id);
    });
    return map;
  })();
  const loyalty = {};
  allCharacters.forEach((m) => {
    loyalty[m.id] = m.loyalty || 50;
  });

  const current = getState();
  const resolvedPlayer = {
    ...(current.player || {}),
    ...(resolvedWorldviewData?.playerRole?.name ? { name: resolvedWorldviewData.playerRole.name } : {}),
    ...(resolvedWorldviewData?.playerRole?.title ? { title: resolvedWorldviewData.playerRole.title } : {}),
  };
  const existingLoyalty = current.loyalty || {};
  const mergedLoyalty = { ...loyalty };
  for (const [k, v] of Object.entries(existingLoyalty)) {
    if (typeof v === "number") mergedLoyalty[k] = v;
  }

  const factions = factionsData.factions || [];
  const nation = current.nation && current.nation.treasury !== undefined
    ? current.nation
    : {
        treasury: nationInit.treasury || 500000,
        grain: nationInit.grain || 30000,
        militaryStrength: nationInit.militaryStrength || 60,
        civilMorale: nationInit.civilMorale || 35,
        borderThreat: nationInit.borderThreat || 75,
        disasterLevel: nationInit.disasterLevel || 70,
        corruptionLevel: nationInit.corruptionLevel || 80,
      };

  const coreState = initializeCoreGameplayState(current, factions, resolvedConfig, nationInit);
  const mergedFactions = Array.isArray(current.factions) && current.factions.length ? current.factions : factions;
  const externalPowers = (() => {
    const initMap = {};
    const existing = current.externalPowers || {};
    const threats = Array.isArray(nationInit.externalThreats) ? nationInit.externalThreats : [];
    threats.forEach((t) => {
      const id = t.id || t.name;
      if (!id) return;
      if (typeof existing[id] === "number") {
        initMap[id] = existing[id];
      } else if (typeof t.power === "number") {
        initMap[id] = t.power;
      } else {
        initMap[id] = 100;
      }
    });
    return initMap;
  })();

  const provinceStats = (() => {
    const map = {};
    const provinces = Array.isArray(nationInit.provinces) ? nationInit.provinces : [];
    const existingProvinceStats = current.provinceStats && typeof current.provinceStats === "object"
      ? current.provinceStats
      : {};
    provinces.forEach((p) => {
      if (!p || !p.name) return;
      const existing = existingProvinceStats[p.name] || {};
      const baseTaxSilver = typeof existing.__baseTaxSilver === "number"
        ? existing.__baseTaxSilver
        : (typeof p.taxSilver === "number" ? p.taxSilver : 0);
      const baseTaxGrain = typeof existing.__baseTaxGrain === "number"
        ? existing.__baseTaxGrain
        : (typeof p.taxGrain === "number" ? p.taxGrain : 0);
      const baseRecruits = typeof existing.__baseRecruits === "number"
        ? existing.__baseRecruits
        : (typeof p.recruits === "number" ? p.recruits : 0);
      map[p.name] = {
        taxSilver: typeof existing.taxSilver === "number"
          ? existing.taxSilver
          : (typeof p.taxSilver === "number" ? p.taxSilver : 0),
        taxGrain: typeof existing.taxGrain === "number"
          ? existing.taxGrain
          : (typeof p.taxGrain === "number" ? p.taxGrain : 0),
        recruits: typeof existing.recruits === "number"
          ? existing.recruits
          : (typeof p.recruits === "number" ? p.recruits : 0),
        morale: typeof existing.morale === "number"
          ? existing.morale
          : (typeof p.morale === "number" ? p.morale : 50),
        corruption: typeof existing.corruption === "number"
          ? existing.corruption
          : (typeof p.corruption === "number" ? p.corruption : 50),
        disaster: typeof existing.disaster === "number"
          ? existing.disaster
          : (typeof p.disaster === "number" ? p.disaster : 50),
        __baseTaxSilver: baseTaxSilver,
        __baseTaxGrain: baseTaxGrain,
        __baseRecruits: baseRecruits,
      };
    });
    return map;
  })();

  const defaultAppointments = (() => {
    const map = {};
    const positions = Array.isArray(positionsData?.positions) ? positionsData.positions : [];
    positions.forEach((pos) => {
      if (!pos || typeof pos.id !== "string") return;
      if (typeof pos.defaultHolder === "string" && pos.defaultHolder) {
        map[pos.id] = normalizeCharacterId(pos.defaultHolder, aliasToCanonical);
      }
    });
    return map;
  })();

  const hasExistingAppointments = current.appointments && Object.keys(current.appointments).length > 0;
  const normalizedExistingAppointments = normalizeAppointmentsMap(current.appointments, aliasToCanonical);
  const normalizedDefaultAppointments = normalizeAppointmentsMap(defaultAppointments, aliasToCanonical);

  const requestedMode = current.mode || preferredMode || resolvedConfig?.gameplayMode || "classic";
  const selectedMode = requestedMode === "rigid_v1" && !isRigidModeAllowed({ config: { worldviewOverrides: customWorldview?.overrides } })
    ? "classic"
    : requestedMode;
  const worldVersion = customWorldview?.worldview?.id || getConfiguredWorldVersion(resolvedConfig);
  const resolvedRigidState = current.rigid && typeof current.rigid === "object"
    ? current.rigid
    : createDefaultRigidState(rigidInitialData || DEFAULT_RIGID_INITIAL);
  const rigidCalendar = resolvedRigidState?.calendar || { year: 1627, month: 8 };
  const repairedCharacterStatus = repairImpossibleNaturalDeaths({
    characters: allCharacters,
    characterStatus: current.characterStatus,
    config,
    currentYear: current.currentYear,
  });

  if (repairedCharacterStatus.repairedIds.length) {
    console.warn(
      `[bootstrap] repaired impossible early natural deaths for: ${repairedCharacterStatus.repairedIds.join(", ")}`
    );
  }

  setState({
    config: {
      ...mergePlayerRuntimeConfig(resolvedConfig || {}),
      worldVersion,
      worldviewData: resolvedWorldviewData,
      worldviewOverrides: resolvedWorldviewOverrides || undefined,
      balance: balanceConfig || {},
      gameplayMode: selectedMode,
      rigid: {
        initialState: rigidInitialData || DEFAULT_RIGID_INITIAL,
        triggers: rigidTriggerData || DEFAULT_RIGID_TRIGGERS,
        historyEvents: Array.isArray(rigidHistoryEvents) ? rigidHistoryEvents : [],
      },
    },
    allCharacters,
    factions: mergedFactions,
    loyalty: mergedLoyalty,
    goals: Array.isArray(goals) ? goals : [],
    nation,
    appointments: hasExistingAppointments ? normalizedExistingAppointments : normalizedDefaultAppointments,
    characterStatus: repairedCharacterStatus.characterStatus,
    storyHistory: current.storyHistory || [],
    ...coreState,
    externalPowers,
    provinceStats,
    positionsMeta: positionsData || { positions: [], departments: [] },
    mode: selectedMode,
    worldVersion,
    player: resolvedPlayer,
    currentQuarterAgenda: [],
    currentQuarterFocus: null,
    rigid: resolvedRigidState,
    ...(selectedMode === "rigid_v1"
      ? {
        currentYear: Math.max(1, (Number(rigidCalendar.year) || 1627) - 1626),
        currentMonth: Number(rigidCalendar.month) || 8,
        currentPhase: "morning",
      }
      : {}),
  });

  setState({ storyFacts: buildStoryFactsFromState(getState()) });
}

function shouldShowStartView() {
  const state = getState();
  return !state.gameStarted;
}

function findIncompatibleSaves(saves, config) {
  return (Array.isArray(saves) ? saves : []).filter((saveObj) => !isSaveCompatibleWithWorld(saveObj, config));
}

function promptAndCleanupIncompatibleSaves(incompatibleSaves, mode, expectedWorldVersion) {
  if (!Array.isArray(incompatibleSaves) || !incompatibleSaves.length) return;
  if (typeof window === "undefined" || typeof window.confirm !== "function") return;

  const preview = incompatibleSaves
    .slice(0, 5)
    .map((save) => {
      const slot = save?.slotId || "unknown";
      const saveWorld = save?.game_data?.worldVersion || "legacy";
      return `- ${slot}: ${saveWorld}`;
    })
    .join("\n");

  const more = incompatibleSaves.length > 5 ? `\n...以及另外 ${incompatibleSaves.length - 5} 个存档` : "";
  const message = [
    `检测到 ${incompatibleSaves.length} 个旧世界观存档，与当前版本不兼容。`,
    `当前世界观: ${expectedWorldVersion}`,
    "",
    "不兼容存档预览:",
    preview,
    more,
    "",
    "点击“确定”将一键清理这些旧存档（仅清理不兼容项）。",
    "点击“取消”将保留它们，但后续可能继续出现加载异常提示。",
  ].join("\n");

  const confirmed = window.confirm(message);
  if (!confirmed) return;

  incompatibleSaves.forEach((saveObj) => {
    if (!saveObj?.slotId) return;
    clearGame({ slotId: saveObj.slotId, mode });
  });

  console.info(
    `[bootstrap] cleaned ${incompatibleSaves.length} incompatible saves for worldview ${expectedWorldVersion}`
  );
}

export async function bootstrap() {
  const bootstrapConfig = await loadJSON("data/config.json").catch(() => ({}));
  await hydratePersistentLocalStorage();
  initLayout();
  const preferredMode = getSavedGameplayMode();

  const allSaves = getSaveList(preferredMode);
  const incompatibleSaves = findIncompatibleSaves(allSaves, bootstrapConfig);
  if (incompatibleSaves.length) {
    promptAndCleanupIncompatibleSaves(
      incompatibleSaves,
      preferredMode,
      getConfiguredWorldVersion(bootstrapConfig)
    );
  }

  const initialSlotId = resolveInitialLoadSlotId(preferredMode);
  const loaded = loadGame(initialSlotId, preferredMode);
  if (loaded && isSaveCompatibleWithWorld(loaded, bootstrapConfig)) {
    applyLoadedGame(loaded);
  } else if (loaded) {
    console.warn(
      `[bootstrap] detected incompatible save world version (${loaded?.game_data?.worldVersion || "legacy"}); skipping autoload for new worldview ${getConfiguredWorldVersion(bootstrapConfig)}`
    );
  }

  await preloadBasicData(preferredMode);
  const stateAfterLoad = getState();
  if (stateAfterLoad.config?.gameTitle) {
    document.title = stateAfterLoad.config.gameTitle;
  }
  updateTopbarByState(stateAfterLoad);
  updateGoalBar(stateAfterLoad);
  updateMinisterTabBadge(stateAfterLoad);

  const showStart = shouldShowStartView();

  router.init();

  if (showStart) {
    setStartPhase("intro");
    router.setView(router.VIEW_IDS.START);
  } else {
    router.setView(router.VIEW_IDS.EDICT);
  }
}

let mountPromise = null;

export function mountLegacyGameApp() {
  if (mountPromise) return mountPromise;

  mountPromise = new Promise((resolve, reject) => {
    const start = () => {
      bootstrap().then(resolve).catch(reject);
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start, { once: true });
      return;
    }

    start();
  }).catch((err) => {
    console.error(err);
    throw err;
  });

  return mountPromise;
}

if (typeof window !== "undefined" && !window.__HISTORY_SIM_MANUAL_BOOTSTRAP__) {
  mountLegacyGameApp().catch(() => {});
}
