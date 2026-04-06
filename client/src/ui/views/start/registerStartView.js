import { router } from "@legacy/router.js";

export function registerStartView() {
  router.registerView(router.VIEW_IDS.START, null, { renderMode: "react" });
}

registerStartView();