import { router } from "@legacy/router.js";

export function registerPolicyView() {
  router.registerView(router.VIEW_IDS.POLICY, null, { renderMode: "react" });
}

registerPolicyView();
