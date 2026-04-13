/**
 * 人才玩法 API 层
 * 负责与服务器的两个新端点通信：
 *   - /api/chongzhen/talentRecruit  (POST) 招募人才
 *   - /api/chongzhen/talentInteract (POST) 与人才交互
 */

import { getState } from "../state.js";
import { buildLlmProxyHeaders, getApiBase, postJsonAndReadText } from "./httpClient.js";
import { getKnownCharactersFromState, normalizeCandidateCharacter } from "../utils/characterRegistry.js";

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(v) ? v : min));
}

function deriveTalentTags(raw, source) {
  const tags = Array.isArray(raw?.tags) ? raw.tags.filter((item) => typeof item === "string" && item.trim()) : [];
  if (tags.length) return tags.slice(0, 4);

  const derived = [];
  const fieldLabelMap = {
    military: "武人",
    politics: "政务",
    economy: "理财",
    culture: "文士",
  };
  const sourceLabelMap = {
    imperial_exam: "科举苗子",
    military_exam: "武举苗子",
    recommend: "举荐人才",
    search: "寻访人才",
    generated: "延揽人才",
  };
  if (raw?.field && fieldLabelMap[raw.field]) derived.push(fieldLabelMap[raw.field]);
  if (raw?.quality === "epic") derived.push("传奇");
  else if (raw?.quality === "excellent") derived.push("俊才");
  else derived.push("待录用");
  if (sourceLabelMap[source]) derived.push(sourceLabelMap[source]);
  return derived.slice(0, 4);
}

function buildUniqueTalentId(baseId, usedIds) {
  let candidateId = baseId;
  while (usedIds.has(candidateId)) {
    candidateId = `${baseId}_${Math.random().toString(36).slice(2, 6)}`;
  }
  usedIds.add(candidateId);
  return candidateId;
}

// ─── 招募人才 ─────────────────────────────────────────────────────────────────

/**
 * 请求 LLM 生成候选人才列表。
 * @param {string} recruitType - "imperial_exam" | "recommend" | "search"
 * @returns {Promise<Array|null>} talent 对象数组，失败返回 null
 */
export async function requestTalentRecruit(recruitType = "recommend") {
  const state = getState();
  const config = state.config || {};
  const apiBase = getApiBase(config, "requestTalentRecruit");
  if (!apiBase) return null;
  const knownCharacters = getKnownCharactersFromState(state);

  const nation = state.nation || {};
  const body = {
    recruitType,
    state: {
      currentYear: state.currentYear,
      currentMonth: state.currentMonth,
      nation,
      appointments: state.appointments || {},
      characterStatus: state.characterStatus || {},
      prestige: state.prestige,
    },
    worldviewData: config.worldviewData || null,
    existingTalentIds: knownCharacters.map((t) => t.id).filter(Boolean),
    existingTalentNames: knownCharacters.map((t) => t.name).filter(Boolean),
  };

  const raw = await postJsonAndReadText(
    `${apiBase}/api/chongzhen/talentRecruit`,
    body,
    "requestTalentRecruit",
    { headers: buildLlmProxyHeaders(config) }
  );

  return parseTalentRecruitPayload(raw, recruitType, state);
}

function parseTalentRecruitPayload(raw, recruitType, state = getState()) {
  if (raw == null) {
    return null;
  }
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (_) {
    console.error("[talentApi] parseTalentRecruitPayload: invalid json", raw?.slice?.(0, 200));
    return null;
  }

  // Handle { talents: [...] } or direct array
  const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.talents) ? parsed.talents : null);
  if (!list) {
    console.error("[talentApi] parseTalentRecruitPayload: expected { talents: [...] }", parsed);
    return null;
  }

  const knownCharacters = getKnownCharactersFromState(state);
  const usedIds = new Set(knownCharacters.map((item) => item?.id).filter(Boolean));
  const normalized = list
    .filter((item) => item && typeof item === "object" && typeof item.name === "string")
    .map((item) => normalizeTalent(item, recruitType, usedIds))
    .filter(Boolean);
  return normalized.length ? normalized : null;
}

function normalizeTalent(raw, recruitType, usedIds = new Set()) {
  if (!raw || typeof raw !== "object") return null;
  const ability = raw.ability && typeof raw.ability === "object" ? raw.ability : {};
  const source = typeof raw.source === "string" && raw.source.trim()
    ? raw.source.trim()
    : recruitType;
  const rawId = typeof raw.id === "string" && raw.id.trim()
    ? raw.id.trim()
    : `talent_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  return normalizeCandidateCharacter({
    ...raw,
    id: buildUniqueTalentId(rawId, usedIds),
    name: String(raw.name || ""),
    quality: ["ordinary", "excellent", "epic"].includes(raw.quality) ? raw.quality : "ordinary",
    field: ["military", "politics", "economy", "culture"].includes(raw.field) ? raw.field : "politics",
    ability: {
      military: clamp(Number(ability.military) || 50, 0, 100),
      politics: clamp(Number(ability.politics) || 50, 0, 100),
      economy: clamp(Number(ability.economy) || 50, 0, 100),
      culture: clamp(Number(ability.culture) || 50, 0, 100),
      loyalty: clamp(Number(ability.loyalty) || 60, 0, 100),
    },
    faction: typeof raw.faction === "string" ? raw.faction : "neutral",
    tags: deriveTalentTags(raw, source),
    source,
  }, { source, factionLabel: typeof raw.factionLabel === "string" ? raw.factionLabel : "中立派" });
}

// ─── 人才交互 ─────────────────────────────────────────────────────────────────

/**
 * 请求 LLM 以人才视角回复玩家消息。
 * @param {Object} talent - 人才对象
 * @param {string} playerMessage - 玩家输入
 * @param {Array} history - 对话历史 [{ role, content, timestamp }]
 * @returns {Promise<{reply: string, loyaltyDelta: number, attitude: string, suggestion: Object|null}|null>}
 */
export async function requestTalentInteract(talent, playerMessage, history = []) {
  const state = getState();
  const config = state.config || {};
  const apiBase = getApiBase(config, "requestTalentInteract");
  if (!apiBase) return null;

  const body = {
    talentId: talent.id,
    talent: {
      id: talent.id,
      name: talent.name,
      quality: talent.quality,
      field: talent.field,
      ability: talent.ability,
      personality: talent.personality,
      faction: talent.faction,
      background: talent.background,
    },
    playerMessage,
    history: history.slice(-20).map((h) => ({
      role: h.role === "player" ? "user" : "assistant",
      content: h.content,
    })),
    state: {
      currentYear: state.currentYear,
      currentMonth: state.currentMonth,
      nation: state.nation || {},
      prestige: state.prestige,
      appointments: state.appointments || {},
      characterStatus: state.characterStatus || {},
      extraCharacters: getKnownCharactersFromState(state).map((item) => ({ ...item })),
    },
    worldviewData: config.worldviewData || null,
  };

  const raw = await postJsonAndReadText(
    `${apiBase}/api/chongzhen/talentInteract`,
    body,
    "requestTalentInteract",
    { headers: buildLlmProxyHeaders(config) }
  );
  if (raw == null) return null;

  return parseTalentInteractPayload(raw);
}

function parseTalentInteractPayload(raw) {
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (_) {
    // Try to extract reply from plain text fallback
    if (typeof raw === "string" && raw.trim()) {
      return { reply: raw.trim(), loyaltyDelta: 0, attitude: "恭敬", suggestion: null };
    }
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const reply = typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  if (!reply) return null;

  const loyaltyDelta = clamp(Number(parsed.loyaltyDelta) || 0, -5, 5);
  const attitude = typeof parsed.attitude === "string" ? parsed.attitude : "恭敬";
  const suggestion = parsed.suggestion && typeof parsed.suggestion === "object"
    ? { content: String(parsed.suggestion.content || ""), effect: String(parsed.suggestion.effect || "") }
    : null;

  return { reply, loyaltyDelta, attitude, suggestion };
}
