/**
 * 问政玩法视图
 *
 * 渲染廷议（Policy Discussion）面板：
 *  - 议题卡片（本地推导的时局议题）
 *  - 自定义问题输入框
 *  - 发起廷议 → 大臣建言卡片
 *  - 诏令起草区（参考建言自拟诏书）
 *  - 历史廷议归档列表
 *
 * 所有界面文本通过 getPolicyConfigFromState 获取，不硬编码世界观词汇。
 */

import { getState, setState } from "../state.js";
import { showError, showSuccess } from "../utils/toast.js";
import {
  createPolicySession,
  setSessionAdvices,
  appendPolicyConversation,
  archiveActiveSession,
  deriveLocalPolicyIssues,
  getPolicyDiscussionState as getPolicyState,
  setPendingIssuedEdict,
} from "../systems/policyDiscussionSystem.js";
import {
  getPolicyConfigFromState,
} from "../worldview/talentPolicyWorldviewAdapter.js";
import { resolveWorldviewUiSurfaceCopy } from "../worldview/worldviewRuntimeAccessor.js";
import { requestMinisterAdvise } from "../api/policyDiscussionApi.js";
import { createElement, createOverlayPanel } from "./viewPrimitives.js";

// ─── 模块级 UI 状态 ────────────────────────────────────────────────────────────

let _selectedIssueKey = null;
let _customQuestion = "";

const FALLBACK_FACTION_LABELS = {
  neutral: "中立派",
};

function resolveFactionLabel(faction, state = getState()) {
  const raw = typeof faction === "string" ? faction.trim() : "";
  if (!raw) return "";

  const factions = Array.isArray(state?.factions) ? state.factions : [];
  const matched = factions.find((item) => item?.id === raw || item?.name === raw);
  if (matched?.name) return matched.name;
  return FALLBACK_FACTION_LABELS[raw] || raw;
}

// ─── 主入口 ───────────────────────────────────────────────────────────────────

export function renderPolicyView(container, options = {}) {
  container.innerHTML = "";
  const state = getState();
  const cfg = getPolicyConfigFromState(state);
  const policyState = getPolicyState(state);

  const view = createElement("div", { className: "policy-view" });

  // 顶部标题（当作为独立视图展示时；嵌入面板时由外层面板提供标题）
  const inPanel = options.inPanel || container.classList.contains("keju-panel-body");
  if (!inPanel) {
    const header = createElement("div", { className: "policy-view-header" });
    header.appendChild(createElement("div", {
      className: "policy-view-title",
      text: cfg.sessionLabel || "廷议",
    }));
    view.appendChild(header);
  }

  // 活跃会话：显示廷议结果
  if (policyState.activeSession && Array.isArray(policyState.activeSession.advices)) {
    view.appendChild(_buildActiveSession(policyState.activeSession, cfg, container));
  } else if (policyState.asking) {
    // Loading
    const loadingBar = createElement("div", { className: "policy-loading-bar" });
    loadingBar.appendChild(createElement("span", { text: "正在召集群臣议政" }));
    const dots = createElement("span", { className: "policy-loading-dots" });
    loadingBar.appendChild(dots);
    view.appendChild(loadingBar);
  } else {
    // 议题选择 + 输入
    view.appendChild(_buildIssueSelector(state, cfg, container));
    view.appendChild(_buildQuestionArea(cfg, state, container));
  }

  // 历史归档
  if (policyState.sessionHistory.length > 0) {
    view.appendChild(_buildHistorySection(policyState.sessionHistory, cfg, container));
  }

  container.appendChild(view);
}

// ─── 部件：议题选择器 ─────────────────────────────────────────────────────────

function _buildIssueSelector(state, cfg, container) {
  const issues = deriveLocalPolicyIssues(state, cfg);
  const wrap = createElement("div", { className: "policy-issue-list" });

  issues.forEach((issue) => {
    const urgency = issue.urgency || "low";
    const isSelected = _selectedIssueKey === issue.key;
    const card = createElement("div", {
      className: `policy-issue-card${isSelected ? " policy-issue-card--selected" : ""}`,
      dataset: { issueKey: issue.key },
    });
    const dot = createElement("div", {
      className: `policy-issue-urgency-dot policy-issue-urgency-dot--${urgency}`,
    });
    const textWrap = createElement("div", { className: "policy-issue-text" });
    textWrap.appendChild(createElement("div", {
      className: "policy-issue-title",
      text: issue.title,
    }));
    if (issue.hint) {
      textWrap.appendChild(createElement("div", {
        className: "policy-issue-hint",
        text: issue.hint,
      }));
    }
    card.appendChild(dot);
    card.appendChild(textWrap);
    card.addEventListener("click", () => {
      _selectedIssueKey = issue.key;
      _customQuestion = issue.title;
      // 更新选中状态
      wrap.querySelectorAll(".policy-issue-card").forEach((el) => {
        el.classList.toggle("policy-issue-card--selected", el.dataset.issueKey === issue.key);
      });
      // 同步到问题输入框
      const textarea = container.querySelector(".policy-question-textarea");
      if (textarea) textarea.value = issue.title;
    });
    wrap.appendChild(card);
  });

  return wrap;
}

// ─── 部件：问题输入区 ─────────────────────────────────────────────────────────

function _buildQuestionArea(cfg, state, container) {
  const uiCopy = resolveWorldviewUiSurfaceCopy(state).policy;
  const area = createElement("div", { className: "policy-question-area" });
  area.appendChild(createElement("div", {
    className: "policy-question-area__label",
    text: `${cfg.askVerb || "垂询"}群臣，或自拟具体议题：`,
  }));

  const textarea = createElement("textarea", {
    className: "policy-question-textarea",
    attrs: { placeholder: uiCopy.inputPlaceholder, rows: "3" },
  });
  if (_customQuestion) textarea.value = _customQuestion;
  textarea.addEventListener("input", () => {
    _customQuestion = textarea.value;
  });
  area.appendChild(textarea);

  const actions = createElement("div", { className: "policy-question-actions" });
  const askBtn = createElement("button", {
    className: "policy-ask-btn",
    text: `发起${cfg.sessionLabel || "廷议"}`,
    attrs: { type: "button" },
  });
  askBtn.addEventListener("click", () => {
    const question = (textarea.value || "").trim();
    if (!question) {
      showError(uiCopy.emptyQuestionError);
      return;
    }
    _handleAskMinisterAdvise(question, cfg, container);
  });
  actions.appendChild(askBtn);
  area.appendChild(actions);

  return area;
}

// ─── 廷议逻辑 ─────────────────────────────────────────────────────────────────

async function _handleAskMinisterAdvise(question, cfg, container) {
  const state = getState();
  const uiCopy = resolveWorldviewUiSurfaceCopy(state).policy;
  if (state.policyDiscussion?.asking) return;

  // 创建新会话
  createPolicySession(_selectedIssueKey || "custom", question);
  setState({ policyDiscussion: { ...getState().policyDiscussion, asking: true } });

  renderPolicyView(container);

  try {
    const result = await requestMinisterAdvise(question, {
      conversationHistory: [],
    });
    setSessionAdvices(result.advices || [], result.summary || "");
    setState({ policyDiscussion: { ...getState().policyDiscussion, asking: false } });
    _selectedIssueKey = null;
    _customQuestion = "";
  } catch (err) {
    showError(err?.message || uiCopy.askFailedError);
    setState({ policyDiscussion: { ...getState().policyDiscussion, asking: false } });
  }

  renderPolicyView(container);
}

// ─── 部件：活跃廷议会话 ───────────────────────────────────────────────────────

function _buildActiveSession(session, cfg, container) {
  const uiCopy = resolveWorldviewUiSurfaceCopy(getState()).policy;
  const wrap = createElement("div", { className: "policy-session-panel" });

  // 议题标题
  const topicBar = createElement("div", { className: "policy-session-topic" });
  topicBar.appendChild(createElement("span", {
    className: "policy-view-title",
    text: session.question || session.topic,
  }));
  const closeBtn = createElement("button", {
    className: "policy-advice-action-btn",
    text: uiCopy.closeSessionLabel,
    attrs: { type: "button" },
  });
  closeBtn.addEventListener("click", () => {
    archiveActiveSession();
    _selectedIssueKey = null;
    _customQuestion = "";
    renderPolicyView(container);
  });
  topicBar.appendChild(closeBtn);
  wrap.appendChild(topicBar);

  // 综合摘要
  if (session.summary) {
    const summaryBar = createElement("div", { className: "policy-summary-bar" });
    summaryBar.appendChild(createElement("span", {
      className: "policy-summary-bar__label",
      text: uiCopy.summaryPrefix,
    }));
    summaryBar.appendChild(createElement("span", { text: session.summary }));
    wrap.appendChild(summaryBar);
  }

  // 建言卡片列表
  if (Array.isArray(session.advices) && session.advices.length > 0) {
    const list = createElement("div", { className: "policy-advice-list" });
    session.advices.forEach((advice) => {
      list.appendChild(_buildAdviceCard(advice, cfg, session, container));
    });
    wrap.appendChild(list);
  }

  // 追问输入（多轮对话）
  wrap.appendChild(_buildFollowUpArea(cfg, session, container));

  // 诏令起草区
  wrap.appendChild(_buildEdictArea(cfg, session, container));

  return wrap;
}

// ─── 部件：大臣建言卡 ─────────────────────────────────────────────────────────

function _buildAdviceCard(advice, cfg, session, container) {
  const uiCopy = resolveWorldviewUiSurfaceCopy(getState()).policy;
  const attitude = advice.attitude || "neutral";
  const card = createElement("div", { className: "policy-advice-card" });
  const factionLabel = resolveFactionLabel(advice.faction);

  // 头部：大臣姓名 + 派系 + 态度
  const header = createElement("div", { className: "policy-advice-card__header" });
  header.appendChild(createElement("div", {
    className: "policy-advice-minister-name",
    text: advice.ministerName || advice.ministerId || "臣",
  }));
  if (factionLabel) {
    header.appendChild(createElement("div", {
      className: "policy-advice-faction-tag",
      text: factionLabel,
    }));
  }
  const attitudeLabels = { support: "赞同", oppose: "反对", neutral: "中立" };
  header.appendChild(createElement("div", {
    className: `policy-advice-attitude-badge policy-advice-attitude-badge--${attitude}`,
    text: attitudeLabels[attitude] || attitude,
  }));
  card.appendChild(header);

  // 正文
  const body = createElement("div", { className: "policy-advice-card__body" });
  body.appendChild(createElement("div", {
    className: "policy-advice-content",
    text: advice.content || advice.advice || "",
  }));

  // 理由
  if (advice.reason || advice.reasoning) {
    body.appendChild(createElement("div", {
      className: "policy-advice-reason",
      text: advice.reason || advice.reasoning,
    }));
  }

  // 预计影响 Chips
  if (Array.isArray(advice.estimatedEffects) && advice.estimatedEffects.length > 0) {
    const effectsRow = createElement("div", { className: "policy-advice-effects" });
    advice.estimatedEffects.forEach((effect) => {
      const positive = typeof effect === "string"
        ? effect.includes("+") : effect.delta > 0;
      const neutral = typeof effect === "string"
        ? !effect.includes("+") && !effect.includes("-") : effect.delta === 0;
      const chipClass = positive ? "positive" : neutral ? "neutral" : "negative";
      effectsRow.appendChild(createElement("span", {
        className: `policy-effect-chip policy-effect-chip--${chipClass}`,
        text: typeof effect === "string" ? effect : `${effect.label}: ${effect.delta > 0 ? "+" : ""}${effect.delta}`,
      }));
    });
    body.appendChild(effectsRow);
  }

  card.appendChild(body);

  // 操作按钮：采纳（写到诏令草稿框）
  const actions = createElement("div", { className: "policy-advice-card__actions" });
  const adoptBtn = createElement("button", {
    className: "policy-advice-action-btn policy-advice-action-btn--adopt",
    text: uiCopy.adoptAdviceLabel,
    attrs: { type: "button" },
  });
  adoptBtn.addEventListener("click", () => {
    const edictTextarea = container.querySelector(".policy-edict-textarea");
    if (edictTextarea) {
      const base = edictTextarea.value.trim();
      const newContent = base
        ? `${base}\n${advice.content || advice.advice || ""}`
        : advice.content || advice.advice || "";
      edictTextarea.value = newContent;
      edictTextarea.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
  actions.appendChild(adoptBtn);
  card.appendChild(actions);

  return card;
}

// ─── 部件：追问 ───────────────────────────────────────────────────────────────

function _buildFollowUpArea(cfg, session, container) {
  const uiCopy = resolveWorldviewUiSurfaceCopy(getState()).policy;
  const area = createElement("div", {
    className: "policy-question-area",
    attrs: { style: "margin-top: 12px;" },
  });
  area.appendChild(createElement("div", {
    className: "policy-question-area__label",
    text: uiCopy.followupLabel,
  }));
  const textarea = createElement("textarea", {
    className: "policy-question-textarea",
    attrs: { placeholder: uiCopy.followupPlaceholder, rows: "2" },
  });
  area.appendChild(textarea);

  const actions = createElement("div", { className: "policy-question-actions" });
  const sendBtn = createElement("button", {
    className: "policy-ask-btn",
    text: uiCopy.followupButtonLabel,
    attrs: { type: "button" },
  });
  sendBtn.addEventListener("click", async () => {
    const question = (textarea.value || "").trim();
    if (!question) return;
    sendBtn.disabled = true;
    sendBtn.textContent = uiCopy.followupBusyLabel;
    textarea.value = "";

    appendPolicyConversation({ role: "user", content: question });
    try {
      const state = getState();
      const followSession = getPolicyState(state).activeSession;
      const history = Array.isArray(followSession?.conversationHistory)
        ? followSession.conversationHistory : [];
      const result = await requestMinisterAdvise(question, {
        conversationHistory: history.slice(-10),
      });
      setSessionAdvices(result.advices || [], result.summary || "");
      appendPolicyConversation({ role: "assistant", content: result.summary || "" });
    } catch (err) {
      showError(err?.message || uiCopy.followupFailedError);
    }
    sendBtn.disabled = false;
    sendBtn.textContent = uiCopy.followupButtonLabel;
    renderPolicyView(container);
  });
  actions.appendChild(sendBtn);
  area.appendChild(actions);
  return area;
}

// ─── 部件：诏令起草区 ─────────────────────────────────────────────────────────

function _buildEdictArea(cfg, session, container) {
  const uiCopy = resolveWorldviewUiSurfaceCopy(getState()).policy;
  const area = createElement("div", { className: "policy-edict-area" });
  area.appendChild(createElement("div", {
    className: "policy-edict-area__title",
    text: `拟${cfg.edictLabel || "诏旨"}`,
  }));
  const textarea = createElement("textarea", {
    className: "policy-edict-textarea",
    attrs: {
      placeholder: `参考群臣建议，起草${cfg.edictLabel || "诏旨"}…`,
      rows: "4",
    },
  });
  if (session.edictContent) textarea.value = session.edictContent;
  area.appendChild(textarea);

  const actions = createElement("div", { className: "policy-edict-actions" });
  const issueBtn = createElement("button", {
    className: "policy-issue-edict-btn",
    text: `${cfg.issueVerb || "颁旨"}`,
    attrs: { type: "button" },
  });
  issueBtn.addEventListener("click", async () => {
    const content = (textarea.value || "").trim();
    if (!content) {
      showError(uiCopy.emptyEdictError);
      return;
    }
    try {
      const policyState = getPolicyState(getState());
      if (policyState.activeSession) {
        setState({
          policyDiscussion: {
            ...policyState,
            activeSession: {
              ...policyState.activeSession,
              edictContent: content,
              result: "issued",
              issuedAt: Date.now(),
            },
          },
        });
        setPendingIssuedEdict(content);
        archiveActiveSession();
      }
      showSuccess(uiCopy.issueSuccess.replace("诏旨", cfg.edictLabel || "诏旨"));
      _selectedIssueKey = null;
      _customQuestion = "";
      renderPolicyView(container);
    } catch (err) {
      showError(err?.message || uiCopy.issueFailedError);
      renderPolicyView(container);
    }
  });
  actions.appendChild(issueBtn);
  area.appendChild(actions);
  return area;
}

// ─── 部件：历史廷议 ───────────────────────────────────────────────────────────

function _buildHistorySection(sessionHistory, cfg, container) {
  const uiCopy = resolveWorldviewUiSurfaceCopy(getState()).policy;
  const section = createElement("div", { className: "policy-history-section" });
  section.appendChild(createElement("div", {
    className: "policy-history-section__title",
    text: uiCopy.historyTitle,
  }));

  // 最多显示最近 10 条
  const recent = [...sessionHistory].reverse().slice(0, 10);
  recent.forEach((session) => {
    const item = createElement("div", { className: "policy-history-item" });
    const createdAt = session.createdAt ? new Date(session.createdAt) : null;
    const timeStr = createdAt ? `${createdAt.getMonth() + 1}月${createdAt.getDate()}日` : "";

    item.appendChild(createElement("div", {
      className: "policy-history-topic",
      text: session.question || session.topic || "未知议题",
    }));
    if (timeStr) {
      item.appendChild(createElement("div", {
        className: "policy-history-time",
        text: timeStr,
      }));
    }
    if (session.result === "issued") {
      item.appendChild(createElement("span", {
        className: "policy-advice-attitude-badge policy-advice-attitude-badge--support",
        text: "已颁旨",
      }));
    }
    item.addEventListener("click", () => _openHistoryDetail(session, cfg));
    section.appendChild(item);
  });

  return section;
}

function _openHistoryDetail(session, cfg) {
  const existing = document.getElementById("policy-history-detail-overlay");
  if (existing) existing.remove();

  const { overlay, body, closeButton } = createOverlayPanel({
    overlayId: "policy-history-detail-overlay",
    title: session.question || session.topic || "历史廷议",
    subtitle: session.result === "issued" ? "已颁旨" : "归档",
    onClose: () => overlay.remove(),
  });

  if (session.summary) {
    const summaryBar = createElement("div", { className: "policy-summary-bar" });
    summaryBar.appendChild(createElement("span", { className: "policy-summary-bar__label", text: "综议：" }));
    summaryBar.appendChild(createElement("span", { text: session.summary }));
    body.appendChild(summaryBar);
  }

  if (session.edictContent) {
    const edictDisplay = createElement("div", {
      className: "policy-edict-area",
      attrs: { style: "margin-top: 10px;" },
    });
    edictDisplay.appendChild(createElement("div", {
      className: "policy-edict-area__title",
      text: `${cfg.edictLabel || "诏旨"}内容：`,
    }));
    edictDisplay.appendChild(createElement("div", {
      attrs: { style: "font-size:13px; line-height:1.6; color:var(--color-text-main); padding:8px 0; font-family:'FangSong','STFangsong',serif;" },
      text: session.edictContent,
    }));
    body.appendChild(edictDisplay);
  }

  if (Array.isArray(session.advices) && session.advices.length > 0) {
    const list = createElement("div", { className: "policy-advice-list" });
    session.advices.forEach((advice) => {
      const attitude = advice.attitude || "neutral";
      const factionLabel = resolveFactionLabel(advice.faction);
      const card = createElement("div", { className: "policy-advice-card" });
      const header = createElement("div", { className: "policy-advice-card__header" });
      header.appendChild(createElement("div", {
        className: "policy-advice-minister-name",
        text: advice.ministerName || advice.ministerId || "臣",
      }));
      if (factionLabel) {
        header.appendChild(createElement("div", {
          className: "policy-advice-faction-tag",
          text: factionLabel,
        }));
      }
      const attitudeLabels = { support: "赞同", oppose: "反对", neutral: "中立" };
      header.appendChild(createElement("div", {
        className: `policy-advice-attitude-badge policy-advice-attitude-badge--${attitude}`,
        text: attitudeLabels[attitude] || attitude,
      }));
      card.appendChild(header);
      const cardBody = createElement("div", { className: "policy-advice-card__body" });
      cardBody.appendChild(createElement("div", {
        className: "policy-advice-content",
        text: advice.content || advice.advice || "",
      }));
      card.appendChild(cardBody);
      list.appendChild(card);
    });
    body.appendChild(list);
  }

  document.body.appendChild(overlay);
}
