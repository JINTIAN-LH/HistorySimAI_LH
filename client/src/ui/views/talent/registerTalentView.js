import { router } from "@legacy/router.js";

export function registerTalentView() {
  router.registerView(router.VIEW_IDS.TALENT, null, { renderMode: "react" });
}

registerTalentView();
