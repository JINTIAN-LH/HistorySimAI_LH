import { getCurrentProjectTraits, selectRuntimeProfile } from "@client/architecture/selectRuntimeProfile.js";

export async function startApplication({ mountNode } = {}) {
  const runtimeProfile = selectRuntimeProfile(getCurrentProjectTraits());
  const appShell = document.getElementById("app") || mountNode?.querySelector?.("#app") || null;

  if (!(appShell instanceof HTMLElement)) {
    throw new Error("React shell must be mounted before application bootstrap.");
  }

  document.documentElement.dataset.runtimeProfile = runtimeProfile.id;
  window.__HISTORY_SIM_RUNTIME_PROFILE__ = runtimeProfile;
  window.__HISTORY_SIM_MANUAL_BOOTSTRAP__ = true;

  const { mountLegacyGameApp } = await import("@legacy/main.js");
  await mountLegacyGameApp();

  return runtimeProfile;
}