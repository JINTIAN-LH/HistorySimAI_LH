import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPersistentLocalItem,
  hydratePersistentLocalStorage,
  setPersistentLocalItem,
} from "./persistentBrowserStorage.js";

function createFakeIndexedDb() {
  const stores = new Map();

  function ensureStore(name) {
    if (!stores.has(name)) stores.set(name, new Map());
    return stores.get(name);
  }

  return {
    open(_dbName, _version) {
      const request = {};
      const db = {
        objectStoreNames: {
          contains(name) {
            return stores.has(name);
          },
        },
        createObjectStore(name) {
          ensureStore(name);
          return {};
        },
        close() {},
        transaction(name) {
          const tx = {
            error: null,
            objectStore() {
              const store = ensureStore(name);
              return {
                put(record) {
                  store.set(record.key, record.value);
                  setTimeout(() => {
                    if (tx.oncomplete) tx.oncomplete();
                  }, 0);
                },
                delete(key) {
                  store.delete(key);
                  setTimeout(() => {
                    if (tx.oncomplete) tx.oncomplete();
                  }, 0);
                },
                getAll() {
                  const getRequest = {};
                  setTimeout(() => {
                    getRequest.result = Array.from(store.entries()).map(([key, value]) => ({ key, value }));
                    if (getRequest.onsuccess) getRequest.onsuccess();
                    setTimeout(() => {
                      if (tx.oncomplete) tx.oncomplete();
                    }, 0);
                  }, 0);
                  return getRequest;
                },
              };
            },
          };
          return tx;
        },
      };

      setTimeout(() => {
        request.result = db;
        if (request.onupgradeneeded) request.onupgradeneeded();
        if (request.onsuccess) request.onsuccess();
      }, 0);

      return request;
    },
  };
}

describe("persistentBrowserStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("indexedDB", createFakeIndexedDb());
  });

  it("restores mirrored keys back into localStorage during hydration", async () => {
    setPersistentLocalItem("history_sim_player_llm_config_v1", JSON.stringify({ llmApiKey: "abc123" }));
    setPersistentLocalItem("chongzhen_sim_save_v2_classic_manual_01", JSON.stringify({ slotId: "manual_01" }));

    await new Promise((resolve) => setTimeout(resolve, 10));

    window.localStorage.removeItem("history_sim_player_llm_config_v1");
    window.localStorage.removeItem("chongzhen_sim_save_v2_classic_manual_01");
    await hydratePersistentLocalStorage();

    expect(JSON.parse(getPersistentLocalItem("history_sim_player_llm_config_v1"))).toEqual({ llmApiKey: "abc123" });
    expect(JSON.parse(getPersistentLocalItem("chongzhen_sim_save_v2_classic_manual_01"))).toEqual({ slotId: "manual_01" });
  });
});