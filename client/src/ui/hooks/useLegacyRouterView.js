import { useSyncExternalStore } from "react";
import { router } from "@legacy/router.js";

function getCurrentViewSnapshot() {
  return router.getCurrentView();
}

export function useLegacyRouterView() {
  return useSyncExternalStore(router.subscribeView, getCurrentViewSnapshot, getCurrentViewSnapshot);
}