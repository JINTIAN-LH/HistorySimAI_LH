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

function validateExternalThreats(value, errors, fieldName) {
  if (value == null) return;
  if (!Array.isArray(value)) {
    errors.push(`${fieldName} 必须是数组`);
    return;
  }
  value.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors.push(`${fieldName}[${index}] 必须是对象`);
      return;
    }
    const hasName = typeof item.name === "string" && item.name.trim();
    const hasId = typeof item.id === "string" && item.id.trim();
    if (!hasName && !hasId) {
      errors.push(`${fieldName}[${index}] 需提供 name 或 id`);
    }
    if (Object.prototype.hasOwnProperty.call(item, "power") && typeof item.power !== "number") {
      errors.push(`${fieldName}[${index}].power 必须是数字`);
    }
  });
}

function validateProvinces(value, errors, fieldName) {
  if (value == null) return;
  if (!Array.isArray(value)) {
    errors.push(`${fieldName} 必须是数组`);
    return;
  }
  value.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      errors.push(`${fieldName}[${index}] 必须是对象`);
      return;
    }
    if (typeof item.name !== "string" || !item.name.trim()) {
      errors.push(`${fieldName}[${index}].name 缺失或不是字符串`);
    }
    ["taxSilver", "taxGrain", "recruits", "morale", "corruption", "disaster"].forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(item, key) && typeof item[key] !== "number") {
        errors.push(`${fieldName}[${index}].${key} 必须是数字`);
      }
    });
  });
}

function validateObject(value, errors, fieldName) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${fieldName} 必须是对象`);
    return null;
  }
  return value;
}

function validateOptionalString(obj, key, errors, fieldName) {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return;
  if (typeof obj[key] !== "string") {
    errors.push(`${fieldName}.${key} 必须是字符串`);
  }
}

function validateOptionalStringArray(obj, key, errors, fieldName) {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return;
  if (!Array.isArray(obj[key])) {
    errors.push(`${fieldName}.${key} 必须是字符串数组`);
    return;
  }
  obj[key].forEach((item, index) => {
    if (typeof item !== "string") {
      errors.push(`${fieldName}.${key}[${index}] 必须是字符串`);
    }
  });
}

function validateOpeningChoices(obj, errors, fieldName) {
  if (!Object.prototype.hasOwnProperty.call(obj, "openingChoices")) return;
  if (!Array.isArray(obj.openingChoices)) {
    errors.push(`${fieldName}.openingChoices 必须是数组`);
    return;
  }
  obj.openingChoices.forEach((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`${fieldName}.openingChoices[${index}] 必须是对象`);
      return;
    }
    ["id", "label", "summary"].forEach((key) => validateOptionalString(item, key, errors, `${fieldName}.openingChoices[${index}]`));
  });
}

function validateOptionalRecord(obj, key, errors, fieldName) {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) return;
  const value = obj[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    errors.push(`${fieldName}.${key} 必须是对象`);
    return;
  }
  Object.entries(value).forEach(([recordKey, recordValue]) => {
    if (typeof recordValue !== "string") {
      errors.push(`${fieldName}.${key}.${recordKey} 必须是字符串`);
    }
  });
}

function validateWorldviewCopyGroups(wv, errors, warnings) {
  const startPageCopy = validateObject(wv.startPageCopy, errors, "worldview.startPageCopy");
  if (startPageCopy) {
    ["heroTitle", "heroSubtitle", "startButtonLabel", "continueButtonLabel"]
      .forEach((key) => validateOptionalString(startPageCopy, key, errors, "worldview.startPageCopy"));
    validateOptionalStringArray(startPageCopy, "introLines", errors, "worldview.startPageCopy");
    if (!startPageCopy.heroTitle) {
      warnings.push("worldview.startPageCopy.heroTitle 缺失，将使用默认标题");
    }
    if (!Array.isArray(startPageCopy.introLines) || startPageCopy.introLines.length === 0) {
      warnings.push("worldview.startPageCopy.introLines 缺失，启动页将沿用 data/intro.json");
    }
  }

  const openingTurn = validateObject(wv.openingTurn, errors, "worldview.openingTurn");
  if (openingTurn) {
    validateOptionalString(openingTurn, "briefingTitle", errors, "worldview.openingTurn");
    validateOptionalStringArray(openingTurn, "briefingLines", errors, "worldview.openingTurn");
    validateOpeningChoices(openingTurn, errors, "worldview.openingTurn");
    if (!Array.isArray(openingTurn.briefingLines) || openingTurn.briefingLines.length === 0) {
      warnings.push("worldview.openingTurn.briefingLines 缺失，首回合将沿用模板文案");
    }
  }

  const chronicleFormat = validateObject(wv.chronicleFormat, errors, "worldview.chronicleFormat");
  if (chronicleFormat) {
    ["eraLabel", "yearUnit", "monthUnit", "displayPattern", "fallbackPattern"]
      .forEach((key) => validateOptionalString(chronicleFormat, key, errors, "worldview.chronicleFormat"));
    if (!chronicleFormat.displayPattern) {
      warnings.push("worldview.chronicleFormat.displayPattern 缺失，将使用默认编年格式");
    }
  }

  const courtViewCopy = validateObject(wv.courtViewCopy, errors, "worldview.courtViewCopy");
  if (courtViewCopy) {
    ["headerTitle", "headerSubtitle", "quickActionLabel", "emptyStateText"]
      .forEach((key) => validateOptionalString(courtViewCopy, key, errors, "worldview.courtViewCopy"));
    if (!courtViewCopy.headerTitle) {
      warnings.push("worldview.courtViewCopy.headerTitle 缺失，将使用默认朝堂标题");
    }
  }

  const policyTreeCopy = validateObject(wv.policyTreeCopy, errors, "worldview.policyTreeCopy");
  if (policyTreeCopy) {
    ["treeTitle", "treeSubtitle"].forEach((key) => validateOptionalString(policyTreeCopy, key, errors, "worldview.policyTreeCopy"));
    validateOptionalRecord(policyTreeCopy, "branchLabels", errors, "worldview.policyTreeCopy");
    if (!policyTreeCopy.treeTitle) {
      warnings.push("worldview.policyTreeCopy.treeTitle 缺失，将使用默认国策树标题");
    }
  }

  const rulerAbilityCopy = validateObject(wv.rulerAbilityCopy, errors, "worldview.rulerAbilityCopy");
  if (rulerAbilityCopy) {
    ["panelTitle", "abilityHint"].forEach((key) => validateOptionalString(rulerAbilityCopy, key, errors, "worldview.rulerAbilityCopy"));
    validateOptionalRecord(rulerAbilityCopy, "abilityLabels", errors, "worldview.rulerAbilityCopy");
    if (!rulerAbilityCopy.panelTitle) {
      warnings.push("worldview.rulerAbilityCopy.panelTitle 缺失，将使用默认能力面板标题");
    }
  }

  const worldEventCopy = validateObject(wv.worldEventCopy, errors, "worldview.worldEventCopy");
  if (worldEventCopy) {
    ["sectionTitle", "emptyStateText"].forEach((key) => validateOptionalString(worldEventCopy, key, errors, "worldview.worldEventCopy"));
    validateOptionalRecord(worldEventCopy, "severityLabels", errors, "worldview.worldEventCopy");
    if (!worldEventCopy.sectionTitle) {
      warnings.push("worldview.worldEventCopy.sectionTitle 缺失，将使用默认天下大事标题");
    }
  }

  const publicOpinionCopy = validateObject(wv.publicOpinionCopy, errors, "worldview.publicOpinionCopy");
  if (publicOpinionCopy) {
    ["sectionTitle", "positiveLabel", "neutralLabel", "negativeLabel", "emptyStateText"]
      .forEach((key) => validateOptionalString(publicOpinionCopy, key, errors, "worldview.publicOpinionCopy"));
    if (!publicOpinionCopy.sectionTitle) {
      warnings.push("worldview.publicOpinionCopy.sectionTitle 缺失，将使用默认民间舆论标题");
    }
  }

  const uiSurfaceCopy = validateObject(wv.uiSurfaceCopy, errors, "worldview.uiSurfaceCopy");
  if (uiSurfaceCopy) {
    const policy = validateObject(uiSurfaceCopy.policy, errors, "worldview.uiSurfaceCopy.policy");
    if (policy) {
      [
        "inputPlaceholder",
        "followupPlaceholder",
        "emptyQuestionError",
        "emptyEdictError",
        "askFailedError",
        "followupFailedError",
        "issueFailedError",
        "issueSuccess",
        "closeSessionLabel",
        "summaryPrefix",
        "adoptAdviceLabel",
        "followupLabel",
        "followupButtonLabel",
        "followupBusyLabel",
        "historyTitle",
      ].forEach((key) => validateOptionalString(policy, key, errors, "worldview.uiSurfaceCopy.policy"));
    }

    const edict = validateObject(uiSurfaceCopy.edict, errors, "worldview.uiSurfaceCopy.edict");
    if (edict) {
      [
        "pageTitle",
        "pageSubtitle",
        "actionsTitle",
        "actionsHint",
        "dataTitle",
        "dataHint",
        "mainTitle",
        "mainHint",
      ].forEach((key) => validateOptionalString(edict, key, errors, "worldview.uiSurfaceCopy.edict"));
    }

    const court = validateObject(uiSurfaceCopy.court, errors, "worldview.uiSurfaceCopy.court");
    if (court) {
      [
        "kejuPanelTitle",
        "kejuPanelSubtitle",
        "wujuPanelTitle",
        "wujuPanelSubtitle",
        "talentPanelTitle",
        "talentPanelSubtitle",
        "policyPanelTitle",
        "policyPanelSubtitle",
        "appointByPositionSubtitle",
        "appointByMinisterSubtitle",
        "appointLegacySubtitle",
        "positionSelectSubtitle",
        "ministerDetailSubtitle",
        "factionPanelSubtitle",
        "ministerPanelSubtitle",
        "unknownError",
        "appointFailedPrefix",
        "adjustFailedPrefix",
        "kejuStartSuccess",
        "kejuHuishiSuccess",
        "kejuDianshiSuccess",
        "kejuPublishSuccess",
        "kejuReserveSavedSuccess",
        "kejuEntryAppliedSuccess",
        "officeAppointmentAppliedSuccess",
        "positionOccupiedRegenerateError",
        "positionOccupiedRegenerateSimpleError",
        "candidateDeadCannotAppointError",
        "candidateDeadCannotAdjustError",
        "candidateDeadCannotGrantError",
        "ministerDeadCannotDiscussError",
      ]
        .forEach((key) => validateOptionalString(court, key, errors, "worldview.uiSurfaceCopy.court"));
    }
  }
}

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
    validateWorldviewCopyGroups(wv, errors, warnings);
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

    const nationInit = ov.nationInit && typeof ov.nationInit === "object" ? ov.nationInit : null;
    const hasExternalThreats = Object.prototype.hasOwnProperty.call(nationInit || {}, "externalThreats")
      || Object.prototype.hasOwnProperty.call(ov, "externalThreats");
    const hasProvinceProfiles = Object.prototype.hasOwnProperty.call(nationInit || {}, "provinces")
      || Object.prototype.hasOwnProperty.call(ov, "provinces");

    validateExternalThreats(nationInit?.externalThreats, errors, "overrides.nationInit.externalThreats");
    validateExternalThreats(ov.externalThreats, errors, "overrides.externalThreats");
    validateProvinces(nationInit?.provinces, errors, "overrides.nationInit.provinces");
    validateProvinces(ov.provinces, errors, "overrides.provinces");

    if (!hasExternalThreats) {
      warnings.push("未提供 externalThreats 覆盖，敌对势力将沿用默认世界观");
    }
    if (!hasProvinceProfiles) {
      warnings.push("未提供 provinces 覆盖，各省态势文案将沿用默认世界观");
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 从导入的两个 JSON 对象构建标准世界观包。
 */
export function buildWorldviewPackage(worldviewJson, overridesJson) {
  const title = worldviewJson?.title || worldviewJson?.id || "自定义世界观";
  const id = worldviewJson?.id || `custom_${Date.now()}`;
  return {
    worldview: worldviewJson,
    overrides: overridesJson,
    meta: {
      id,
      title,
      importedAt: new Date().toISOString(),
    },
  };
}

const WORLDVIEW_SECTION_MARKER = "=== worldview.json ===";
const OVERRIDES_SECTION_MARKER = "=== worldviewOverrides.json ===";

/**
 * 解析单文件导入包文本（worldview.import.bundle.txt）。
 * 文件必须包含两个分段：
 * 1) === worldview.json ===
 * 2) === worldviewOverrides.json ===
 */
export function parseWorldviewBundleText(bundleText) {
  if (typeof bundleText !== "string" || bundleText.trim() === "") {
    throw new Error("导入包内容为空");
  }

  const worldviewMarkerIndex = bundleText.indexOf(WORLDVIEW_SECTION_MARKER);
  const overridesMarkerIndex = bundleText.indexOf(OVERRIDES_SECTION_MARKER);

  if (worldviewMarkerIndex < 0 || overridesMarkerIndex < 0) {
    throw new Error("导入包格式错误：缺少 worldview.json 或 worldviewOverrides.json 分段");
  }

  if (overridesMarkerIndex <= worldviewMarkerIndex) {
    throw new Error("导入包格式错误：分段顺序不正确");
  }

  const worldviewJsonText = bundleText
    .slice(worldviewMarkerIndex + WORLDVIEW_SECTION_MARKER.length, overridesMarkerIndex)
    .trim();
  const overridesJsonText = bundleText
    .slice(overridesMarkerIndex + OVERRIDES_SECTION_MARKER.length)
    .trim();

  if (!worldviewJsonText || !overridesJsonText) {
    throw new Error("导入包格式错误：worldview.json 或 worldviewOverrides.json 内容为空");
  }

  let worldviewJson;
  let overridesJson;

  try {
    worldviewJson = JSON.parse(worldviewJsonText);
  } catch {
    throw new Error("导入包中的 worldview.json 不是有效 JSON");
  }

  try {
    overridesJson = JSON.parse(overridesJsonText);
  } catch {
    throw new Error("导入包中的 worldviewOverrides.json 不是有效 JSON");
  }

  return buildWorldviewPackage(worldviewJson, overridesJson);
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
