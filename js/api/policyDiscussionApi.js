/**
 * 问政玩法 API 层
 * 负责与服务器端点通信：
 *   - /api/chongzhen/ministerAdvise (POST) 大臣廷议建言
 */

import { getState } from "../state.js";
import { buildLlmProxyHeaders, getApiBase, postJsonAndReadText } from "./httpClient.js";

// ─── 大臣建言 ─────────────────────────────────────────────────────────────────

/**
 * 请求 LLM 生成多位大臣的廷议建言。
 *
 * @param {string} question - 玩家的问政内容
 * @param {Object} [options]
 * @param {string[]} [options.ministerIds] - 指定参与大臣（空则自动选取）
 * @param {Array}  [options.conversationHistory] - 多轮追问历史
 * @returns {Promise<{ advices: Array, summary: string }|null>}
 */
export async function requestMinisterAdvise(question, { ministerIds = [], conversationHistory = [] } = {}) {
  const state = getState();
  const config = state.config || {};
  const apiBase = getApiBase(config, "requestMinisterAdvise");
  if (!apiBase) return null;

  const allCharacters = Array.isArray(state.allCharacters) && state.allCharacters.length
    ? state.allCharacters
    : (state.ministers || []);
  const appointments = state.appointments || {};
  const characterStatus = state.characterStatus || {};

  // Build minister snapshot for context
  const aliveIds = new Set(
    allCharacters
      .filter((m) => m && characterStatus[m.id]?.isAlive !== false)
      .map((m) => m.id)
  );

  let selectedMinisters;
  if (ministerIds.length) {
    selectedMinisters = ministerIds
      .map((id) => allCharacters.find((m) => m.id === id))
      .filter((m) => m && aliveIds.has(m.id));
  } else {
    // Auto-select up to 3 diverse ministers from currently appointed
    const appointedIds = new Set(Object.values(appointments).filter((id) => aliveIds.has(id)));
    const pool = allCharacters.filter((m) => aliveIds.has(m.id) && appointedIds.has(m.id));
    // Try to pick diverse factions
    const seen = new Set();
    selectedMinisters = pool
      .sort((a, b) => (b.ability?.politics ?? 50) - (a.ability?.politics ?? 50))
      .filter((m) => {
        const key = m.faction || "neutral";
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3);
    // If fewer than 2, fill up
    if (selectedMinisters.length < 2) {
      const extra = pool.filter((m) => !selectedMinisters.find((s) => s.id === m.id)).slice(0, 2);
      selectedMinisters = [...selectedMinisters, ...extra].slice(0, 3);
    }
  }

  const ministerSnapshot = selectedMinisters.map((m) => ({
    id: m.id,
    name: m.name,
    faction: m.faction || "neutral",
    factionLabel: m.factionLabel || m.faction || "",
    personality: m.personality || m.attitude || "",
    field: m.field || (m.tags?.[0] || ""),
    loyalty: state.loyalty?.[m.id] ?? (m.ability?.loyalty ?? m.loyalty ?? 50),
    currentPosition: Object.entries(appointments).find(([, v]) => v === m.id)?.[0] || null,
  }));

  if (!ministerSnapshot.length) {
    console.warn("[policyDiscussionApi] no ministers available for advice");
    return null;
  }

  const body = {
    question,
    ministers: ministerSnapshot,
    state: {
      currentYear: state.currentYear,
      currentMonth: state.currentMonth,
      nation: state.nation || {},
      prestige: state.prestige,
      executionRate: state.executionRate,
      partyStrife: state.partyStrife,
    },
    conversationHistory: conversationHistory.slice(-20),
    worldviewData: config.worldviewData || null,
  };

  const raw = await postJsonAndReadText(
    `${apiBase}/api/chongzhen/ministerAdvise`,
    body,
    "requestMinisterAdvise",
    { headers: buildLlmProxyHeaders(config) }
  );
  if (raw == null) return null;

  return parseMinisterAdvisePayload(raw);
}

function parseMinisterAdvisePayload(raw) {
  let parsed;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (_) {
    console.error("[policyDiscussionApi] invalid json", raw?.slice?.(0, 200));
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const advices = Array.isArray(parsed.advices) ? parsed.advices.map(normalizeAdvice).filter(Boolean) : [];
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  if (!advices.length) {
    console.error("[policyDiscussionApi] no valid advices in response", parsed);
    return null;
  }
  return { advices, summary };
}

function clamp(v, min, max) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : 0;
}

function normalizeAdvice(raw) {
  if (!raw || typeof raw !== "object") return null;
  const content = typeof raw.content === "string" ? raw.content.trim() : "";
  if (!content) return null;
  const ministerId = typeof raw.ministerId === "string" ? raw.ministerId : "";
  const ministerName = typeof raw.ministerName === "string" ? raw.ministerName : ministerId;
  const attitude = ["support", "oppose", "neutral"].includes(raw.attitude) ? raw.attitude : "neutral";
  const reason = typeof raw.reason === "string" ? raw.reason.trim() : "";
  const rawCost = raw.estimatedCost && typeof raw.estimatedCost === "object" ? raw.estimatedCost : {};
  const rawEff = raw.estimatedEffects && typeof raw.estimatedEffects === "object" ? raw.estimatedEffects : {};

  return {
    ministerId,
    ministerName,
    faction: typeof raw.faction === "string" ? raw.faction : "neutral",
    attitude,
    content,
    reason,
    estimatedCost: {
      silver: clamp(rawCost.silver, -9999999, 9999999),
      grain: clamp(rawCost.grain, -9999999, 9999999),
    },
    estimatedEffects: {
      militaryStrength: clamp(rawEff.militaryStrength, -20, 20),
      civilMorale: clamp(rawEff.civilMorale, -20, 20),
      treasury: clamp(rawEff.treasury, -9999999, 9999999),
      borderThreat: clamp(rawEff.borderThreat, -20, 20),
      other: typeof rawEff.other === "string" ? rawEff.other : "",
    },
  };
}
