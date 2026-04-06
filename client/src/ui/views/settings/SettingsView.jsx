import { useEffect, useState } from "react";
import { router } from "@legacy/router.js";
import { getState, resetState, setState } from "@legacy/state.js";
import {
  applyLoadedGame,
  clearGame,
  formatSaveTimestamp,
  getSaveList,
  loadGame,
  MAX_MANUAL_SLOTS,
  saveGame,
  setSavedGameplayMode,
} from "@legacy/storage.js";
import { updateGoalBar, updateTopbarByState } from "@legacy/layout.js";
import { shallowEqual, useLegacySelector } from "@client/ui/hooks/useLegacySelector.js";

function getModeLabel(mode) {
  return mode === "rigid_v1" ? "困难模式" : "经典模式";
}

function buildProgressText(state) {
  const config = state.config || {};
  const phaseLabels = config.phaseLabels || { morning: "早朝", afternoon: "午后", evening: "夜间" };
  const phaseLabel = phaseLabels[state.currentPhase] || "";
  return `当前进度：建炎${state.currentYear || 3}年${state.currentMonth || 4}月 · 第${state.currentDay || 1}日 · ${phaseLabel}`;
}

function SaveSlotsDrawer({ currentModeLabel, currentSlotId, savesBySlot, onLoad }) {
  const [open, setOpen] = useState(true);

  return (
    <section className={`fold-section settings-slot-drawer${open ? " fold-section--open" : ""}`}>
      <button
        type="button"
        className="fold-header settings-slot-drawer__header"
        aria-expanded={open ? "true" : "false"}
        onClick={() => setOpen((value) => !value)}
      >
        <div className="fold-header__content">
          <div className="fold-header__title">存档槽位列表（共 {MAX_MANUAL_SLOTS} 个）</div>
          <div className="fold-header__hint">当前模式：{currentModeLabel}</div>
        </div>
        <span className="fold-arrow">▶</span>
      </button>
      <div className="fold-body settings-slot-drawer__body">
        {Array.from({ length: MAX_MANUAL_SLOTS }, (_, index) => {
          const slotNumber = String(index + 1).padStart(2, "0");
          const slotId = `manual_${slotNumber}`;
          const slotLabel = `槽位${slotNumber}`;
          const save = savesBySlot.get(slotId);
          const isCurrentSlot = currentSlotId === slotId;

          return (
            <div key={slotId} className="settings-slot-row">
              <div className="settings-slot-meta">
                <div className="settings-slot-title">
                  <span>{slotLabel}</span>
                  {isCurrentSlot ? <span className="feed-card__tag feed-card__tag--normal">当前槽位</span> : null}
                </div>
                <div className="settings-slot-desc">
                  {save
                    ? `保存时间 ${formatSaveTimestamp(save.timestamp)} · 游戏时间 ${save.game_time || "-"}${save.player_progress ? ` · 进度 ${save.player_progress}` : ""}`
                    : "当前模式下为空槽位"}
                </div>
              </div>
              <button type="button" disabled={!save} onClick={() => onLoad(slotId)}>
                读取
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function SettingsView() {
  const { mode, currentSlotId } = useLegacySelector((state) => ({
    mode: state.mode,
    currentSlotId: state.slotId || "manual_01",
  }), shallowEqual);
  const currentModeLabel = getModeLabel(mode);
  const [selectedSlotId, setSelectedSlotId] = useState(
    currentSlotId.startsWith("manual_") ? currentSlotId : "manual_01"
  );
  const [saveButtonText, setSaveButtonText] = useState("保存");

  useEffect(() => {
    if (currentSlotId.startsWith("manual_")) {
      setSelectedSlotId(currentSlotId);
    }
  }, [currentSlotId]);

  useEffect(() => {
    if (saveButtonText !== "已保存") {
      return undefined;
    }
    const timerId = window.setTimeout(() => {
      setSaveButtonText("保存");
    }, 1500);
    return () => {
      window.clearTimeout(timerId);
    };
  }, [saveButtonText]);

  const saves = getSaveList(mode).filter((save) => save.slotId.startsWith("manual_"));
  const savesBySlot = new Map(saves.map((save) => [save.slotId, save]));

  const switchMode = (targetMode) => {
    if (mode === targetMode) return;
    const targetLabel = getModeLabel(targetMode);
    if (!window.confirm(`切换到${targetLabel}？\n将加载该模式的独立存档。`)) return;

    setSavedGameplayMode(targetMode);
    setState({
      mode: targetMode,
      config: {
        ...(getState().config || {}),
        gameplayMode: targetMode,
      },
    });
    window.location.reload();
  };

  const handleLoad = (slotId) => {
    const loaded = loadGame(slotId, mode);
    if (loaded) {
      applyLoadedGame(loaded);
      window.location.reload();
      return;
    }
    window.alert(`当前${currentModeLabel}下的该槽位存档读取失败或已损坏`);
  };

  const handleSave = () => {
    saveGame({ slotId: selectedSlotId, mode });
    setSaveButtonText("已保存");
  };

  const handleClear = () => {
    if (!window.confirm(`确定要清除当前${currentModeLabel}下的当前槽位存档吗？此操作不可恢复。`)) {
      return;
    }
    clearGame({ slotId: currentSlotId, mode });
    resetState();
    updateTopbarByState(getState());
    updateGoalBar(getState());
    window.location.reload();
  };

  const progressState = useLegacySelector((state) => ({
    currentYear: state.currentYear,
    currentMonth: state.currentMonth,
    currentDay: state.currentDay,
    currentPhase: state.currentPhase,
    config: state.config,
    nation: state.nation,
  }), shallowEqual);

  return (
    <div>
      <div
        style={{
          fontSize: "16px",
          fontWeight: "700",
          color: "var(--color-text-main)",
          marginBottom: "12px",
        }}
      >
        设置
      </div>

      <div className="settings-list">
        <div
          className="settings-item"
          style={{ flexDirection: "column", alignItems: "flex-start", gap: "6px" }}
        >
          <div style={{ fontWeight: "600" }}>存档槽位（当前模式：{currentModeLabel}）</div>
          <SaveSlotsDrawer
            currentModeLabel={currentModeLabel}
            currentSlotId={currentSlotId}
            savesBySlot={savesBySlot}
            onLoad={handleLoad}
          />

          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span>手动保存到当前{currentModeLabel}：</span>
            <select value={selectedSlotId} onChange={(event) => setSelectedSlotId(event.target.value)}>
              {Array.from({ length: MAX_MANUAL_SLOTS }, (_, index) => {
                const slotId = `manual_${String(index + 1).padStart(2, "0")}`;
                return (
                  <option key={slotId} value={slotId}>
                    槽位{index + 1}
                  </option>
                );
              })}
            </select>
            <button type="button" onClick={handleSave}>
              {saveButtonText}
            </button>
          </div>
        </div>

        <div
          className="settings-item"
          style={{ flexDirection: "column", alignItems: "stretch", gap: "6px" }}
        >
          <div style={{ fontSize: "13px", fontWeight: "600" }}>玩法模式</div>
          <div style={{ fontSize: "12px", color: "var(--color-text-sub)" }}>当前：{currentModeLabel}</div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" onClick={() => switchMode("classic")}>经典</button>
            <button type="button" onClick={() => switchMode("rigid_v1")}>困难</button>
          </div>
        </div>

        <div className="settings-item">
          <span>清除当前{currentModeLabel}的当前槽位存档（重新开始）</span>
          <button
            type="button"
            style={{ color: "var(--color-danger)", borderColor: "var(--color-danger)" }}
            onClick={handleClear}
          >
            清除
          </button>
        </div>

        <div
          className="settings-item"
          style={{ flexDirection: "column", alignItems: "flex-start", gap: "4px" }}
        >
          <div style={{ fontSize: "12px", color: "var(--color-text-sub)" }}>{buildProgressText(progressState)}</div>
          <div style={{ fontSize: "12px", color: "var(--color-text-sub)" }}>
            国库：{(progressState.nation?.treasury || 0).toLocaleString()}两 · 民心：{progressState.nation?.civilMorale || 0}
          </div>
        </div>

        <div className="settings-item">
          <button type="button" onClick={() => router.setView(router.VIEW_IDS.EDICT)}>
            返回诏书
          </button>
        </div>
      </div>
    </div>
  );
}
