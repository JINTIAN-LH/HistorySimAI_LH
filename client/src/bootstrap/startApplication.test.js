import { beforeEach, describe, expect, it, vi } from "vitest";

const mountLegacyGameApp = vi.fn().mockResolvedValue(undefined);

vi.mock("@legacy/main.js", () => ({
  mountLegacyGameApp,
}));

import { startApplication } from "./startApplication.js";

describe("startApplication", () => {
  beforeEach(() => {
    mountLegacyGameApp.mockClear();
    document.documentElement.removeAttribute("data-runtime-profile");
    document.body.innerHTML = '<div id="react-root"><div id="app"><header id="topbar"></header><main id="main-view"></main><nav id="bottombar"></nav></div></div>';
    delete window.__HISTORY_SIM_RUNTIME_PROFILE__;
    delete window.__HISTORY_SIM_MANUAL_BOOTSTRAP__;
  });

  it("bootstraps against the existing React shell", async () => {
    const mountNode = document.getElementById("react-root");

    const profile = await startApplication({ mountNode });

    expect(profile.id).toBe("browser-narrative-strategy");
    expect(document.documentElement.dataset.runtimeProfile).toBe("browser-narrative-strategy");
    expect(window.__HISTORY_SIM_RUNTIME_PROFILE__).toEqual(profile);
    expect(window.__HISTORY_SIM_MANUAL_BOOTSTRAP__).toBe(true);
    expect(document.getElementById("app")).toBeTruthy();
    expect(mountLegacyGameApp).toHaveBeenCalledTimes(1);
  });
});