const PERSISTENT_DB_NAME = "history_sim_browser_storage_v1";
const PERSISTENT_STORE_NAME = "kv";

const PERSISTENT_EXACT_KEYS = new Set([
  "chongzhen_sim_gameplay_mode_v1",
  "history_sim_player_llm_config_v1",
  "history_sim_onboarding_seen_v1",
  "czsim_auto_idx",
  "czsim_custom_worldview_v1",
]);

const PERSISTENT_KEY_PREFIXES = [
  "chongzhen_sim_save_v2_",
  "chongzhen_sim_active_slot_v1_",
];

function canUseLocalStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function canUseIndexedDb() {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

export function shouldPersistBrowserKey(key) {
  if (typeof key !== "string" || !key) return false;
  if (PERSISTENT_EXACT_KEYS.has(key)) return true;
  return PERSISTENT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

function openPersistentDb() {
  if (!canUseIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    try {
      const request = window.indexedDB.open(PERSISTENT_DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PERSISTENT_STORE_NAME)) {
          db.createObjectStore(PERSISTENT_STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("indexedDB open failed"));
    } catch (error) {
      reject(error);
    }
  });
}

function withObjectStore(mode, run) {
  return openPersistentDb().then((db) => {
    if (!db) return null;
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction(PERSISTENT_STORE_NAME, mode);
        const store = transaction.objectStore(PERSISTENT_STORE_NAME);
        const result = run(store, transaction);
        transaction.oncomplete = () => {
          db.close();
          resolve(result ?? null);
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error || new Error(`indexedDB ${mode} transaction failed`));
        };
      } catch (error) {
        db.close();
        reject(error);
      }
    });
  });
}

function upsertPersistentEntry(key, value) {
  if (!shouldPersistBrowserKey(key) || !canUseIndexedDb()) return Promise.resolve();
  return withObjectStore("readwrite", (store) => {
    store.put({ key, value });
  }).catch((error) => {
    console.warn("[persistent-storage] failed to mirror key", key, error);
  });
}

function deletePersistentEntry(key) {
  if (!shouldPersistBrowserKey(key) || !canUseIndexedDb()) return Promise.resolve();
  return withObjectStore("readwrite", (store) => {
    store.delete(key);
  }).catch((error) => {
    console.warn("[persistent-storage] failed to delete mirrored key", key, error);
  });
}

function readAllPersistentEntries() {
  if (!canUseIndexedDb()) return Promise.resolve([]);
  return withObjectStore("readonly", (store) => new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
    request.onerror = () => reject(request.error || new Error("indexedDB getAll failed"));
  })).then((result) => result || []).catch((error) => {
    console.warn("[persistent-storage] failed to read mirrored entries", error);
    return [];
  });
}

export function getPersistentLocalItem(key) {
  if (!canUseLocalStorage()) return null;
  return window.localStorage.getItem(key);
}

export function setPersistentLocalItem(key, value) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(key, value);
  void upsertPersistentEntry(key, value);
}

export function removePersistentLocalItem(key) {
  if (!canUseLocalStorage()) return;
  window.localStorage.removeItem(key);
  void deletePersistentEntry(key);
}

export async function hydratePersistentLocalStorage() {
  if (!canUseLocalStorage()) return;

  const localStorageKeys = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (typeof key === "string") localStorageKeys.push(key);
  }

  const mirroredEntries = await readAllPersistentEntries();
  const mirroredMap = new Map(
    mirroredEntries
      .filter((entry) => shouldPersistBrowserKey(entry?.key))
      .map((entry) => [entry.key, typeof entry.value === "string" ? entry.value : String(entry.value ?? "")])
  );

  mirroredMap.forEach((value, key) => {
    if (window.localStorage.getItem(key) == null) {
      window.localStorage.setItem(key, value);
    }
  });

  await Promise.all(
    localStorageKeys
      .filter((key) => shouldPersistBrowserKey(key))
      .map((key) => {
        const localValue = window.localStorage.getItem(key);
        if (localValue == null) return Promise.resolve();
        if (mirroredMap.get(key) === localValue) return Promise.resolve();
        return upsertPersistentEntry(key, localValue);
      })
  );
}