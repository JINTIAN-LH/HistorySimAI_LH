import { useEffect, useState, useRef } from "react";
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
import { buildLlmProxyHeaders, getApiBase } from "@api/httpClient.js";
import {
  validateWorldviewPackage,
  buildWorldviewPackage,
  saveCustomWorldview,
  loadCustomWorldview,
  clearCustomWorldview,
  hasCustomWorldview,
  buildWorldviewPreview,
} from "@legacy/worldview/worldviewStorage.js";

function getModeLabel(mode) {
  return mode === "rigid_v1" ? "困难模式" : "经典模式";
}

function buildProgressText(state) {
  const config = state.config || {};
  const phaseLabels = config.phaseLabels || { morning: "早朝", afternoon: "午后", evening: "夜间" };
  const phaseLabel = phaseLabels[state.currentPhase] || "";
  return `当前进度：建炎${state.currentYear || 3}年${state.currentMonth || 4}月 · 第${state.currentDay || 1}日 · ${phaseLabel}`;
}

const DEFAULT_API_BASE = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = "qwen-plus";

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

  // ── 世界观导入状态 ──
  const [wvTemplateFile, setWvTemplateFile] = useState(null);
  const [wvTemplateText, setWvTemplateText] = useState("");
  const [wvValidation, setWvValidation] = useState(null);
  const [wvPreview, setWvPreview] = useState(null);
  const [wvImporting, setWvImporting] = useState(false);
  const [wvError, setWvError] = useState("");
  const [wvHint, setWvHint] = useState("");
  const [wvActive, setWvActive] = useState(() => hasCustomWorldview());
  const [wvActivePreview, setWvActivePreview] = useState(() => {
    const existing = loadCustomWorldview();
    return existing ? buildWorldviewPreview({ worldview: existing.worldview, overrides: existing.overrides, meta: existing.meta }) : null;
  });
  const templateFileRef = useRef(null);

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
      setRuntimeSaveHint("已立即生效，并保存到当前浏览器");
    } catch (error) {
      setRuntimeError(error?.message || "保存失败，请稍后重试");
    } finally {
      setRuntimeSaving(false);
    }
  };

  // ── 世界观导入处理 ──
  const readTextFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(String(reader.result || ""));
      };
      reader.onerror = () => reject(new Error(`读取 ${file.name} 失败`));
      reader.readAsText(file);
    });

  const handleTemplateFileChange = async (file) => {
    setWvTemplateFile(file || null);
    setWvError("");
    setWvHint("");
    setWvValidation(null);
    setWvPreview(null);
    if (!file) {
      setWvTemplateText("");
      return;
    }
    try {
      const text = await readTextFile(file);
      setWvTemplateText(text);
      setWvHint("模板已读取，可直接点击“生成并应用”。");
    } catch (err) {
      setWvError(err.message || "读取模板失败");
    }
  };

  const handleWorldviewImport = async () => {
    setWvImporting(true);
    setWvError("");
    setWvHint("");
    try {
      const templateText = String(wvTemplateText || "").trim();
      if (templateText.length < 30) {
        setWvError("请先输入至少30字的世界观模板文本");
        return;
      }

      const currentConfig = getState().config || {};
      const apiBase = getApiBase(currentConfig, "[settings/worldview-transform]");
      if (!apiBase) {
        setWvError("无法定位后端接口地址，请先检查运行配置");
        return;
      }

      const res = await fetch(`${apiBase}/api/chongzhen/worldview/transform`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...buildLlmProxyHeaders(currentConfig),
        },
        body: JSON.stringify({ templateText }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setWvError(payload?.error || "世界观生成失败，请稍后重试");
        return;
      }

      const pkg = buildWorldviewPackage(payload.worldview, payload.overrides, {
        sourceType: payload?.meta?.sourceType || "template_text",
        templateLength: templateText.length,
      });
      const result = validateWorldviewPackage(pkg);
      if (!result.valid) {
        setWvError("校验未通过：" + result.errors.join("；"));
        return;
      }
      saveCustomWorldview(pkg);
      setWvActive(true);
      setWvActivePreview(buildWorldviewPreview(pkg));
      setWvValidation(result);
      setWvPreview(buildWorldviewPreview(pkg));
      setWvHint("世界观已生成并保存到本地，正在刷新使其生效…");
      window.location.reload();
    } catch (err) {
      setWvError(err.message || "导入失败");
    } finally {
      setWvImporting(false);
    }
  };

  const handleWorldviewClear = () => {
    if (!window.confirm("确定要清除自定义世界观并恢复默认吗？清除后需刷新页面生效。")) return;
    clearCustomWorldview();
    setWvActive(false);
    setWvActivePreview(null);
    setWvTemplateFile(null);
    setWvTemplateText("");
    setWvValidation(null);
    setWvPreview(null);
    setWvError("");
    setWvHint("");
    if (templateFileRef.current) templateFileRef.current.value = "";
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

        {/* ── 自定义世界观导入 ── */}
        <div
          className="settings-item"
          style={{ flexDirection: "column", alignItems: "stretch", gap: "8px" }}
        >
          <div style={{ fontSize: "13px", fontWeight: "600" }}>自定义世界观导入</div>
          <div style={{ fontSize: "12px", color: "var(--color-text-sub)" }}>
            上传一个自然语言模板 txt 文件，系统将自动生成世界观并保持玩法规则不变。
          </div>

          {wvActive && wvActivePreview ? (
            <div style={{ fontSize: "12px", padding: "8px", background: "var(--color-surface-alt, #1a1a2e)", borderRadius: "6px" }}>
              <div style={{ fontWeight: "600", marginBottom: "4px" }}>
                当前世界观：{wvActivePreview.title}
              </div>
              <div>玩家角色：{wvActivePreview.playerRole}</div>
              <div>角色数量：{wvActivePreview.characterCount}</div>
              <div>势力：{wvActivePreview.factionNames.join("、") || "无"}</div>
              <div>自定义剧情提示词：{wvActivePreview.hasStoryPrompt ? "有" : "无"}</div>
              <div style={{ color: "var(--color-text-sub)" }}>导入时间：{wvActivePreview.importedAt}</div>
              <button
                type="button"
                style={{ marginTop: "6px", color: "var(--color-danger)", borderColor: "var(--color-danger)" }}
                onClick={handleWorldviewClear}
              >
                清除自定义世界观（恢复默认）
              </button>
            </div>
          ) : null}

          <div style={{ display: "grid", gap: "6px" }}>
            <label style={{ display: "grid", gap: "2px" }}>
              <span style={{ fontSize: "12px", color: "var(--color-text-sub)" }}>世界观模板文件（.txt）</span>
              <input
                ref={templateFileRef}
                type="file"
                accept=".txt"
                onChange={(e) => handleTemplateFileChange(e.target.files?.[0] || null)}
              />
            </label>
            <label style={{ display: "grid", gap: "2px" }}>
              <span style={{ fontSize: "12px", color: "var(--color-text-sub)" }}>模板文本（可直接编辑）</span>
              <textarea
                value={wvTemplateText}
                rows={8}
                placeholder="示例：我希望将当前世界观改为……（描述时代背景、玩家身份、核心人物、派系关系、叙事风格）"
                onChange={(e) => {
                  setWvTemplateText(e.target.value);
                  setWvError("");
                  setWvHint("");
                  setWvValidation(null);
                  setWvPreview(null);
                }}
                style={{ resize: "vertical" }}
              />
            </label>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={String(wvTemplateText || "").trim().length < 30 || wvImporting}
              onClick={handleWorldviewImport}
            >
              {wvImporting ? "生成中…" : "生成并应用"}
            </button>
          </div>

          {wvError ? (
            <div style={{ fontSize: "12px", color: "var(--color-danger)" }}>{wvError}</div>
          ) : null}

          {wvHint ? (
            <div style={{ fontSize: "12px", color: "var(--color-text-sub)" }}>{wvHint}</div>
          ) : null}

          {wvValidation && !wvValidation.valid ? (
            <div style={{ fontSize: "12px", color: "var(--color-danger)" }}>
              校验失败：{wvValidation.errors.map((e, i) => <div key={i}>· {e}</div>)}
            </div>
          ) : null}

          {wvValidation?.warnings?.length > 0 ? (
            <div style={{ fontSize: "12px", color: "var(--color-warning, orange)" }}>
              {wvValidation.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
            </div>
          ) : null}

          {wvPreview ? (
            <div style={{ fontSize: "12px", padding: "8px", background: "var(--color-surface-alt, #1a1a2e)", borderRadius: "6px" }}>
              <div style={{ fontWeight: "600", marginBottom: "4px" }}>预览</div>
              <div>世界观：{wvPreview.title}（{wvPreview.id}）</div>
              <div>玩家角色：{wvPreview.playerRole}</div>
              <div>角色数量：{wvPreview.characterCount}</div>
              <div>势力：{wvPreview.factionNames.join("、") || "无"}</div>
              <div>自定义剧情提示词：{wvPreview.hasStoryPrompt ? "有" : "无"}</div>
            </div>
          ) : null}
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
