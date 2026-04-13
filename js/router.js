import { saveEdictScrollTop } from "./ui/scrollMemory.js";

export const router = (() => {
  const VIEW_IDS = {
    START: "start",
    EDICT: "edict",
    COURT: "court",
    NATION: "nation",
    SETTINGS: "settings",
    TALENT: "talent",
    POLICY: "policy",
  };

  let currentView = VIEW_IDS.EDICT;
  let viewRenderers = {};
  const viewSubscribers = new Set();
  const DEBOUNCE_MS = 400;
  let lastSetViewAt = 0;

  function notifyViewSubscribers() {
    viewSubscribers.forEach((listener) => {
      try {
        listener(currentView);
      } catch (error) {
        console.error("[router] subscriber failed", error);
      }
    });
  }

  function registerView(id, renderFn, options = {}) {
    viewRenderers[id] = {
      renderFn: typeof renderFn === "function" ? renderFn : null,
      renderMode: options.renderMode === "react" ? "react" : "legacy",
    };
  }

  function setView(id) {
    const viewDefinition = viewRenderers[id];
    if (!viewDefinition) return;
    if (id === VIEW_IDS.EDICT) {
      const now = Date.now();
      if (currentView === VIEW_IDS.EDICT && now - lastSetViewAt < DEBOUNCE_MS) {
        highlightBottomTab(id);
        return;
      }
      lastSetViewAt = now;
    }
    const previousView = currentView;
    currentView = id;

    const main = document.getElementById("main-view");
    if (main && previousView === VIEW_IDS.EDICT && id !== VIEW_IDS.EDICT) {
      saveEdictScrollTop(main.scrollTop);
    }
    if (main && viewDefinition.renderMode === "legacy") {
      main.replaceChildren();
      if (viewDefinition.renderFn) {
        viewDefinition.renderFn(main);
      }
    }
    highlightBottomTab(id);
    notifyViewSubscribers();
  }

  function highlightBottomTab(id) {
    const tabEls = document.querySelectorAll("[data-tab-id]");
    tabEls.forEach((el) => {
      if (el.getAttribute("data-tab-id") === id) {
        el.classList.add("bottom-tab--active");
      } else {
        el.classList.remove("bottom-tab--active");
      }
    });
  }

  function init() {
    // bootstrap logic handled by main.js
  }

  function subscribeView(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }
    viewSubscribers.add(listener);
    return () => {
      viewSubscribers.delete(listener);
    };
  }

  function getCurrentView() {
    return currentView;
  }

  function getViewRenderMode(id) {
    return viewRenderers[id]?.renderMode || null;
  }

  return { VIEW_IDS, registerView, setView, init, subscribeView, getCurrentView, getViewRenderMode };
})();
