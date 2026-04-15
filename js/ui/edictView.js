import { router } from "../router.js";
import { runCurrentTurn } from "../systems/turnSystem.js";
import { createGameplayPageTemplate } from "./viewPrimitives.js";

const EDICT_SCROLL_FAB_ID = "edict-scroll-bottom-fab";
const EDICT_SCROLL_FAB_OFFSET = 18;
const EDICT_SCROLL_FAB_VISIBILITY_GAP = 32;
const activeEdictScrollFabCleanups = new Set();

function waitForRenderFrames() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") {
      resolve();
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(resolve);
    });
  });
}

function scrollHostToBottom(scrollHost) {
  if (!scrollHost) return;
  const targetTop = Math.max(0, scrollHost.scrollHeight - scrollHost.clientHeight);
  if (typeof scrollHost.scrollTo === "function") {
    scrollHost.scrollTo({ top: targetTop, behavior: "smooth" });
    return;
  }
  scrollHost.scrollTop = targetTop;
}

function getFloatingButtonPositionHost(container, scrollHost, useLegacyLayout) {
  if (!useLegacyLayout) {
    return scrollHost;
  }

  return container.closest(".desktop-gameplay-panel__body")
    || document.getElementById("main-view")
    || container;
}

function syncFloatingButtonPosition(button, positionHost) {
  if (!button || !positionHost) return;

  const rect = positionHost.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    button.style.opacity = "0";
    button.style.pointerEvents = "none";
    return;
  }

  button.style.left = `${Math.round(rect.right - EDICT_SCROLL_FAB_OFFSET)}px`;
  button.style.top = `${Math.round(rect.bottom - EDICT_SCROLL_FAB_OFFSET)}px`;
}

function syncFloatingButtonVisibility(button, scrollHost) {
  if (!button || !scrollHost) return;

  const remainingDistance = scrollHost.scrollHeight - scrollHost.clientHeight - scrollHost.scrollTop;
  const canScrollFurther = remainingDistance > EDICT_SCROLL_FAB_VISIBILITY_GAP;

  button.hidden = !canScrollFurther;
  button.setAttribute("aria-hidden", canScrollFurther ? "false" : "true");
}

function removeEdictScrollButton(container) {
  const cleanup = container?._edictScrollFabCleanup;
  if (typeof cleanup === "function") {
    cleanup();
    activeEdictScrollFabCleanups.delete(cleanup);
  }
  container._edictScrollFabCleanup = null;
}

function mountEdictScrollButton(container, scrollHost, useLegacyLayout) {
  if (typeof document === "undefined" || !container || !scrollHost) {
    return;
  }

  removeEdictScrollButton(container);

  const positionHost = getFloatingButtonPositionHost(container, scrollHost, useLegacyLayout);
  const button = document.createElement("button");
  button.id = EDICT_SCROLL_FAB_ID;
  button.className = "edict-scroll-fab";
  button.type = "button";
  button.setAttribute("aria-label", "跳转到诏书底部");
  button.title = "直达最新诏书";
  button.textContent = "最新诏书";

  const syncUi = () => {
    syncFloatingButtonPosition(button, positionHost);
    syncFloatingButtonVisibility(button, scrollHost);
  };

  button.addEventListener("click", () => {
    scrollHostToBottom(scrollHost);
  });

  scrollHost.addEventListener("scroll", syncUi, { passive: true });
  window.addEventListener("resize", syncUi);
  if (positionHost !== scrollHost) {
    window.addEventListener("scroll", syncUi, { passive: true });
  }

  const mutationObserver = typeof MutationObserver === "function"
    ? new MutationObserver(() => {
      syncUi();
    })
    : null;
  if (mutationObserver) {
    mutationObserver.observe(scrollHost, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  document.body.appendChild(button);
  syncUi();

  let released = false;
  const cleanup = () => {
    if (released) return;
    released = true;
    scrollHost.removeEventListener("scroll", syncUi);
    window.removeEventListener("resize", syncUi);
    if (positionHost !== scrollHost) {
      window.removeEventListener("scroll", syncUi);
    }
    if (mutationObserver) {
      mutationObserver.disconnect();
    }
    button.remove();
    activeEdictScrollFabCleanups.delete(cleanup);
  };
  container._edictScrollFabCleanup = cleanup;
  activeEdictScrollFabCleanups.add(cleanup);
}

export async function renderEdictView(container, options = {}) {
  const { useLegacyLayout = false } = options;
  removeEdictScrollButton(container);
  container.classList.add("main-view--edict");
  container.innerHTML = "";

  if (useLegacyLayout) {
    container._storyLayout = null;
    container._storyRenderId = (container._storyRenderId || 0) + 1;
    await runCurrentTurn(container, { renderId: container._storyRenderId });
    await waitForRenderFrames();
    mountEdictScrollButton(container, container, true);
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
    return;
  }

  const template = createGameplayPageTemplate({
    pageClass: "edict-page",
    title: "诏书中枢",
    subtitle: "将剧情正文、诏令选择、奏报与自拟诏书入口固定在统一玩法骨架内，后续主玩法扩展继续沿用这一页模板。",
    actionsTitle: "诏令选择",
    actionsHint: "固定保留选择区与自拟诏书入口，季度议题锁定后也在这里继续操作。",
    dataTitle: "奏报与回响",
    dataHint: "把新闻流和舆论反馈固定在数据区，减少主玩法页面的信息漂移。",
    mainTitle: "诏书正文",
    mainHint: "正文区继续承载历史记录、当回合文本、批注和数值反馈。",
  });

  template.root._storyLayout = {
    mainBody: template.mainBody,
    actionsBody: template.actionsBody,
    dataBody: template.dataBody,
  };
  template.root._storyRenderId = (container._storyRenderId || 0) + 1;
  container._storyRenderId = template.root._storyRenderId;
  container.appendChild(template.root);

  await runCurrentTurn(template.root, { renderId: template.root._storyRenderId });
  await waitForRenderFrames();
  mountEdictScrollButton(container, template.mainBody, false);
  requestAnimationFrame(() => {
    template.mainBody.scrollTop = template.mainBody.scrollHeight;
  });
}

export function removeEdictPanelsWrap() {
  activeEdictScrollFabCleanups.forEach((cleanup) => cleanup());
  document.querySelectorAll(`#${EDICT_SCROLL_FAB_ID}`).forEach((button) => button.remove());
  const panels = document.querySelectorAll(".edict-panels-wrap");
  panels.forEach((panel) => panel.remove());
}

export function registerEdictView() {
  router.registerView("edict", renderEdictView);
}
