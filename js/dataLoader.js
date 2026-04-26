import { adaptWorldviewData } from "./worldview/worldviewAdapter.js";

const cache = new Map();
let activeWorldviewOverrides = null;

/**
 * 设置运行时世界观覆盖数据。传入自定义 overrides 后，
 * 后续所有 loadJSON 调用将使用该覆盖替代默认的 worldviewOverrides。
 * 传 null 恢复默认。
 */
export function setActiveWorldviewOverrides(overrides) {
  activeWorldviewOverrides = overrides && typeof overrides === "object" ? overrides : null;
}

/** 清空已缓存的数据，使下次 loadJSON 重新拉取并重新适配。 */
export function clearDataCache() {
  cache.clear();
}

export async function loadJSON(path) {
  if (cache.has(path)) {
    return cache.get(path);
  }
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) {
    throw new Error(`加载 JSON 失败: ${path} (${res.status})`);
  }
  const args = activeWorldviewOverrides
    ? [path, await res.json(), activeWorldviewOverrides]
    : [path, await res.json()];
  const data = adaptWorldviewData(...args);
  cache.set(path, data);
  return data;
}
