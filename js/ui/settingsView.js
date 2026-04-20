import { router } from "../router.js";
import { getState, resetState, setState } from "../state.js";
import { saveGame, clearGame, setSavedGameplayMode, getSaveList, loadGame, applyLoadedGame, formatSaveTimestamp, MAX_MANUAL_SLOTS } from "../storage.js";
import { updateTopbarByState, updateGoalBar } from "../layout.js";
import { createActionButton, createButtonRow, createElement, createFoldPanel, createInfoLine, createSectionCard, createTag, createViewShell } from "./viewPrimitives.js";
import { formatEraTimeByRelativeYear, isRigidModeAllowed } from "../worldview/worldviewRuntimeAccessor.js";

function renderSettingsView(container) {
  const state = getState();
  const rigidModeAllowed = isRigidModeAllowed(state);
  const currentModeLabel = state.mode === "rigid_v1" ? "困难模式" : "经典模式";
  const { root, content } = createViewShell({
    className: "settings-view-root",
    title: "设置",
    subtitle: "统一存档、模式与运行信息入口，方便后续继续加玩法时复用同一管理面板。",
  });

  const list = createElement("div", { className: "settings-list" });



  // 存档列表与操作
  const saves = getSaveList(state.mode).filter((save) => save.slotId.startsWith("manual_"));
  const savesBySlot = new Map(saves.map((save) => [save.slotId, save]));
  const currentSlotId = state.slotId || "manual_01";
  const savesSection = createSectionCard({
    title: `存档槽位（${currentModeLabel}）`,
    hint: "按模式隔离存档。后续新增玩法页时，不需要再单独实现自己的读写入口。",
  });
  const savesDrawer = createFoldPanel({
    className: "settings-slot-drawer",
    title: `存档槽位列表（共 ${MAX_MANUAL_SLOTS} 个）`,
    hint: `当前模式：${currentModeLabel}`,
    open: true,
  });
  savesDrawer.header.classList.add("settings-slot-drawer__header");
  savesDrawer.body.classList.add("settings-slot-drawer__body");

  for (let i = 1; i <= MAX_MANUAL_SLOTS; i++) {
    const slotId = `manual_${String(i).padStart(2, "0")}`;
    const slotLabel = `槽位${String(i).padStart(2, "0")}`;
    const save = savesBySlot.get(slotId);
    const isCurrentSlot = currentSlotId === slotId;
    const row = createElement("div", { className: "settings-slot-row" });
    const meta = createElement("div", { className: "settings-slot-meta" });
    const titleRow = createElement("div", { className: "settings-slot-title" });
    titleRow.appendChild(createElement("span", { text: slotLabel }));
    if (isCurrentSlot) {
      titleRow.appendChild(createTag("当前槽位"));
    }
    meta.appendChild(titleRow);
    meta.appendChild(createElement("div", {
      className: "settings-slot-desc",
      text: save
        ? `保存时间 ${formatSaveTimestamp(save.timestamp)} · 游戏时间 ${save.game_time || "-"}${save.player_progress ? ` · 进度 ${save.player_progress}` : ""}`
        : "当前模式下为空槽位",
    }));
    const loadBtn = createActionButton({
      label: "读取",
      variant: "secondary",
      block: false,
    });
    loadBtn.disabled = !save;
    loadBtn.addEventListener("click", () => {
      const loaded = loadGame(slotId, state.mode);
      if (loaded) {
        applyLoadedGame(loaded);
        window.location.reload();
      } else {
        alert(`当前${currentModeLabel}下的该槽位存档读取失败或已损坏`);
      }
    });
    row.appendChild(meta);
    row.appendChild(loadBtn);
    savesDrawer.body.appendChild(row);
  }
  savesSection.body.appendChild(savesDrawer.section);

  const saveControl = createSectionCard({
    title: "手动保存",
    hint: "开发调试时可以固定写入目标槽位，方便反复验证同一阶段。",
  });
  const saveLabel = createElement("span", { className: "settings-slot-desc", text: `保存到当前${currentModeLabel}的指定槽位` });
  const slotSelect = createElement("select", { className: "select-input" });
  for (let i = 1; i <= MAX_MANUAL_SLOTS; i++) {
    const opt = document.createElement("option");
    opt.value = `manual_${String(i).padStart(2, "0")}`;
    opt.textContent = `槽位${i}`;
    slotSelect.appendChild(opt);
  }
  if (currentSlotId.startsWith("manual_")) {
    slotSelect.value = currentSlotId;
  }
  const saveBtn = createActionButton({
    label: "保存",
    variant: "primary",
    block: false,
  });
  saveBtn.addEventListener("click", () => {
    saveGame({ slotId: slotSelect.value, mode: state.mode });
    saveBtn.querySelector(".ui-btn__title").textContent = "已保存";
    setTimeout(() => {
      const titleEl = saveBtn.querySelector(".ui-btn__title");
      if (titleEl) titleEl.textContent = "保存";
    }, 1500);
  });
  const saveRow = createElement("div", { className: "settings-inline-row" });
  saveRow.appendChild(saveLabel);
  saveRow.appendChild(slotSelect);
  saveRow.appendChild(saveBtn);
  saveControl.body.appendChild(saveRow);
  list.appendChild(savesSection.section);
  list.appendChild(saveControl.section);

  const modeSection = createSectionCard({
    title: "玩法模式",
    hint: rigidModeAllowed
      ? `当前：${state.mode === "rigid_v1" ? "困难模式" : "经典模式"}`
      : "检测到自定义世界观，困难模式已隐藏，仅保留经典模式",
  });
  const modeBtns = createButtonRow();

  const classicBtn = createActionButton({
    label: "经典",
    description: "更适合快速验证新玩法和数值调整。",
    selected: state.mode === "classic",
  });

  const rigidBtn = rigidModeAllowed
    ? createActionButton({
      label: "困难",
      description: "更严苛的节奏与约束链，适合验证长期玩法张力。",
      selected: state.mode === "rigid_v1",
    })
    : null;

  const switchMode = (targetMode) => {
    if (state.mode === targetMode) return;
    if (targetMode === "rigid_v1" && !rigidModeAllowed) {
      alert("自定义世界观已启用，困难模式不可用。请先清除自定义世界观。");
      return;
    }
    const targetLabel = targetMode === "rigid_v1" ? "困难模式" : "经典模式";
    if (!confirm(`切换到${targetLabel}？\n将加载该模式的独立存档。`)) return;

    setSavedGameplayMode(targetMode);
    setState({
      mode: targetMode,
      config: {
        ...(state.config || {}),
        gameplayMode: targetMode,
      },
    });
    window.location.reload();
  };

  classicBtn.addEventListener("click", () => switchMode("classic"));
  if (rigidBtn) {
    rigidBtn.addEventListener("click", () => switchMode("rigid_v1"));
  }

  modeBtns.appendChild(classicBtn);
  if (rigidBtn) {
    modeBtns.appendChild(rigidBtn);
  }
  modeSection.body.appendChild(modeBtns);
  list.appendChild(modeSection.section);

  const clearSection = createSectionCard({
    title: "数据操作",
    hint: `清除当前${currentModeLabel}的当前槽位存档并从头开始。`,
  });
  const clearBtn = createActionButton({
    label: "清除当前槽位",
    description: "此操作不可恢复。仅影响当前模式下的当前槽位。",
    variant: "danger",
  });
  clearBtn.addEventListener("click", () => {
    if (confirm(`确定要清除当前${currentModeLabel}下的当前槽位存档吗？此操作不可恢复。`)) {
      clearGame({ slotId: currentSlotId, mode: state.mode });
      resetState();
      updateTopbarByState(getState());
      updateGoalBar(getState());
      window.location.reload();
    }
  });
  clearSection.body.appendChild(clearBtn);
  list.appendChild(clearSection.section);

  const config = state.config || {};
  const phaseLabels = config.phaseLabels || { morning: "早朝", afternoon: "午后", evening: "夜间" };
  const phaseLabel = phaseLabels[state.currentPhase] || "";
  const infoSection = createSectionCard({
    title: "当前局面",
    hint: "保留最常看的运行信息，避免调试时在多个面板来回切。",
  });
  infoSection.body.appendChild(createInfoLine("当前进度", `${formatEraTimeByRelativeYear(state, state.currentYear || 3, state.currentMonth || 4)} · 第${state.currentDay || 1}日 · ${phaseLabel}`));
  infoSection.body.appendChild(createInfoLine("国势摘要", `国库 ${(state.nation?.treasury || 0).toLocaleString()}两 · 民心 ${state.nation?.civilMorale || 0}`));
  list.appendChild(infoSection.section);

  const footerActions = createElement("div", { className: "settings-footer-actions" });
  const backBtn = createActionButton({
    label: "返回诏书",
    description: "回到主决策界面继续当前回合。",
    variant: "primary",
  });
  backBtn.addEventListener("click", () => {
    router.setView(router.VIEW_IDS.EDICT);
  });
  footerActions.appendChild(backBtn);
  list.appendChild(footerActions);

  content.appendChild(list);
  container.appendChild(root);
}

export function registerSettingsView() {
  router.registerView("settings", (container) => {
    renderSettingsView(container);
  });
}
