/**
 * 自定义世界观持久存储层
 *
 * 玩家通过设置界面导入的世界观包（worldview.json + worldviewOverrides.json）
 * 保存在浏览器 localStorage / IndexedDB，bootstrap 时读取并注入到运行时。
 *
 * 存储键：czsim_custom_worldview_v1
 * 包结构：{ worldview: {...}, overrides: {...}, meta: { importedAt, title, id } }
 */

import {
  getPersistentLocalItem,
  setPersistentLocalItem,
  removePersistentLocalItem,
} from "../persistentBrowserStorage.js";

const STORAGE_KEY = "czsim_custom_worldview_v1";

// ─── 校验 ────────────────────────────────────────────────────────────────

const MIN_CHARACTERS = 5;
const MIN_FACTIONS = 2;

/**
 * 校验世界观包的结构完整性。
 * 返回 { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateWorldviewPackage(pkg) {
  const errors = [];
  const warnings = [];

  if (!pkg || typeof pkg !== "object") {
    return { valid: false, errors: ["包内容为空或不是对象"], warnings };
  }

  // ── worldview 校验 ──
  const wv = pkg.worldview;
  if (!wv || typeof wv !== "object") {
    errors.push("缺少 worldview 字段（worldview.json 内容）");
  } else {
    if (!wv.id || typeof wv.id !== "string") {
      errors.push("worldview.id 缺失或不是字符串");
    }
    if (!wv.title || typeof wv.title !== "string") {
      errors.push("worldview.title 缺失或不是字符串");
    }
    if (!wv.playerRole || typeof wv.playerRole !== "object") {
      warnings.push("worldview.playerRole 缺失，将使用默认值");
    }
    if (!wv.storyPrompt || typeof wv.storyPrompt !== "object") {
      warnings.push("worldview.storyPrompt 缺失，LLM 将使用默认提示词");
    }
  }

  // ── overrides 校验 ──
  const ov = pkg.overrides;
  if (!ov || typeof ov !== "object") {
    errors.push("缺少 overrides 字段（worldviewOverrides.json 内容）");
  } else {
    // 角色数量
    const allowedIds = Array.isArray(ov.allowedCharacterIds) ? ov.allowedCharacterIds : [];
    const charMap = ov.characters && typeof ov.characters === "object" ? ov.characters : {};
    const charCount = Math.max(allowedIds.length, Object.keys(charMap).length);
    if (charCount < MIN_CHARACTERS) {
      warnings.push(`角色数量不足（${charCount}），建议至少 ${MIN_CHARACTERS} 个以支撑完整玩法`);
    }

    // 派系数量
    const factionMap = ov.factions && typeof ov.factions === "object" ? ov.factions : {};
    const factionCount = Object.keys(factionMap).length;
    if (factionCount < MIN_FACTIONS) {
      warnings.push(`派系数量不足（${factionCount}），建议至少 ${MIN_FACTIONS} 个以支撑朝局分歧`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 从导入数据构建标准世界观包。
 */
export function buildWorldviewPackage(worldviewJson, overridesJson, metaOverrides = {}) {
  const title = worldviewJson?.title || worldviewJson?.id || "自定义世界观";
  const id = worldviewJson?.id || `custom_${Date.now()}`;
  return {
    worldview: worldviewJson,
    overrides: overridesJson,
    meta: {
      id,
      title,
      importedAt: new Date().toISOString(),
      ...(metaOverrides && typeof metaOverrides === "object" ? metaOverrides : {}),
    },
  };
}

// ─── 存储 CRUD ───────────────────────────────────────────────────────────

export function saveCustomWorldview(pkg) {
  const json = JSON.stringify(pkg);
  setPersistentLocalItem(STORAGE_KEY, json);
}

export function loadCustomWorldview() {
  const raw = getPersistentLocalItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.worldview && parsed.overrides) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearCustomWorldview() {
  removePersistentLocalItem(STORAGE_KEY);
}

export function hasCustomWorldview() {
  return getPersistentLocalItem(STORAGE_KEY) != null;
}

/**
 * 生成简要的世界观预览信息，用于 UI 展示。
 */
export function buildWorldviewPreview(pkg) {
  if (!pkg || typeof pkg !== "object") return null;
  const wv = pkg.worldview || {};
  const ov = pkg.overrides || {};
  const allowedIds = Array.isArray(ov.allowedCharacterIds) ? ov.allowedCharacterIds : [];
  const charMap = ov.characters && typeof ov.characters === "object" ? ov.characters : {};
  const factionMap = ov.factions && typeof ov.factions === "object" ? ov.factions : {};

  return {
    id: wv.id || pkg.meta?.id || "",
    title: wv.title || pkg.meta?.title || "未命名",
    gameTitle: wv.gameTitle || "",
    playerRole: wv.playerRole
      ? `${wv.playerRole.name || ""}${wv.playerRole.title ? `（${wv.playerRole.title}）` : ""}`
      : "",
    characterCount: Math.max(allowedIds.length, Object.keys(charMap).length),
    factionNames: Object.values(factionMap)
      .map((f) => f?.name || "")
      .filter(Boolean),
    hasStoryPrompt: !!(wv.storyPrompt && typeof wv.storyPrompt === "object"),
    importedAt: pkg.meta?.importedAt || "",
  };
}
