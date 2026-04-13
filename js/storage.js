import { getState, setState, resetState } from "./state.js";
import { updateTopbarByState, updateMinisterTabBadge } from "./layout.js";
import { getConfiguredWorldVersion } from "./worldVersion.js";
import { mergePlayerRuntimeConfig, stripPlayerRuntimeConfig } from "./playerRuntimeConfig.js";
import { getPersistentLocalItem, removePersistentLocalItem, setPersistentLocalItem } from "./persistentBrowserStorage.js";


const STORAGE_KEY_PREFIX = "chongzhen_sim_save_v2"; // v2: 多槽位+结构升级
const STORAGE_MODE_KEY = "chongzhen_sim_gameplay_mode_v1";
const ACTIVE_SLOT_KEY_PREFIX = "chongzhen_sim_active_slot_v1";
const COURT_CHATS_CAP = 50;
const DEFAULT_MODE = "classic";
const SAVE_VERSION = "1.0";
export const MAX_MANUAL_SLOTS = 3;
const MAX_AUTO_SLOTS = 10;
const BACKUP_SUFFIX = "_bak";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeMode(mode) {
  return typeof mode === "string" && mode ? mode : DEFAULT_MODE;
}

function getSaveKey(mode, slotId) {
  return `${STORAGE_KEY_PREFIX}_${normalizeMode(mode)}_${normalizeSlotId(slotId)}`;
}

function getLegacySaveKey(slotId) {
  return `${STORAGE_KEY_PREFIX}_${normalizeSlotId(slotId)}`;
}

function getActiveSlotKey(mode) {
  const safeMode = normalizeMode(mode);
  return `${ACTIVE_SLOT_KEY_PREFIX}_${safeMode}`;
}

function normalizeSlotId(slotId) {
  return typeof slotId === "string" && slotId ? slotId : "manual_01";
}

function getSaveMode(saveObj) {
  return saveObj?.game_data?.mode || saveObj?.mode || DEFAULT_MODE;
}

function readSaveObject(raw, slotId, expectedMode = null) {
  if (!raw) return null;
  try {
    const saveObj = JSON.parse(raw);
    const { game_data, ai_visible_data, save_version, checksum } = saveObj;
    const calc = simpleChecksum(JSON.stringify(game_data) + JSON.stringify(ai_visible_data) + (save_version || "1.0"));
    if (checksum !== calc) {
      console.warn("存档校验失败，可能已损坏");
      return null;
    }

    const safeMode = expectedMode ? normalizeMode(expectedMode) : null;
    if (safeMode && getSaveMode(saveObj) !== safeMode) {
      return null;
    }

    return { slotId: normalizeSlotId(slotId), ...saveObj };
  } catch (e) {
    console.error("读取存档失败", e);
    return null;
  }
}

function readScopedSave(slotId, mode) {
  if (!canUseStorage()) return null;
  const safeSlotId = normalizeSlotId(slotId);
  const safeMode = normalizeMode(mode);
  const raw = getPersistentLocalItem(getSaveKey(safeMode, safeSlotId));
  return readSaveObject(raw, safeSlotId, safeMode);
}

function readLegacySave(slotId, mode = null) {
  if (!canUseStorage()) return null;
  const safeSlotId = normalizeSlotId(slotId);
  const raw = getPersistentLocalItem(getLegacySaveKey(safeSlotId));
  return readSaveObject(raw, safeSlotId, mode);
}

function migrateLegacySave(slotId, mode, saveObj) {
  if (!canUseStorage() || !saveObj) return;
  const safeSlotId = normalizeSlotId(slotId);
  const safeMode = normalizeMode(mode);
  const payload = JSON.stringify(saveObj);
  setPersistentLocalItem(getSaveKey(safeMode, safeSlotId), payload);
  removePersistentLocalItem(getLegacySaveKey(safeSlotId));
}

export function formatGameTimeFromState(state) {
  const year = Number(state?.currentYear) || 0;
  if (!year) return "";
  const month = Number(state?.currentMonth) || 1;
  const day = Number(state?.currentDay) || 1;
  return `建炎${year}年${month}月第${day}日`;
}

export function formatSaveTimestamp(timestampSeconds) {
  const timestamp = Number(timestampSeconds);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "-";
  const date = new Date(timestamp * 1000);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function setActiveSaveSlot(slotId, mode = getSavedGameplayMode()) {
  if (!canUseStorage()) return;
  setPersistentLocalItem(getActiveSlotKey(mode), normalizeSlotId(slotId));
}

export function getActiveSaveSlot(mode = getSavedGameplayMode()) {
  if (!canUseStorage()) return "manual_01";
  return normalizeSlotId(getPersistentLocalItem(getActiveSlotKey(mode)));
}

function getLatestManualSlotIdByMode(mode) {
  const latestSave = getSaveList(mode)
    .filter((save) => save.slotId.startsWith("manual_"))
    .sort((left, right) => (Number(right.timestamp) || 0) - (Number(left.timestamp) || 0))[0];
  return latestSave?.slotId || null;
}

export function resolveInitialLoadSlotId(mode = getSavedGameplayMode()) {
  const safeMode = normalizeMode(mode);
  const activeSlotId = getActiveSaveSlot(mode);
  const activeSave = loadGame(activeSlotId, safeMode);
  if (activeSave) {
    return activeSlotId;
  }
  return getLatestManualSlotIdByMode(safeMode) || activeSlotId;
}

// Set the storage mode in localStorage
export function setStorageMode(mode) {
  if (!canUseStorage()) return;
  const safeMode = normalizeMode(mode);
  setPersistentLocalItem(STORAGE_MODE_KEY, safeMode);
}

// Get the storage mode from localStorage
export function getStorageMode() {
  if (!canUseStorage()) return DEFAULT_MODE;
  const mode = getPersistentLocalItem(STORAGE_MODE_KEY);
  return typeof mode === "string" && mode ? mode : DEFAULT_MODE;
}

export const setSavedGameplayMode = setStorageMode;
export const getSavedGameplayMode = getStorageMode;

export function saveGame(opts = {}) {
  if (!canUseStorage()) return;
  const state = getState();
  try {
    // 1. 生成标准化存档结构
    const now = Date.now();
    const slotId = normalizeSlotId(opts.slotId || state.slotId);
    const mode = normalizeMode(opts.mode || state.mode);
    const worldVersion = getConfiguredWorldVersion(state.config || { worldVersion: state.worldVersion });
    const saveId = `save_${now}_${slotId}`;
    // game_data: 取 state 主体
    const { mode: _ignoredMode, ...rest } = state;
    const game_data = {
      ...rest,
      config: stripPlayerRuntimeConfig(rest.config),
      mode,
      slotId,
      worldVersion,
    };
    // ai_visible_data: 可根据需要提取AI相关数据，这里简单示例
    const ai_visible_data = {
      player: game_data.player,
      nation: game_data.nation,
      currentDay: game_data.currentDay,
      currentPhase: game_data.currentPhase,
      // 可扩展更多AI关心字段
    };
    // 计算checksum（简单MD5实现/占位）
    const checksum = simpleChecksum(JSON.stringify(game_data) + JSON.stringify(ai_visible_data) + SAVE_VERSION);
    const saveObj = {
      save_version: SAVE_VERSION,
      save_id: saveId,
      timestamp: Math.floor(now / 1000),
      game_time: formatGameTimeFromState(game_data),
      player_progress: game_data.trackedGoalId || "",
      checksum,
      game_data,
      ai_visible_data
    };
    const payload = JSON.stringify(saveObj);
    setPersistentLocalItem(getSaveKey(mode, slotId), payload);
    removePersistentLocalItem(getLegacySaveKey(slotId));
    setState({ slotId });
    setSavedGameplayMode(mode);
    setActiveSaveSlot(slotId, mode);
  } catch (e) {
    console.error("保存存档失败", e);
  }
}

export function loadGame(slotId = "manual_01", mode = getSavedGameplayMode()) {
  if (!canUseStorage()) return null;
  const safeSlotId = normalizeSlotId(slotId);
  const safeMode = normalizeMode(mode);
  const scopedSave = readScopedSave(safeSlotId, safeMode);
  if (scopedSave) {
    return scopedSave;
  }

  const legacySave = readLegacySave(safeSlotId, safeMode);
  if (legacySave) {
    migrateLegacySave(safeSlotId, safeMode, legacySave);
    return legacySave;
  }

  return null;
}


export function applyLoadedGame(saveObj) {
  if (!saveObj || !saveObj.game_data) return;
  const slotId = normalizeSlotId(saveObj.slotId || saveObj.game_data.slotId);
  const nextGameData = {
    ...saveObj.game_data,
    config: mergePlayerRuntimeConfig(saveObj.game_data.config),
  };
  resetState();
  setState({ ...nextGameData, slotId });
  if (saveObj.game_data.mode) {
    setSavedGameplayMode(saveObj.game_data.mode);
    setActiveSaveSlot(slotId, saveObj.game_data.mode);
  }
  const state = getState();
  updateTopbarByState(state);
  updateMinisterTabBadge(state);
}

export function clearGame(opts = {}) {
  const slotId = normalizeSlotId(opts.slotId);
  const targetMode = normalizeMode(opts.mode || getSavedGameplayMode());
  if (!canUseStorage()) return;
  removePersistentLocalItem(getSaveKey(targetMode, slotId));
  const legacySave = readLegacySave(slotId, targetMode);
  if (legacySave) {
    removePersistentLocalItem(getLegacySaveKey(slotId));
  }
  if (getActiveSaveSlot(targetMode) === slotId) {
    setActiveSaveSlot("manual_01", targetMode);
  }
}

export function autoSaveIfEnabled() {
  const state = getState();
  const config = state.config || {};
  if (config.autoSave === false) return;
  // 自动存档：覆盖当前手动槽位（如未指定则manual_01）
  const slotId = state.slotId || "manual_01";
  saveGame({ slotId });
}

// 工具函数：获取下一个自动存档槽位
function getNextAutoSlotId() {
  // 简单循环 auto_01 ~ auto_10
  let idx = Number(getPersistentLocalItem("czsim_auto_idx") || 1);
  idx = (idx % MAX_AUTO_SLOTS) + 1;
  setPersistentLocalItem("czsim_auto_idx", String(idx));
  return `auto_${String(idx).padStart(2, "0")}`;
}

// 简单MD5占位（实际可用第三方库）
function simpleChecksum(str) {
  let hash = 0, i, chr;
  if (str.length === 0) return hash.toString();
  for (i = 0; i < str.length; i++) {
    chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16);
}

// 获取所有存档列表
export function getSaveList(mode = getSavedGameplayMode()) {
  if (!canUseStorage()) return [];
  const safeMode = normalizeMode(mode);
  const saves = [];
  for (let i = 1; i <= MAX_MANUAL_SLOTS; i++) {
    const slotId = `manual_${String(i).padStart(2, "0")}`;
    const save = readScopedSave(slotId, safeMode) || readLegacySave(slotId, safeMode);
    if (save) {
      saves.push(save);
    }
  }
  // 自动存档
  for (let i = 1; i <= MAX_AUTO_SLOTS; i++) {
    const slotId = `auto_${String(i).padStart(2, "0")}`;
    const save = readScopedSave(slotId, safeMode) || readLegacySave(slotId, safeMode);
    if (save) {
      saves.push(save);
    }
  }
  // 快速存档
  const quickSave = readScopedSave("quick", safeMode) || readLegacySave("quick", safeMode);
  if (quickSave) {
    saves.push(quickSave);
  }
  return saves;
}
