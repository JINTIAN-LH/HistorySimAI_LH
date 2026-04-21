import { getState, setState } from "../state.js";
import { saveGame, setSavedGameplayMode } from "../storage.js";
import { router } from "../router.js";
import { loadJSON } from "../dataLoader.js";
import { showGoalPanel } from "./goalPanel.js";
import { createActionButton, createElement, createSectionCard, createViewShell } from "./viewPrimitives.js";
import {
  isRigidModeAllowed,
  resolveWorldviewStartIntroLines,
  resolveWorldviewStartPageCopy,
} from "../worldview/worldviewRuntimeAccessor.js";

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

async function renderIntroView(container) {
  const runtimeState = getState();
  const rigidModeAllowed = isRigidModeAllowed(runtimeState);
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
    hint: rigidModeAllowed
      ? "先确定本局节奏。新模式扩展时可以直接复用这块结构。"
      : "检测到自定义世界观，困难模式已自动隐藏，仅保留经典模式。",
  });
  const modeWrap = createElement("div", { className: "start-intro-actions start-intro-mode-actions" });

  let selectedMode = rigidModeAllowed && getState().mode === "rigid_v1" ? "rigid_v1" : "classic";

  const buildModeBtn = (mode, label, desc) => {
    const btn = createActionButton({
      label,
      description: desc,
      className: "start-view-btn",
    });
    btn.addEventListener("click", () => {
      selectedMode = mode;
      refreshModeButtons();
    });
    return btn;
  };

  const classicBtn = buildModeBtn("classic", "经典模式", "初玩者推荐，第一代节奏与叙事系统");
  modeWrap.appendChild(classicBtn);
  const rigidBtn = rigidModeAllowed
    ? buildModeBtn("rigid_v1", "困难模式", "更严苛的节奏与叙事系统，适合追求挑战的玩家")
    : null;
  if (rigidBtn) {
    modeWrap.appendChild(rigidBtn);
  }
  modeSection.body.appendChild(modeWrap);
  content.appendChild(modeSection.section);

  function refreshModeButtons() {
    const pairs = [[classicBtn, "classic"]];
    if (rigidBtn) {
      pairs.push([rigidBtn, "rigid_v1"]);
    }
    pairs.forEach(([btn, mode]) => {
      const active = selectedMode === mode;
      btn.classList.toggle("ui-btn--selected", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }
  refreshModeButtons();

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
    applyModeSelection(selectedMode);
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
