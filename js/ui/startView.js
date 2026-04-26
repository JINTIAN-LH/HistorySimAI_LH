import { getState, setState } from "../state.js";
import { saveGame, setSavedGameplayMode } from "../storage.js";
import { router } from "../router.js";
import { loadJSON } from "../dataLoader.js";
import { showGoalPanel } from "./goalPanel.js";
import { createActionButton, createElement, createSectionCard, createViewShell } from "./viewPrimitives.js";
import {
  resolveWorldviewStartIntroLines,
  resolveWorldviewStartPageCopy,
} from "../worldview/worldviewRuntimeAccessor.js";

let startPhase = "intro";

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

async function renderIntroView(container) {
  const runtimeState = getState();
  const runtimeTitle = runtimeState?.config?.gameTitle
    || runtimeState?.config?.worldviewData?.gameTitle
    || runtimeState?.config?.worldviewData?.title
    || "历史模拟器";
  const startCopy = resolveWorldviewStartPageCopy(runtimeState);
  const heroTitle = startCopy.heroTitle || runtimeTitle;
  const { root, header, content } = createViewShell({
    className: "start-intro-root",
    centered: true,
    title: heroTitle,
  });
  header?.firstChild?.classList.add("start-intro-title");
  header?.lastChild?.classList.add("start-intro-subtitle");
  if (startCopy.heroSubtitle) {
    const subtitle = createElement("div", {
      className: "view-subtitle start-intro-subtitle",
      text: startCopy.heroSubtitle,
    });
    header?.appendChild(subtitle);
  }

  const block = createElement("div", {
    className: "edict-block start-intro-block",
  });
  content.appendChild(block);

  const modeSection = createSectionCard({
    className: "start-intro-mode-card",
    title: "玩法模式",
    hint: "本版本仅保留经典模式。",
  });
  const modeWrap = createElement("div", { className: "start-intro-actions start-intro-mode-actions" });

  const classicBtn = createActionButton({
    label: "经典模式",
    description: "初玩者推荐，第一代节奏与叙事系统",
    className: "start-view-btn",
    selected: true,
  });
  modeWrap.appendChild(classicBtn);
  modeSection.body.appendChild(modeWrap);
  content.appendChild(modeSection.section);

  const startSection = createSectionCard({
    className: "start-intro-actions-card",
    title: "开始本局",
    hint: "介绍播放结束后解锁，避免玩家在状态尚未准备完时提前进入。",
  });
  const actions = createElement("div", { className: "start-intro-actions" });

  const startBtn = createActionButton({
    label: startCopy.startButtonLabel,
    description: "载入当前模式的独立存档与目标追踪面板。",
    variant: "primary",
    className: "start-view-btn start-intro-start-btn",
  });
  startBtn.disabled = true;

  actions.appendChild(startBtn);
  startSection.body.appendChild(actions);
  content.appendChild(startSection.section);
  container.appendChild(root);

  const worldviewIntroLines = resolveWorldviewStartIntroLines(runtimeState);
  let data;
  if (!worldviewIntroLines.length) {
    try {
      data = await loadJSON("data/intro.json");
    } catch (err) {
      console.error("加载游戏介绍失败", err);
    }
  }

  const lines = worldviewIntroLines.length
    ? worldviewIntroLines
    : (Array.isArray(data?.lines) ? data.lines : []);
  if (!lines.length) {
    startBtn.disabled = false;
  } else {
    let index = 0;
    const delay = 1200;

    const addLine = () => {
      if (index >= lines.length) {
        startBtn.disabled = false;
        return;
      }
      const lineText = lines[index++];
      const lineEl = document.createElement("div");
      lineEl.className = "pseudo-line";
      const span = document.createElement("span");
      span.className = "pseudo-line-text start-intro-line";
      const colorIndex = (index - 1) % 5;
      span.classList.add(`start-intro-line--c${colorIndex}`);
      span.textContent = lineText;
      lineEl.appendChild(span);
      block.appendChild(lineEl);
      block.scrollTop = block.scrollHeight;
      setTimeout(addLine, delay);
    };

    addLine();
  }

  startBtn.addEventListener("click", () => {
    applyModeSelection();
    setState({ gameStarted: true });
    saveGame();
    router.setView(router.VIEW_IDS.EDICT);
    showGoalPanel();
  });
}

export async function renderStartView(container) {
  await renderIntroView(container);
}

export function registerStartView() {
  router.registerView("start", (container) => {
    renderStartView(container);
  });
}
