import React, { useEffect, useState } from "react";
import { loadJSON } from "@legacy/dataLoader.js";
import { router } from "@legacy/router.js";
import { getState, setState } from "@legacy/state.js";
import { saveGame, setSavedGameplayMode } from "@legacy/storage.js";
import { showGoalPanel } from "@ui/goalPanel.js";
import { useLegacySelector } from "@client/ui/hooks/useLegacySelector.js";
import { getPersistentLocalItem, setPersistentLocalItem } from "@legacy/persistentBrowserStorage.js";
import {
  resolveWorldviewStartIntroLines,
  resolveWorldviewStartPageCopy,
} from "@legacy/worldview/worldviewRuntimeAccessor.js";
import { OnboardingUpdateModal } from "@client/ui/components/OnboardingUpdateModal.jsx";

let startPhase = "intro";
const ONBOARDING_SEEN_KEY = "history_sim_onboarding_seen_v1";
const DEFAULT_ONBOARDING_CONTENT_VERSION = "1.2.0";

const GUIDE_ITEMS = [
  "前几回合先稳住国库与民心，再考虑高风险扩张。",
  "每次下诏前先看效果预估，避免资源连续透支。",
  "优先补齐文治与军务短板，人才结构比单项高数值更重要。",
  "边患连续走高时先止损，压住连锁惩罚再反推节奏。",
];

const DEFAULT_UPDATE_ITEMS = [
  "困难模式开场链路与剧情连续性已修复，首回合更稳定。",
  "动态决策兜底增强，非常规选项也能继续推进回合。",
  "国势信息展示更集中，关键指标更容易快速判断。",
  "人才与人事链路补强，中后期可用人手更稳定。",
];

function normalizePlayerUpdatesConfig(raw) {
  const version = typeof raw?.version === "string" && raw.version.trim()
    ? raw.version.trim()
    : DEFAULT_ONBOARDING_CONTENT_VERSION;
  const updates = Array.isArray(raw?.updates)
    ? raw.updates.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim())
    : [];
  return {
    version,
    updates: updates.length ? updates : DEFAULT_UPDATE_ITEMS,
  };
}

export function setStartPhase(phase) {
  startPhase = phase === "create" ? "create" : "intro";
}

function applyModeSelection() {
  const state = getState();
  const nextMode = "classic";
  setState({
    mode: nextMode,
    config: {
      ...(state.config || {}),
      gameplayMode: nextMode,
    },
  });
  setSavedGameplayMode(nextMode);
}

export function StartView() {
  const runtimeState = useLegacySelector((state) => state);
  const runtimeTitle = runtimeState?.config?.gameTitle
    || runtimeState?.config?.worldviewData?.gameTitle
    || runtimeState?.config?.worldviewData?.title
    || "历史模拟器";
  const startCopy = resolveWorldviewStartPageCopy(runtimeState);
  const heroTitle = startCopy.heroTitle || runtimeTitle;
  const heroSubtitle = startCopy.heroSubtitle || "";
  const [introLines, setIntroLines] = useState([]);
  const [revealedLines, setRevealedLines] = useState([]);
  const [canStart, setCanStart] = useState(false);
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [onboardingVersion, setOnboardingVersion] = useState(DEFAULT_ONBOARDING_CONTENT_VERSION);
  const [updateItems, setUpdateItems] = useState(DEFAULT_UPDATE_ITEMS);
  const [updatesLoaded, setUpdatesLoaded] = useState(false);

  useEffect(() => {
    let disposed = false;
    const worldviewIntroLines = resolveWorldviewStartIntroLines(runtimeState);

    if (worldviewIntroLines.length) {
      setIntroLines(worldviewIntroLines);
      return () => {
        disposed = true;
      };
    }

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
  }, [runtimeState?.config?.worldviewData, runtimeState?.config?.worldviewOverrides]);

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

  const loadPlayerUpdatesConfig = async () => {
    try {
      const data = await loadJSON("data/playerUpdates.json");
      const normalized = normalizePlayerUpdatesConfig(data);
      setOnboardingVersion(normalized.version);
      setUpdateItems(normalized.updates);
      return normalized;
    } catch (error) {
      console.warn("加载玩家更新配置失败，使用内置文案", error);
      return {
        version: onboardingVersion,
        updates: updateItems,
      };
    } finally {
      setUpdatesLoaded(true);
    }
  };

  useEffect(() => {
    void loadPlayerUpdatesConfig();
  }, []);

  const continueStart = () => {
    applyModeSelection();
    setState({ gameStarted: true });
    saveGame();
    router.setView(router.VIEW_IDS.EDICT);
    showGoalPanel();
  };

  const handleStart = async () => {
    let effectiveVersion = onboardingVersion;
    if (!updatesLoaded) {
      const latest = await loadPlayerUpdatesConfig();
      effectiveVersion = latest.version;
    }

    const seenVersion = getPersistentLocalItem(ONBOARDING_SEEN_KEY);
    if (seenVersion === effectiveVersion) {
      continueStart();
      return;
    }
    setShowOnboardingModal(true);
  };

  const handleConfirmOnboarding = () => {
    setPersistentLocalItem(ONBOARDING_SEEN_KEY, onboardingVersion);
    setShowOnboardingModal(false);
    continueStart();
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
                className="ui-btn ui-btn--block start-view-btn ui-btn--selected"
                aria-pressed="true"
              >
                <div className="ui-btn__title">经典模式</div>
                <div className="ui-btn__desc">初玩者推荐，第一代节奏与叙事系统</div>
              </button>
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

      <OnboardingUpdateModal
        open={showOnboardingModal}
        title="开局提示：玩法引导与最近更新"
        guideItems={GUIDE_ITEMS}
        updateItems={updateItems}
        onConfirm={handleConfirmOnboarding}
      />
    </div>
  );
}
