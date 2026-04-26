const RUNTIME_PROFILES = {
  browserNarrativeStrategy: {
    id: "browser-narrative-strategy",
    label: "浏览器文字策略模拟",
    uiLayer: "react-shell-dom-modules",
    renderLayer: "narrative-dom-rendering",
    coreLayer: "system-driven-simulation",
    dataLayer: "fetch-localstorage-express",
  },
  realtimeSessionGame: {
    id: "realtime-session-game",
    label: "实时联机网页游戏",
    uiLayer: "react-or-vue-shell",
    renderLayer: "canvas-webgl-engine",
    coreLayer: "ecs-loop",
    dataLayer: "websocket-api-services",
  },
};

export function getCurrentProjectTraits() {
  return {
    gameplayStyle: "turn-based",
    primaryInterface: "text",
    usesCanvas: false,
    realtime: false,
    multiplayer: false,
    persistence: ["localStorage"],
    apiProxy: true,
  };
}

export function selectRuntimeProfile(traits = {}) {
  const {
    gameplayStyle = "turn-based",
    primaryInterface = "text",
    usesCanvas = false,
    realtime = false,
    multiplayer = false,
  } = traits;

  if (realtime || usesCanvas || multiplayer || gameplayStyle === "real-time") {
    return RUNTIME_PROFILES.realtimeSessionGame;
  }

  if (gameplayStyle === "turn-based" && primaryInterface === "text") {
    return RUNTIME_PROFILES.browserNarrativeStrategy;
  }

  return RUNTIME_PROFILES.browserNarrativeStrategy;
}