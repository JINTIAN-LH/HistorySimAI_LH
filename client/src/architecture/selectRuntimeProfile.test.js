import { describe, expect, it } from "vitest";
import { getCurrentProjectTraits, selectRuntimeProfile } from "./selectRuntimeProfile.js";

describe("selectRuntimeProfile", () => {
  it("selects the browser narrative strategy profile for the current project", () => {
    const profile = selectRuntimeProfile(getCurrentProjectTraits());

    expect(profile.id).toBe("browser-narrative-strategy");
    expect(profile.renderLayer).toBe("narrative-dom-rendering");
    expect(profile.dataLayer).toBe("fetch-localstorage-express");
  });

  it("keeps realtime canvas games on the realtime session profile", () => {
    const profile = selectRuntimeProfile({
      gameplayStyle: "real-time",
      primaryInterface: "canvas",
      usesCanvas: true,
      realtime: true,
      multiplayer: true,
    });

    expect(profile.id).toBe("realtime-session-game");
    expect(profile.renderLayer).toBe("canvas-webgl-engine");
  });
});