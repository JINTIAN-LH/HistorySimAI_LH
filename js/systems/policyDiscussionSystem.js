/**
 * 问政玩法系统
 *
 * 管理廷议会话（activeSession）、历史记录（sessionHistory），
 * 提供创建会话、追加建言、记录结果的纯逻辑函数。
 */

import { getState, setState } from "../state.js";

// ─── 状态读取 ─────────────────────────────────────────────────────────────────

export function getPolicyDiscussionState(state = getState()) {
  const raw = state?.policyDiscussion;
  return {
    activeSession: raw?.activeSession ?? null,
    sessionHistory: Array.isArray(raw?.sessionHistory) ? raw.sessionHistory : [],
    asking: Boolean(raw?.asking),
    pendingIssuedEdict: raw?.pendingIssuedEdict ?? null,
  };
}

export function getActiveSession(state = getState()) {
  return getPolicyDiscussionState(state).activeSession;
}

export function getSessionHistory(state = getState()) {
  return getPolicyDiscussionState(state).sessionHistory;
}

// ─── 状态写入 ─────────────────────────────────────────────────────────────────

function mergePolicyState(partial) {
  const state = getState();
  const current = getPolicyDiscussionState(state);
  setState({ policyDiscussion: { ...current, ...partial } });
}

/**
 * 创建或刷新一个新的廷议会话。
 * @param {string} topic - 议题标题
 * @param {string} question - 玩家的问政内容
 * @returns {Object} 新会话对象
 */
export function createPolicySession(topic, question) {
  const session = {
    id: `ps_${Date.now()}`,
    topic: typeof topic === "string" ? topic.trim() : "",
    question: typeof question === "string" ? question.trim() : "",
    advices: [],
    conversationHistory: [],
    edictContent: null,
    result: null,
    createdAt: Date.now(),
  };
  mergePolicyState({ activeSession: session, asking: false });
  return session;
}

/**
 * 将大臣建言数组写入当前活跃会话。
 * @param {Array} advices - 建言列表
 * @param {string} [summary] - AI 摘要
 */
export function setSessionAdvices(advices, summary = "") {
  const { activeSession } = getPolicyDiscussionState();
  if (!activeSession) return;
  const updated = {
    ...activeSession,
    advices: Array.isArray(advices) ? advices : [],
    summary: typeof summary === "string" ? summary : "",
  };
  mergePolicyState({ activeSession: updated, asking: false });
}

/**
 * 追加一条对话记录到活跃会话（支持追问流程）。
 * @param {{ role: "player"|"minister", name: string, content: string }} entry
 */
export function appendPolicyConversation(entry) {
  const { activeSession } = getPolicyDiscussionState();
  if (!activeSession) return;
  const record = {
    role: entry.role || "player",
    name: typeof entry.name === "string" ? entry.name : "",
    content: typeof entry.content === "string" ? entry.content : "",
    timestamp: Date.now(),
  };
  const updated = {
    ...activeSession,
    conversationHistory: [...(activeSession.conversationHistory || []), record].slice(-60),
  };
  mergePolicyState({ activeSession: updated });
}

/**
 * 记录玩家下达的诏令内容。
 */
export function setSessionEdict(edictContent) {
  const { activeSession } = getPolicyDiscussionState();
  if (!activeSession) return;
  mergePolicyState({
    activeSession: { ...activeSession, edictContent: typeof edictContent === "string" ? edictContent : "" },
  });
}

export function setPendingIssuedEdict(edictContent) {
  const content = typeof edictContent === "string" ? edictContent.trim() : "";
  mergePolicyState({
    pendingIssuedEdict: content
      ? {
        content,
        issuedAt: Date.now(),
      }
      : null,
  });
}

export function clearPendingIssuedEdict() {
  mergePolicyState({ pendingIssuedEdict: null });
}

/**
 * 将当前活跃会话归档到历史记录，并清空 activeSession。
 */
export function archiveActiveSession() {
  const { activeSession, sessionHistory } = getPolicyDiscussionState();
  if (!activeSession) return;
  const archived = { ...activeSession, archivedAt: Date.now() };
  mergePolicyState({
    activeSession: null,
    sessionHistory: [...sessionHistory, archived].slice(-20), // 最多保留 20 条
  });
}

/**
 * 清空活跃会话（不归档）。
 */
export function clearActiveSession() {
  mergePolicyState({ activeSession: null });
}

export function setAsking(value) {
  mergePolicyState({ asking: Boolean(value) });
}

// ─── 议题生成（根据游戏状态自动推导热点议题） ─────────────────────────────────

/**
 * 根据当前游戏状态生成候选廷议议题列表（不调用 LLM，纯本地推导）。
 * 调用方可将其展示给玩家，玩家选择后再触发 LLM 建言。
 *
 * @param {Object} state - 游戏 state
 * @param {Object} policyCfg - 问政世界观配置
 * @returns {Array<{ id: string, title: string, hint: string, urgency: number }>}
 */
export function deriveLocalPolicyIssues(state, policyCfg = {}) {
  const nation = state?.nation || {};
  const issues = [];
  const issueLabel = policyCfg.issueLabel || "议题";

  if ((nation.borderThreat ?? 0) >= 70) {
    issues.push({
      id: "border_threat",
      title: "边患告急",
      hint: `边防压力严峻（${nation.borderThreat}），需筹谋应对之策。`,
      urgency: nation.borderThreat,
    });
  }
  if ((nation.disasterLevel ?? 0) >= 65) {
    issues.push({
      id: "disaster_relief",
      title: "天灾赈济",
      hint: `灾情严重（${nation.disasterLevel}），民生困苦，亟需赈灾方略。`,
      urgency: nation.disasterLevel,
    });
  }
  if ((nation.civilMorale ?? 100) <= 40) {
    issues.push({
      id: "morale_crisis",
      title: "民心不稳",
      hint: `民心低落（${nation.civilMorale}），社稷动荡，须安抚之策。`,
      urgency: 100 - nation.civilMorale,
    });
  }
  if ((nation.treasury ?? Infinity) < 200000) {
    issues.push({
      id: "treasury_deficit",
      title: "国库空虚",
      hint: `国库存银不足（${nation.treasury?.toLocaleString()}两），财政吃紧，需筹款之道。`,
      urgency: Math.round(100 * (1 - (nation.treasury || 0) / 200000)),
    });
  }
  if ((nation.corruptionLevel ?? 0) >= 75) {
    issues.push({
      id: "corruption",
      title: "吏治腐败",
      hint: `贪腐严峻（${nation.corruptionLevel}），吏治败坏，需整饬之法。`,
      urgency: nation.corruptionLevel,
    });
  }
  if ((nation.militaryStrength ?? 100) <= 40) {
    issues.push({
      id: "military_weak",
      title: "兵力不振",
      hint: `军事战力不足（${nation.militaryStrength}），边防虚弱，需振兴之策。`,
      urgency: 100 - nation.militaryStrength,
    });
  }

  // 如无紧急议题，提供通用选项
  if (!issues.length) {
    issues.push({
      id: "general_affairs",
      title: "日常国是",
      hint: "当前局势平稳，可就国策调整、人才任用等日常事务广询臣工意见。",
      urgency: 30,
    });
  }

  return issues.sort((a, b) => b.urgency - a.urgency).slice(0, 4);
}
