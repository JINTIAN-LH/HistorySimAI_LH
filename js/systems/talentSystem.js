/**
 * 人才玩法系统
 *
 * 管理人才池（pool）、交互历史（interactionHistory）和忠诚度变化，
 * 提供招募、查询、任用、更新的纯逻辑函数，不直接操作 DOM。
 * 所有函数均为纯函数或通过 getState/setState 操作状态。
 */

import { getState, setState } from "../state.js";

// ─── 常量 ─────────────────────────────────────────────────────────────────────

export const TALENT_QUALITY_ORDER = ["epic", "excellent", "ordinary"];

export const TALENT_FIELD_COLORS = {
  military: "#c0392b",
  politics: "#8B0000",
  economy: "#b8860b",
  culture: "#2e5d8e",
};

export const TALENT_SOURCE_LABEL = {
  imperial_exam: "科举",
  recommend: "举荐",
  search: "寻访",
  generated: "延揽",
};

// ─── 状态读取 ─────────────────────────────────────────────────────────────────

export function getTalentState(state = getState()) {
  const raw = state?.talent;
  return {
    pool: Array.isArray(raw?.pool) ? raw.pool : [],
    interactionHistory: (raw?.interactionHistory && typeof raw.interactionHistory === "object") ? raw.interactionHistory : {},
    recruiting: Boolean(raw?.recruiting),
  };
}

export function getTalentPool(state = getState()) {
  return getTalentState(state).pool;
}

export function getTalentById(talentId, state = getState()) {
  return getTalentPool(state).find((t) => t.id === talentId) || null;
}

export function getTalentInteractionHistory(talentId, state = getState()) {
  const history = getTalentState(state).interactionHistory;
  const raw = history[talentId];
  return Array.isArray(raw) ? raw : [];
}

// ─── 状态写入 ─────────────────────────────────────────────────────────────────

function mergeTalentState(partial) {
  const state = getState();
  const current = getTalentState(state);
  setState({ talent: { ...current, ...partial } });
}

/**
 * 将一批新人才追加到人才池中（招募后调用）。
 * 若 id 已存在则跳过（防止重复）。
 */
export function appendTalentPool(newTalents) {
  if (!Array.isArray(newTalents) || !newTalents.length) return;
  const { pool } = getTalentState();
  const existIds = new Set(pool.map((t) => t.id));
  const existNames = new Set(pool.map((t) => String(t?.name || "").trim()).filter(Boolean));
  const seenIds = new Set();
  const seenNames = new Set();
  const deduped = newTalents.filter((t) => {
    if (!t || typeof t.id !== "string") return false;
    const name = String(t?.name || "").trim();
    if (existIds.has(t.id) || seenIds.has(t.id)) return false;
    if (name && (existNames.has(name) || seenNames.has(name))) return false;
    seenIds.add(t.id);
    if (name) seenNames.add(name);
    return true;
  });
  if (!deduped.length) return;
  mergeTalentState({ pool: [...pool, ...deduped] });
}

/**
 * 从人才池中移除指定人才（任用后调用）。
 */
export function removeTalentFromPool(talentId) {
  const { pool } = getTalentState();
  mergeTalentState({ pool: pool.filter((t) => t.id !== talentId) });
}

/**
 * 更新人才的忠诚度和态度（交互后调用）。
 */
export function applyTalentInteractionResult(talentId, { loyaltyDelta = 0, attitude = null } = {}) {
  const { pool } = getTalentState();
  const updated = pool.map((t) => {
    if (t.id !== talentId) return t;
    const currentLoyalty = t.ability?.loyalty ?? 50;
    const newLoyalty = Math.max(0, Math.min(100, currentLoyalty + loyaltyDelta));
    return {
      ...t,
      ability: { ...t.ability, loyalty: newLoyalty },
      ...(attitude ? { attitude } : {}),
    };
  });
  mergeTalentState({ pool: updated });
}

/**
 * 追加一轮交互记录。
 */
export function appendTalentInteractionEntry(talentId, entry) {
  const { interactionHistory } = getTalentState();
  const existing = Array.isArray(interactionHistory[talentId]) ? interactionHistory[talentId] : [];
  const updated = [...existing, { ...entry, timestamp: entry.timestamp || Date.now() }];
  mergeTalentState({
    interactionHistory: {
      ...interactionHistory,
      [talentId]: updated.slice(-40), // 最多保留 40 条历史
    },
  });
}

export function clearTalentInteractionHistory(talentId) {
  const { interactionHistory } = getTalentState();
  const updatedHistory = { ...interactionHistory };
  delete updatedHistory[talentId];
  mergeTalentState({ interactionHistory: updatedHistory });
}

export function setRecruiting(value) {
  mergeTalentState({ recruiting: Boolean(value) });
}

// ─── 对接 appointments（任用） ────────────────────────────────────────────────

/**
 * 将人才池中的人才任用到某个职位。
 * 从人才池删除该人才，同时返回需要写入 appointments 的 patch，
 * 调用方负责最终 setState。
 *
 * @returns {{ appointmentPatch: Record<string, string> | null, talent: Object | null }}
 */
export function appointTalentToPosition(talentId, positionId) {
  const state = getState();
  const talent = getTalentById(talentId, state);
  if (!talent) return { appointmentPatch: null, talent: null };
  const nextAppointments = {
    ...(state.appointments && typeof state.appointments === "object" ? state.appointments : {}),
  };
  Object.entries(nextAppointments).forEach(([existingPositionId, holderId]) => {
    if (holderId === talentId && existingPositionId !== positionId) {
      delete nextAppointments[existingPositionId];
    }
  });

  const replacedTalentId = typeof nextAppointments[positionId] === "string"
    ? nextAppointments[positionId]
    : null;
  nextAppointments[positionId] = talentId;

  const allCharacters = Array.isArray(state.allCharacters) ? [...state.allCharacters] : [];
  if (!allCharacters.some((item) => item?.id === talentId)) {
    allCharacters.push({
      ...talent,
      isAlive: true,
    });
  }

  const characterStatus = {
    ...(state.characterStatus && typeof state.characterStatus === "object" ? state.characterStatus : {}),
    [talentId]: {
      ...(state.characterStatus?.[talentId] || {}),
      isAlive: true,
    },
  };
  removeTalentFromPool(talentId);
  return {
    nextAppointments,
    nextAllCharacters: allCharacters,
    nextCharacterStatus: characterStatus,
    appointmentPatch: { [positionId]: talentId },
    talent,
    replacedTalentId,
  };
}

// ─── 辅助 ─────────────────────────────────────────────────────────────────────

export function getQualityOrder(quality) {
  return TALENT_QUALITY_ORDER.indexOf(quality);
}

/**
 * 计算人才综合评分（用于排序展示）。
 */
export function computeTalentScore(talent) {
  if (!talent?.ability) return 0;
  const { military = 0, politics = 0, economy = 0, culture = 0, loyalty = 50 } = talent.ability;
  const quality = talent.quality || "ordinary";
  const qBonus = quality === "epic" ? 30 : quality === "excellent" ? 15 : 0;
  return military + politics + economy + culture + Math.round(loyalty * 0.5) + qBonus;
}

/**
 * 按品质、综合评分排序人才列表。
 */
export function sortTalentPool(pool) {
  return [...pool].sort((a, b) => {
    const qA = getQualityOrder(a.quality);
    const qB = getQualityOrder(b.quality);
    if (qA !== qB) return qA - qB; // epic first
    return computeTalentScore(b) - computeTalentScore(a);
  });
}

/**
 * 根据 appointments 找出人才池中已被任用的 id 集合。
 */
export function getAppointedTalentIds(state = getState()) {
  const pool = getTalentPool(state);
  const appointments = state.appointments || {};
  const appointedValues = new Set(Object.values(appointments));
  return new Set(pool.map((t) => t.id).filter((id) => appointedValues.has(id)));
}
