import { useRef, useSyncExternalStore } from "react";
import { selectState, subscribeStateSelector } from "@legacy/state.js";

export function shallowEqual(left, right) {
  if (Object.is(left, right)) {
    return true;
  }

  if (!left || !right || typeof left !== "object" || typeof right !== "object") {
    return false;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => Object.is(value, right[index]));
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && Object.is(left[key], right[key]));
}

export function useLegacySelector(selector, isEqual = Object.is) {
  const cacheRef = useRef();

  const getSnapshot = () => {
    const nextSelected = selectState(selector);
    const cache = cacheRef.current;

    if (cache && isEqual(cache.value, nextSelected)) {
      return cache.value;
    }

    cacheRef.current = { value: nextSelected };
    return nextSelected;
  };

  return useSyncExternalStore(
    (onStoreChange) => subscribeStateSelector(selector, onStoreChange, isEqual),
    getSnapshot,
    getSnapshot
  );
}