import { router } from "@legacy/router.js";

export function registerSettingsView() {
  router.registerView(router.VIEW_IDS.SETTINGS, null, { renderMode: "react" });
}

registerSettingsView();