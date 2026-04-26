import { useSyncExternalStore } from "react";
import { getState, subscribeState } from "@legacy/state.js";

export function useLegacyState() {
  return useSyncExternalStore(subscribeState, getState, getState);
}