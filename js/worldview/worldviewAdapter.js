import defaultWorldviewOverrides from "../../public/data/worldviewOverrides.json";

function cloneRecord(value) {
  return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
}

function mapById(list) {
  return Object.fromEntries(
    (Array.isArray(list) ? list : [])
      .filter((item) => item && typeof item.id === "string")
      .map((item) => [item.id, item])
  );
}

function resolveWorldviewOverrides(worldviewOverrides) {
  return worldviewOverrides && typeof worldviewOverrides === "object"
    ? worldviewOverrides
    : defaultWorldviewOverrides;
}

export { defaultWorldviewOverrides };

export function adaptCharactersData(data, worldviewOverrides = defaultWorldviewOverrides) {
  const resolvedOverrides = resolveWorldviewOverrides(worldviewOverrides);
  const source = Array.isArray(data?.characters || data?.ministers) ? (data.characters || data.ministers) : [];
  const byId = mapById(source);
  const allowedCharacterIds = Array.isArray(resolvedOverrides.allowedCharacterIds) ? resolvedOverrides.allowedCharacterIds : [];
  const characters = allowedCharacterIds
    .map((id) => {
      const override = resolvedOverrides.characters?.[id];
      if (!override) return null;
      return {
        ...(cloneRecord(byId[id]) || { id }),
        ...cloneRecord(override),
        id,
      };
    })
    .filter(Boolean);

  return {
    ...(data || {}),
    schemaVersion: data?.schemaVersion || 2,
    characters,
  };
}

export function adaptFactionsData(data, worldviewOverrides = defaultWorldviewOverrides) {
  const resolvedOverrides = resolveWorldviewOverrides(worldviewOverrides);
  const source = Array.isArray(data?.factions) ? data.factions : [];
  const byId = mapById(source);
  const factions = Object.entries(resolvedOverrides.factions || {}).map(([id, override]) => ({
    ...(cloneRecord(byId[id]) || { id }),
    ...cloneRecord(override),
    id,
  }));

  return {
    ...(data || {}),
    factions,
  };
}

export function adaptCourtChatsData(data, worldviewOverrides = defaultWorldviewOverrides) {
  const resolvedOverrides = resolveWorldviewOverrides(worldviewOverrides);
  return cloneRecord(resolvedOverrides.courtChats) || data || {};
}

function applyOverrideList(list, overrides) {
  return (Array.isArray(list) ? list : []).map((item) => {
    if (!item || typeof item.id !== "string") return item;
    const override = overrides?.[item.id];
    if (!override) return item;
    return {
      ...item,
      ...cloneRecord(override),
      id: item.id,
    };
  });
}

export function adaptPositionsData(data, worldviewOverrides = defaultWorldviewOverrides) {
  const resolvedOverrides = resolveWorldviewOverrides(worldviewOverrides);
  return {
    ...(data || {}),
    modules: applyOverrideList(data?.modules, resolvedOverrides.modules || {}),
    departments: applyOverrideList(data?.departments, resolvedOverrides.departments || {}),
    positions: applyOverrideList(data?.positions, resolvedOverrides.positions || {}),
  };
}

export function adaptPolicyCatalogData(data, worldviewOverrides = defaultWorldviewOverrides) {
  const resolvedOverrides = resolveWorldviewOverrides(worldviewOverrides);
  return applyOverrideList(data, resolvedOverrides.policies || {});
}

export function adaptNationInitData(data, worldviewOverrides = defaultWorldviewOverrides) {
  const resolvedOverrides = resolveWorldviewOverrides(worldviewOverrides);
  const nationInitOverride = resolvedOverrides.nationInit && typeof resolvedOverrides.nationInit === "object"
    ? resolvedOverrides.nationInit
    : {};

  const provinces = Array.isArray(nationInitOverride.provinces)
    ? cloneRecord(nationInitOverride.provinces)
    : (Array.isArray(resolvedOverrides.provinces) ? cloneRecord(resolvedOverrides.provinces) : undefined);

  const externalThreats = Array.isArray(nationInitOverride.externalThreats)
    ? cloneRecord(nationInitOverride.externalThreats)
    : (Array.isArray(resolvedOverrides.externalThreats) ? cloneRecord(resolvedOverrides.externalThreats) : undefined);

  return {
    ...(data || {}),
    ...cloneRecord(nationInitOverride),
    ...(provinces ? { provinces } : {}),
    ...(externalThreats ? { externalThreats } : {}),
  };
}

export function adaptProvinceRulesData(data, worldviewOverrides = defaultWorldviewOverrides) {
  const resolvedOverrides = resolveWorldviewOverrides(worldviewOverrides);
  const override = resolvedOverrides.provinceRules;
  if (!override || typeof override !== "object") return data;
  const regionRules = Array.isArray(override.regionRules) ? cloneRecord(override.regionRules) : undefined;
  return {
    ...(data || {}),
    ...cloneRecord(override),
    ...(regionRules ? { regionRules } : {}),
  };
}

// ─── 派系名映射（用于 AI 生成人才的 faction/factionLabel 修正）────────────────

// Ming-era labels → faction id lookup (hardcoded because the overrides JSON only
// stores id→name, not the reverse legacy labels).
const LEGACY_FACTION_LABEL_TO_ID = {
  "东林党": "donglin",
  "帝党": "imperial",
  "阉党": "eunuch",
  "阉党余部": "eunuch",
  "中立": "neutral",
  "中立派": "neutral",
  "军事将领": "military",
  "清议士人": "donglin",
  "主战清议": "donglin",
  "务实经世": "neutral",
  "行在近臣": "imperial",
  "江防宿将": "military",
  "和议近习": "eunuch",
};

/**
 * 将 LLM 生成的原始 faction 字符串映射为当前世界观的派系名。
 * 支持 faction id（如 "donglin"）和中文标签（如 "东林党"）两种输入。
 * 找不到映射时返回原值。
 */
export function mapFactionLabel(rawFaction, worldviewOverrides = defaultWorldviewOverrides) {
  if (!rawFaction || typeof rawFaction !== "string") return rawFaction || "";
  const trimmed = rawFaction.trim();
  if (!trimmed) return "";

  const resolvedOverrides = resolveWorldviewOverrides(worldviewOverrides);
  const factionOverrides = resolvedOverrides?.factions || {};

  // Direct id match (e.g. "donglin" → overrides.factions.donglin.name)
  if (factionOverrides[trimmed]?.name) {
    return factionOverrides[trimmed].name;
  }

  // Label → id → override name
  const resolvedId = LEGACY_FACTION_LABEL_TO_ID[trimmed];
  if (resolvedId && factionOverrides[resolvedId]?.name) {
    return factionOverrides[resolvedId].name;
  }

  return trimmed;
}

/**
 * 将 LLM 生成的原始 faction 字符串解析为标准 faction id。
 * 支持中文标签和 id 两种输入。找不到时返回 "neutral"。
 */
export function resolveFactionId(rawFaction, worldviewOverrides = defaultWorldviewOverrides) {
  if (!rawFaction || typeof rawFaction !== "string") return "neutral";
  const trimmed = rawFaction.trim();
  if (!trimmed) return "neutral";

  const resolvedOverrides = resolveWorldviewOverrides(worldviewOverrides);
  const factionOverrides = resolvedOverrides?.factions || {};

  // Direct id match
  if (factionOverrides[trimmed]) return trimmed;

  // Label → id
  const resolvedId = LEGACY_FACTION_LABEL_TO_ID[trimmed];
  if (resolvedId && factionOverrides[resolvedId]) return resolvedId;

  return "neutral";
}

export function adaptWorldviewData(path, data, worldviewOverrides = defaultWorldviewOverrides) {
  if (!path || !data) return data;
  if (path.endsWith("data/characters.json")) return adaptCharactersData(data, worldviewOverrides);
  if (path.endsWith("data/factions.json")) return adaptFactionsData(data, worldviewOverrides);
  if (path.endsWith("data/courtChats.json")) return adaptCourtChatsData(data, worldviewOverrides);
  if (path.endsWith("data/positions.json")) return adaptPositionsData(data, worldviewOverrides);
  if (path.endsWith("data/nationInit.json")) return adaptNationInitData(data, worldviewOverrides);
  if (path.endsWith("data/provinceRules.json")) return adaptProvinceRulesData(data, worldviewOverrides);
  return data;
}