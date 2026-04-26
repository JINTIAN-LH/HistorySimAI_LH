/**
 * 人才玩法视图
 *
 * 负责渲染人才储备面板，包括：
 *  - 招募入口（多种途径）
 *  - 人才卡片列表（含品质、能力、背景）
 *  - 人才交互面板（对话式召见）
 *  - 任用面板（选择职位进行任命）
 *
 * 注意：所有界面文本均通过 getTalentConfigFromState 获取，不硬编码世界观词汇。
 */

import { router } from "../router.js";
import { getState, setState } from "../state.js";
import { showError, showSuccess } from "../utils/toast.js";
import {
  getTalentPool,
  getTalentInteractionHistory,
  appendTalentPool,
  appendTalentInteractionEntry,
  applyTalentInteractionResult,
  setRecruiting,
  sortTalentPool,
  TALENT_FIELD_COLORS,
  TALENT_SOURCE_LABEL,
} from "../systems/talentSystem.js";
import {
  getTalentConfigFromState,
} from "../worldview/talentPolicyWorldviewAdapter.js";
import { requestTalentRecruit, requestTalentInteract } from "../api/talentApi.js";
import { createElement, createOverlayPanel } from "./viewPrimitives.js";
import { loadJSON } from "../dataLoader.js";
import { getKnownCharactersFromState } from "../utils/characterRegistry.js";

// ─── 模块级状态 ──────────────────────────────────────────────────────────────

let _positionsCache = null;
let _interactingTalentId = null;
let _recruitFilter = "all";
let _selectedRecruitType = "recommend";

function getRecruitTypeEntries(cfg) {
  return Object.entries(cfg?.recruitTypes || {});
}

function getActiveRecruitType(cfg) {
  const entries = getRecruitTypeEntries(cfg);
  if (!entries.length) return "search";
  if (entries.some(([typeKey]) => typeKey === _selectedRecruitType)) return _selectedRecruitType;
  return entries.some(([typeKey]) => typeKey === "recommend")
    ? "recommend"
    : entries[0][0];
}

function getTalentSourceKey(talent) {
  if (typeof talent?.source === "string" && talent.source.trim()) return talent.source.trim();
  if (typeof talent?.recruitType === "string" && talent.recruitType.trim()) return talent.recruitType.trim();
  return "generated";
}

function getTalentSourceLabel(sourceKey, cfg) {
  return cfg?.recruitTypes?.[sourceKey] || TALENT_SOURCE_LABEL[sourceKey] || sourceKey || "";
}

function buildCharacterNameMap(state) {
  const map = new Map();
  getKnownCharactersFromState(state).forEach((item) => {
    if (!item?.id || !item?.name) return;
    if (!map.has(item.id)) map.set(item.id, item.name);
  });
  return map;
}

function resolveCharacterDisplayName(characterId, state = getState()) {
  if (typeof characterId !== "string" || !characterId.trim()) return "";
  const byId = buildCharacterNameMap(state);
  return byId.get(characterId) || characterId;
}

// ─── 数据加载 ─────────────────────────────────────────────────────────────────

export async function ensureTalentViewDataLoaded() {
  if (!_positionsCache) {
    try {
      const data = await loadJSON("data/positions.json");
      _positionsCache = Array.isArray(data?.positions) ? data.positions : [];
    } catch (_) {
      _positionsCache = [];
    }
  }
}

// ─── 主入口 ───────────────────────────────────────────────────────────────────

export function renderTalentView(container, options = {}) {
  container.innerHTML = "";
  const state = getState();
  const cfg = getTalentConfigFromState(state);
  const pool = sortTalentPool(getTalentPool(state));

  // 外层容器
  const view = createElement("div", { className: "talent-view" });

  // 顶部标题栏（当作为独立视图展示时；嵌入面板时由外层面板提供标题）
  const inPanel = options.inPanel || container.classList.contains("keju-panel-body");
  if (!inPanel) {
    view.appendChild(_buildHeader(cfg, state));
  }

  // 招募类型筛选
  view.appendChild(_buildRecruitBar(cfg, container));

  // 人才卡片列表
  const listEl = _buildTalentList(pool, cfg, container);
  view.appendChild(listEl);

  container.appendChild(view);
}

// ─── 部件：顶部标题栏 ─────────────────────────────────────────────────────────

function _buildHeader(cfg, state) {
  const header = createElement("div", { className: "talent-view-header" });
  const title = createElement("div", {
    className: "talent-view-title",
    text: cfg.viewTitle || "人才储备",
  });
  const hint = createElement("div", {
    className: "talent-pool-count",
    text: `储备 ${getTalentPool(state).length} 人`,
  });
  header.appendChild(title);
  header.appendChild(hint);
  return header;
}

// ─── 部件：招募途径选择栏 ─────────────────────────────────────────────────────

function _buildRecruitBar(cfg, container) {
  const bar = createElement("div", { className: "talent-recruit-bar" });
  const recruitTypes = cfg.recruitTypes || {};
  const isRecruiting = Boolean(getState().talent?.recruiting);
  const activeRecruitType = getActiveRecruitType(cfg);
  const activeRecruitLabel = recruitTypes[activeRecruitType] || activeRecruitType;

  const modeGroup = createElement("div", { className: "talent-recruit-mode-group" });
  modeGroup.appendChild(createElement("div", {
    className: "talent-recruit-group-title",
    text: "延揽方式",
  }));

  getRecruitTypeEntries(cfg).forEach(([typeKey, typeLabel]) => {
    const btn = _buildRecruitTypeBtn(typeKey, typeLabel, activeRecruitType === typeKey, () => {
      _selectedRecruitType = typeKey;
      _rerenderRecruitBar(container, cfg);
    }, "mode");
    modeGroup.appendChild(btn);
  });
  bar.appendChild(modeGroup);

  const filterGroup = createElement("div", { className: "talent-recruit-filter-group" });
  filterGroup.appendChild(createElement("div", {
    className: "talent-recruit-group-title",
    text: "列表筛选",
  }));

  const allBtn = _buildRecruitTypeBtn("all", "全部", _recruitFilter === "all", () => {
    _recruitFilter = "all";
    _rerenderList(container);
  }, "filter");
  filterGroup.appendChild(allBtn);

  Object.entries(recruitTypes).forEach(([typeKey, typeLabel]) => {
    const btn = _buildRecruitTypeBtn(typeKey, typeLabel, _recruitFilter === typeKey, () => {
      _recruitFilter = typeKey;
      _rerenderList(container);
    }, "filter");
    filterGroup.appendChild(btn);
  });
  bar.appendChild(filterGroup);

  // 延揽按钮（发起招募LLM）
  const recruitBtn = createElement("button", {
    className: "talent-recruit-btn",
    text: isRecruiting ? `${activeRecruitLabel}延揽中…` : `＋ 延揽${activeRecruitLabel}`,
    attrs: { type: "button", disabled: isRecruiting ? "true" : undefined },
  });
  recruitBtn.addEventListener("click", () => _handleRecruit(container, cfg));
  bar.appendChild(recruitBtn);

  if (isRecruiting) {
    bar.appendChild(createElement("div", {
      className: "talent-recruit-status",
      text: `正在按“${activeRecruitLabel}”搜罗候选人，成功延揽后将并入统一候选池。`,
    }));
  }

  return bar;
}

function _buildRecruitTypeBtn(key, label, active, onClick, kind = "filter") {
  const btn = createElement("button", {
    className: `talent-recruit-type-btn${active ? " talent-recruit-type-btn--active" : ""}`,
    text: label,
    attrs: { type: "button", "data-recruit-type": key, "data-recruit-kind": kind },
  });
  btn.addEventListener("click", onClick);
  return btn;
}

// ─── 招募逻辑 ─────────────────────────────────────────────────────────────────

async function _handleRecruit(container, cfg) {
  const state = getState();
  if (state.talent?.recruiting) return;

  setRecruiting(true);
  _rerenderRecruitBar(container, cfg);

  try {
    const recruitType = getActiveRecruitType(cfg);
    const newTalents = await requestTalentRecruit(recruitType);
    if (!Array.isArray(newTalents) || newTalents.length === 0) {
      showError("暂无合适人才，可稍后再试。");
    } else {
      appendTalentPool(newTalents);
      showSuccess(`发现 ${newTalents.length} 位${cfg.talentNoun || "人才"}。`);
    }
  } catch (err) {
    showError(err?.message || "延揽失败，请稍后重试。");
  } finally {
    setRecruiting(false);
    renderTalentView(container);
  }
}

function _rerenderRecruitBar(container, cfg) {
  const bar = container.querySelector(".talent-recruit-bar");
  if (!bar) return;
  const newBar = _buildRecruitBar(cfg, container);
  bar.replaceWith(newBar);
}

function _rerenderList(container) {
  const state = getState();
  const cfg = getTalentConfigFromState(state);
  const pool = sortTalentPool(getTalentPool(state));
  const oldList = container.querySelector(".talent-list");
  const newList = _buildTalentList(pool, cfg, container);
  if (oldList) {
    oldList.replaceWith(newList);
  }
}

// ─── 部件：人才列表 ───────────────────────────────────────────────────────────

function _buildTalentList(pool, cfg, container) {
  const listEl = createElement("div", { className: "talent-list" });

  // 筛选
  const filtered = _recruitFilter === "all"
    ? pool
    : pool.filter((talent) => getTalentSourceKey(talent) === _recruitFilter);

  if (filtered.length === 0) {
    const empty = createElement("div", { className: "talent-empty-state" });
    const icon = createElement("div", { className: "talent-empty-state__icon", text: "📋" });
    const text = createElement("div", { text: "尚无延揽候选，可继续延揽并纳入候选池。" });
    empty.appendChild(icon);
    empty.appendChild(text);
    listEl.appendChild(empty);
    return listEl;
  }

  filtered.forEach((talent) => {
    const card = _buildTalentCard(talent, cfg, container);
    listEl.appendChild(card);
  });

  return listEl;
}

// ─── 部件：单个人才卡 ─────────────────────────────────────────────────────────

function _buildTalentCard(talent, cfg, container) {
  const quality = talent.quality || "ordinary";
  const card = createElement("article", {
    className: `talent-card talent-card--${quality}`,
    dataset: { talentId: talent.id },
  });

  // 头部：姓名 + 品质标签 + 来源
  const header = createElement("div", { className: "talent-card__header" });
  const nameEl = createElement("div", {
    className: "talent-card__name",
    text: talent.name || "佚名",
  });
  const qualityTag = createElement("span", {
    className: `talent-quality-tag talent-quality-tag--${quality}`,
    text: cfg.qualityLabels?.[quality] || quality,
  });
  const sourceKey = getTalentSourceKey(talent);
  const sourceLabel = getTalentSourceLabel(sourceKey, cfg);
  const sourceTag = sourceLabel ? createElement("span", {
    className: "talent-source-tag",
    text: sourceLabel,
  }) : null;

  header.appendChild(nameEl);
  header.appendChild(qualityTag);
  if (sourceTag) header.appendChild(sourceTag);
  card.appendChild(header);

  // 专长标签
  if (talent.field) {
    const fieldEl = createElement("div", {
      className: "talent-card__field",
      text: cfg.abilityFields?.[talent.field] || talent.field,
    });
    card.appendChild(fieldEl);
  }

  if (Array.isArray(talent.tags) && talent.tags.length) {
    const tagsWrap = createElement("div", { className: "talent-card__tags" });
    talent.tags.slice(0, 4).forEach((tag) => {
      tagsWrap.appendChild(createElement("span", {
        className: "talent-card__tag",
        text: tag,
      }));
    });
    card.appendChild(tagsWrap);
  }

  // 能力条
  const abilityBar = _buildAbilityBar(talent.ability || {}, cfg);
  card.appendChild(abilityBar);

  // 开场白（折叠）
  if (talent.openingLine) {
    const quote = createElement("div", {
      className: "talent-card__opening",
      text: `"${talent.openingLine}"`,
    });
    card.appendChild(quote);
  }

  // 背景简介
  if (talent.background) {
    const bg = createElement("div", {
      className: "talent-card__background",
      text: talent.background,
    });
    card.appendChild(bg);
  }

  // 操作按钮
  const actions = createElement("div", { className: "talent-card__actions" });
  const interactBtn = createElement("button", {
    className: "talent-action-btn talent-action-btn--interact",
    text: "召见",
    attrs: { type: "button" },
  });
  interactBtn.addEventListener("click", () => _openInteractPanel(talent, cfg, container));

  actions.appendChild(interactBtn);
  card.appendChild(actions);

  return card;
}

// ─── 部件：能力条组 ───────────────────────────────────────────────────────────

function _buildAbilityBar(ability, cfg) {
  const wrap = createElement("div", { className: "talent-ability-bar" });
  const ABILITY_KEYS = ["military", "politics", "economy", "culture"];
  ABILITY_KEYS.forEach((key) => {
    const val = Math.max(0, Math.min(100, Number(ability[key]) || 0));
    const item = createElement("div", { className: "talent-ability-item" });
    const label = createElement("div", {
      className: "talent-ability-item__label",
      text: cfg.abilityFields?.[key] || key,
    });
    const track = createElement("div", { className: "talent-ability-item__track" });
    const fill = createElement("div", {
      className: `talent-ability-item__fill talent-ability-item__fill--${key}`,
    });
    fill.style.width = `${val}%`;
    fill.style.backgroundColor = TALENT_FIELD_COLORS[key] || "#888";
    track.appendChild(fill);
    item.appendChild(label);
    item.appendChild(track);
    // 数值
    item.appendChild(createElement("div", {
      className: "talent-ability-item__value",
      text: String(val),
    }));
    wrap.appendChild(item);
  });
  return wrap;
}

// ─── 交互面板 ─────────────────────────────────────────────────────────────────

function _openInteractPanel(talent, cfg, container) {
  const existingOverlay = document.getElementById("talent-interact-overlay");
  if (existingOverlay) existingOverlay.remove();

  _interactingTalentId = talent.id;

  const { overlay, body, footer, closeButton } = createOverlayPanel({
    overlayId: "talent-interact-overlay",
    overlayClassName: "talent-interact-overlay",
    panelClassName: "talent-interact-panel",
    title: talent.name,
    subtitle: cfg.qualityLabels?.[talent.quality] || talent.quality || "",
    onClose: () => {
      overlay.remove();
      _interactingTalentId = null;
    },
  });

  // 历史对话渲染
  const historyEl = createElement("div", { className: "talent-interact-history" });
  body.appendChild(historyEl);
  _renderInteractHistory(historyEl, talent.id);

  // 输入区
  const inputWrap = createElement("div", { className: "talent-interact-input-wrap" });
  const textarea = createElement("textarea", {
    className: "talent-interact-textarea",
    attrs: { placeholder: "向其提问或传达旨意…", rows: "2" },
  });
  const sendBtn = createElement("button", {
    className: "talent-interact-send-btn",
    text: "传达",
    attrs: { type: "button" },
  });
  sendBtn.addEventListener("click", () => _sendInteractMessage(talent, cfg, textarea, historyEl, sendBtn));
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendBtn.click();
    }
  });
  inputWrap.appendChild(textarea);
  inputWrap.appendChild(sendBtn);
  footer.appendChild(inputWrap);

  document.body.appendChild(overlay);
  textarea.focus();
}

function _renderInteractHistory(historyEl, talentId) {
  historyEl.innerHTML = "";
  const state = getState();
  const history = getTalentInteractionHistory(talentId, state);

  if (history.length === 0) {
    const emptyHint = createElement("div", {
      className: "talent-interact-empty",
      text: "尚未与此人交流，可试探其志向。",
    });
    historyEl.appendChild(emptyHint);
    return;
  }

  history.forEach((entry) => {
    const bubble = createElement("div", {
      className: `talent-bubble talent-bubble--${entry.role === "user" ? "player" : "talent"}`,
      text: entry.content,
    });
    historyEl.appendChild(bubble);
  });

  historyEl.scrollTop = historyEl.scrollHeight;
}

async function _sendInteractMessage(talent, cfg, textarea, historyEl, sendBtn) {
  const message = (textarea.value || "").trim();
  if (!message) return;

  textarea.value = "";
  sendBtn.disabled = true;

  // 立即本地追加玩家消息
  appendTalentInteractionEntry(talent.id, { role: "user", content: message });
  _renderInteractHistory(historyEl, talent.id);

  try {
    const state = getState();
    const history = getTalentInteractionHistory(talent.id, state);
    const result = await requestTalentInteract(talent, message, history.slice(-20));

    // 追加 AI 回复
    appendTalentInteractionEntry(talent.id, { role: "assistant", content: result.reply || "" });
    if (result.loyaltyDelta || result.attitude) {
      applyTalentInteractionResult(talent.id, {
        loyaltyDelta: result.loyaltyDelta || 0,
        attitude: result.attitude || null,
      });
    }
    _renderInteractHistory(historyEl, talent.id);
  } catch (err) {
    showError(err?.message || "召见失败，请稍后重试。");
    appendTalentInteractionEntry(talent.id, { role: "assistant", content: "（通讯中断，未收到回应）" });
    _renderInteractHistory(historyEl, talent.id);
  } finally {
    sendBtn.disabled = false;
    textarea.focus();
  }
}

