import { useEffect, useState } from "react";
import { router } from "@legacy/router.js";
import { getState, resetState, setState } from "@legacy/state.js";
import { fetchConfigStatus, saveRuntimeConfig } from "@client/bootstrap/configurationGate.js";
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

const DEFAULT_API_BASE = "https://open.bigmodel.cn/api/paas/v4";
const DEFAULT_MODEL = "glm-4-flash";

function buildRuntimeFormState(status) {
  const fields = status?.fields || {};
  return {
    LLM_API_KEY: "",
    LLM_API_BASE: fields.LLM_API_BASE?.value || DEFAULT_API_BASE,
    LLM_MODEL: fields.LLM_MODEL?.value || DEFAULT_MODEL,
    LLM_CHAT_MODEL: fields.LLM_CHAT_MODEL?.value || fields.LLM_MODEL?.value || DEFAULT_MODEL,
  };
}

function buildRuntimePayload(formState) {
  const apiBase = String(formState?.LLM_API_BASE || "").trim() || DEFAULT_API_BASE;
  const model = String(formState?.LLM_MODEL || "").trim() || DEFAULT_MODEL;
  const chatModel = String(formState?.LLM_CHAT_MODEL || "").trim() || model;

  return {
    LLM_API_KEY: String(formState?.LLM_API_KEY || "").trim(),
    LLM_API_BASE: apiBase,
    LLM_MODEL: model,
    LLM_CHAT_MODEL: chatModel,
  };
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
  const [runtimeStatus, setRuntimeStatus] = useState(null);
  const [runtimeForm, setRuntimeForm] = useState(() => buildRuntimeFormState(null));
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [runtimeSaving, setRuntimeSaving] = useState(false);
  const [runtimeError, setRuntimeError] = useState("");
  const [runtimeSaveHint, setRuntimeSaveHint] = useState("");

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

  useEffect(() => {
    let active = true;
    const loadRuntimeStatus = async () => {
      setRuntimeLoading(true);
      setRuntimeError("");
      try {
        const status = await fetchConfigStatus();
        if (!active) return;
        setRuntimeStatus(status);
        setRuntimeForm(buildRuntimeFormState(status));
      } catch (error) {
        if (!active) return;
        setRuntimeError(error?.message || "无法读取当前浏览器中的大模型设置");
      } finally {
        if (active) {
          setRuntimeLoading(false);
        }
      }
    };

    loadRuntimeStatus();
    return () => {
      active = false;
    };
  }, []);

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

  const handleRuntimeFieldChange = (event) => {
    const { name, value } = event.target;
    setRuntimeForm((current) => ({
      ...current,
      [name]: value,
    }));
  };

  const handleRuntimeConfigSave = async (event) => {
    event.preventDefault();
    setRuntimeSaving(true);
    setRuntimeSaveHint("");
    setRuntimeError("");

    try {
      const status = await saveRuntimeConfig(buildRuntimePayload(runtimeForm));
      setRuntimeStatus(status);
      setRuntimeForm(buildRuntimeFormState(status));
      setRuntimeSaveHint("已保存到当前浏览器，下次进入仍会生效");
    } catch (error) {
      setRuntimeError(error?.message || "保存失败，请稍后重试");
    } finally {
      setRuntimeSaving(false);
    }
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

        <div
          className="settings-item"
          style={{ flexDirection: "column", alignItems: "stretch", gap: "8px" }}
        >
          <div style={{ fontSize: "13px", fontWeight: "600" }}>大模型参数</div>
          <div style={{ fontSize: "12px", color: "var(--color-text-sub)" }}>
            仅保存在当前浏览器，不会写入公共服务器。
          </div>

          {runtimeLoading ? (
            <div style={{ fontSize: "12px", color: "var(--color-text-sub)" }}>正在读取本地参数…</div>
          ) : (
            <form onSubmit={handleRuntimeConfigSave} style={{ display: "grid", gap: "8px" }}>
              <label style={{ display: "grid", gap: "4px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-sub)" }}>API Key（留空则沿用当前已保存值）</span>
                <input
                  type="password"
                  name="LLM_API_KEY"
                  value={runtimeForm.LLM_API_KEY}
                  onChange={handleRuntimeFieldChange}
                  placeholder="粘贴新 key，或留空保持不变"
                  autoComplete="off"
                  spellCheck="false"
                />
              </label>

              <label style={{ display: "grid", gap: "4px" }}>
                <span style={{ fontSize: "12px", color: "var(--color-text-sub)" }}>API Base</span>
                <input
                  type="text"
                  name="LLM_API_BASE"
                  value={runtimeForm.LLM_API_BASE}
                  onChange={handleRuntimeFieldChange}
                  placeholder={DEFAULT_API_BASE}
                  autoComplete="off"
                  spellCheck="false"
                />
              </label>

              <div style={{ display: "grid", gap: "8px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
                <label style={{ display: "grid", gap: "4px" }}>
                  <span style={{ fontSize: "12px", color: "var(--color-text-sub)" }}>剧情模型</span>
                  <input
                    type="text"
                    name="LLM_MODEL"
                    value={runtimeForm.LLM_MODEL}
                    onChange={handleRuntimeFieldChange}
                    placeholder={DEFAULT_MODEL}
                    autoComplete="off"
                    spellCheck="false"
                  />
                </label>

                <label style={{ display: "grid", gap: "4px" }}>
                  <span style={{ fontSize: "12px", color: "var(--color-text-sub)" }}>对话模型</span>
                  <input
                    type="text"
                    name="LLM_CHAT_MODEL"
                    value={runtimeForm.LLM_CHAT_MODEL}
                    onChange={handleRuntimeFieldChange}
                    placeholder={DEFAULT_MODEL}
                    autoComplete="off"
                    spellCheck="false"
                  />
                </label>
              </div>

              <div style={{ fontSize: "12px", color: "var(--color-text-sub)" }}>
                当前 Key 状态：{runtimeStatus?.fields?.LLM_API_KEY?.masked || "未填写"}
              </div>

              {runtimeError ? (
                <div style={{ fontSize: "12px", color: "var(--color-danger)" }}>{runtimeError}</div>
              ) : null}
              {runtimeSaveHint ? (
                <div style={{ fontSize: "12px", color: "var(--color-text-sub)" }}>{runtimeSaveHint}</div>
              ) : null}

              <div>
                <button type="submit" disabled={runtimeSaving}>
                  {runtimeSaving ? "正在保存…" : "保存大模型参数"}
                </button>
              </div>
            </form>
          )}
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
