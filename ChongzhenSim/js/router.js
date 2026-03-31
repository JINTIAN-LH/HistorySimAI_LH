import { saveEdictScrollTop } from "./ui/scrollMemory.js";

const DESKTOP_MEDIA = "(min-width: 1200px)";

export const router = (() => {
  const VIEW_IDS = {
    START: "start",
    EDICT: "edict",
    COURT: "court",
    NATION: "nation",
    SETTINGS: "settings",
  };

  let currentView = VIEW_IDS.EDICT;
  let viewRenderers = {};
  const DEBOUNCE_MS = 400;
  let lastSetViewAt = 0;
  let lastDesktopFlag = typeof window !== "undefined" ? window.matchMedia(DESKTOP_MEDIA).matches : false;

  function isGameViewId(id) {
    return id === VIEW_IDS.EDICT || id === VIEW_IDS.COURT || id === VIEW_IDS.NATION;
  }

  function isDesktopLayout() {
    if (typeof window === "undefined") return false;
    return window.matchMedia(DESKTOP_MEDIA).matches;
  }

  function shouldRemoveEdictPanels(id) {
    if (id === VIEW_IDS.EDICT) return false;
    if (isDesktopLayout() && isGameViewId(id)) return false;
    return true;
  }

  function ensureDesktopColumns(main) {
    main.classList.add("main-view--desktop");
    if (document.getElementById("main-col-edict-body")) return;

    main.innerHTML = "";
    const specs = [
      { suffix: "court", label: "朝堂", mod: "court" },
      { suffix: "edict", label: "诏书", mod: "edict" },
      { suffix: "nation", label: "国家", mod: "nation" },
    ];
    specs.forEach((s) => {
      const col = document.createElement("section");
      col.className = `main-col main-col--${s.mod}`;
      col.id = `main-col-${s.suffix}`;
      const header = document.createElement("div");
      header.className = "main-col-header";
      header.textContent = s.label;
      const body = document.createElement("div");
      body.className = "main-col-body";
      body.id = `main-col-${s.suffix}-body`;
      col.appendChild(header);
      col.appendChild(body);
      main.appendChild(col);
    });
  }

  function scrollDesktopColumnIntoView(id) {
    const map = {
      [VIEW_IDS.EDICT]: "main-col-edict",
      [VIEW_IDS.COURT]: "main-col-court",
      [VIEW_IDS.NATION]: "main-col-nation",
    };
    const colId = map[id];
    if (!colId) return;
    const el = document.getElementById(colId);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }

  async function renderDesktopGameViews() {
    const edictBody = document.getElementById("main-col-edict-body");
    const courtBody = document.getElementById("main-col-court-body");
    const nationBody = document.getElementById("main-col-nation-body");
    if (!edictBody || !courtBody || !nationBody) return;

    edictBody.innerHTML = "";
    courtBody.innerHTML = "";
    nationBody.innerHTML = "";

    const edictFn = viewRenderers[VIEW_IDS.EDICT];
    const courtFn = viewRenderers[VIEW_IDS.COURT];
    const nationFn = viewRenderers[VIEW_IDS.NATION];
    if (courtFn) courtFn(courtBody);
    if (edictFn) await edictFn(edictBody);
    if (nationFn) await nationFn(nationBody);
  }

  async function refreshDesktopCourtAndNation() {
    const courtBody = document.getElementById("main-col-court-body");
    const nationBody = document.getElementById("main-col-nation-body");
    if (!courtBody || !nationBody) return;
    courtBody.innerHTML = "";
    nationBody.innerHTML = "";
    const courtFn = viewRenderers[VIEW_IDS.COURT];
    const nationFn = viewRenderers[VIEW_IDS.NATION];
    if (courtFn) courtFn(courtBody);
    if (nationFn) await nationFn(nationBody);
  }

  function registerView(id, renderFn) {
    viewRenderers[id] = renderFn;
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

  function setView(id) {
    const hasRenderer = !!viewRenderers[id];
    if (!hasRenderer) return;

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

    if (shouldRemoveEdictPanels(id)) {
      const wrap = document.getElementById("edict-panels-wrap");
      if (wrap) wrap.remove();
    }

    const main = document.getElementById("main-view");
    if (!main) return;

    if (previousView === VIEW_IDS.EDICT && id !== VIEW_IDS.EDICT) {
      if (!(isDesktopLayout() && isGameViewId(id))) {
        const edictBody = document.getElementById("main-col-edict-body");
        saveEdictScrollTop(edictBody ? edictBody.scrollTop : main.scrollTop);
      }
    }

    if (id === VIEW_IDS.START || id === VIEW_IDS.SETTINGS) {
      main.classList.remove("main-view--desktop");
      main.innerHTML = "";
      viewRenderers[id](main);
      highlightBottomTab(id);
      return;
    }

    if (isGameViewId(id) && isDesktopLayout()) {
      ensureDesktopColumns(main);

      const edictBody = document.getElementById("main-col-edict-body");
      const needsFullRender = !edictBody || edictBody.childElementCount === 0;

      if (needsFullRender) {
        void renderDesktopGameViews();
      } else {
        scrollDesktopColumnIntoView(id);
      }

      highlightBottomTab(id);
      return;
    }

    main.classList.remove("main-view--desktop");
    main.innerHTML = "";
    viewRenderers[id](main);
    highlightBottomTab(id);
  }

  function getCurrentView() {
    return currentView;
  }

  function init() {
    if (typeof window === "undefined") return;
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const nowDesktop = isDesktopLayout();
        if (nowDesktop !== lastDesktopFlag) {
          lastDesktopFlag = nowDesktop;
          setView(currentView);
        }
      }, 200);
    });
  }

  return {
    VIEW_IDS,
    registerView,
    setView,
    init,
    isDesktopLayout,
    isGameViewId,
    getCurrentView,
    refreshDesktopCourtAndNation,
  };
})();
