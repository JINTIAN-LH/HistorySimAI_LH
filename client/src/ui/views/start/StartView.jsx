import { useEffect, useState } from "react";
import { loadJSON } from "@legacy/dataLoader.js";
import { router } from "@legacy/router.js";
import { getState, setState } from "@legacy/state.js";
import { saveGame, setSavedGameplayMode } from "@legacy/storage.js";
import { showGoalPanel } from "@ui/goalPanel.js";
import { useLegacySelector } from "@client/ui/hooks/useLegacySelector.js";
import { isRigidModeAllowed, resolveWorldviewStartPageCopy } from "@legacy/worldview/worldviewRuntimeAccessor.js";

let startPhase = "intro";

export function setStartPhase(phase) {
  startPhase = phase === "create" ? "create" : "intro";
}

function applyModeSelection(mode) {
  const state = getState();
  const nextMode = (mode === "rigid_v1" && isRigidModeAllowed(state)) ? "rigid_v1" : "classic";
  const rigidCalendar = state?.rigid?.calendar || { year: 1627, month: 8 };
  setState({
    mode: nextMode,
    config: {
      ...(state.config || {}),
      gameplayMode: nextMode,
    },
    ...(nextMode === "rigid_v1"
      ? {
        currentYear: Math.max(1, (Number(rigidCalendar.year) || 1627) - 1626),
        currentMonth: Number(rigidCalendar.month) || 8,
        currentPhase: "morning",
      }
      : {}),
  });
  setSavedGameplayMode(nextMode);
}

export function StartView() {
  const mode = useLegacySelector((state) => state.mode);
  const runtimeState = useLegacySelector((state) => state);
  const rigidModeAllowed = isRigidModeAllowed(runtimeState);
  const runtimeTitle = runtimeState?.config?.gameTitle
    || runtimeState?.config?.worldviewData?.gameTitle
    || runtimeState?.config?.worldviewData?.title
    || "历史模拟器";
  const startCopy = resolveWorldviewStartPageCopy(runtimeState);
  const heroTitle = startCopy.heroTitle || runtimeTitle;
  const heroSubtitle = startCopy.heroSubtitle || "";
  const [selectedMode, setSelectedMode] = useState(
    rigidModeAllowed && mode === "rigid_v1" ? "rigid_v1" : "classic"
  );
  const [introLines, setIntroLines] = useState([]);
  const [revealedLines, setRevealedLines] = useState([]);
  const [canStart, setCanStart] = useState(false);

  useEffect(() => {
    setSelectedMode(rigidModeAllowed && mode === "rigid_v1" ? "rigid_v1" : "classic");
  }, [mode, rigidModeAllowed]);

  useEffect(() => {
    let disposed = false;

    loadJSON("data/intro.json")
      .then((data) => {
        if (disposed) return;
        const lines = Array.isArray(data?.lines) ? data.lines : [];
        setIntroLines(lines);
        if (!lines.length) {
          setCanStart(true);
        }
      })
      .catch((error) => {
        console.error("加载游戏介绍失败", error);
        if (!disposed) {
          setIntroLines([]);
          setCanStart(true);
        }
      });

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    if (!introLines.length) {
      return undefined;
    }

    let cancelled = false;
    let timerId = null;
    setRevealedLines([]);
    setCanStart(false);

    const revealNextLine = (index) => {
      if (cancelled) return;
      if (index >= introLines.length) {
        setCanStart(true);
        return;
      }
      setRevealedLines((current) => [...current, introLines[index]]);
      timerId = window.setTimeout(() => revealNextLine(index + 1), 1200);
    };

    revealNextLine(0);

    return () => {
      cancelled = true;
      if (timerId) {
        window.clearTimeout(timerId);
      }
    };
  }, [introLines]);

  const handleStart = () => {
    applyModeSelection(selectedMode);
    setState({ gameStarted: true });
    saveGame();
    router.setView(router.VIEW_IDS.EDICT);
    showGoalPanel();
  };

  return (
    <div className={`view-shell view-shell--centered start-intro-root${startPhase === "create" ? " start-intro-root--create" : ""}`}>
      <div className="view-shell__header">
        <div className="view-title start-intro-title">{heroTitle}</div>
        {heroSubtitle ? <div className="view-subtitle start-intro-subtitle">{heroSubtitle}</div> : null}
      </div>

      <div className="view-shell__content">
        <div className="edict-block start-intro-block">
          {revealedLines.map((line, index) => (
            <div key={`${index}-${line}`} className="pseudo-line">
              <span className={`pseudo-line-text start-intro-line start-intro-line--c${index % 5}`}>
                {line}
              </span>
            </div>
          ))}
        </div>

        <section className="section-card start-intro-mode-card">
          <div className="section-card__header">
            <div className="section-card__title">玩法模式</div>
          </div>
          <div className="section-card__body">
            <div className="start-intro-actions start-intro-mode-actions">
              <button
                type="button"
                className={`ui-btn ui-btn--block start-view-btn${selectedMode === "classic" ? " ui-btn--selected" : ""}`}
                aria-pressed={selectedMode === "classic" ? "true" : "false"}
                onClick={() => setSelectedMode("classic")}
              >
                <div className="ui-btn__title">经典模式</div>
                <div className="ui-btn__desc">初玩者推荐，第一代节奏与叙事系统</div>
              </button>

              {rigidModeAllowed ? (
                <button
                  type="button"
                  className={`ui-btn ui-btn--block start-view-btn${selectedMode === "rigid_v1" ? " ui-btn--selected" : ""}`}
                  aria-pressed={selectedMode === "rigid_v1" ? "true" : "false"}
                  onClick={() => setSelectedMode("rigid_v1")}
                >
                  <div className="ui-btn__title">困难模式</div>
                  <div className="ui-btn__desc">更严苛的节奏与叙事系统，适合追求挑战的玩家</div>
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <section className="section-card start-intro-actions-card">
          <div className="section-card__header">
            <div className="section-card__title">开始本局</div>
          </div>
          <div className="section-card__body">
            <div className="start-intro-actions">
              <button
                type="button"
                className="ui-btn ui-btn--primary ui-btn--block start-view-btn start-intro-start-btn"
                disabled={!canStart}
                onClick={handleStart}
              >
                <div className="ui-btn__title">{startCopy.startButtonLabel}</div>
                <div className="ui-btn__desc">载入当前模式的独立存档与目标追踪面板。</div>
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
