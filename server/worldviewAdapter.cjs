const defaultWorldviewOverrides = require("../public/data/worldviewOverrides.json");

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

function adaptCharactersData(data, worldviewOverrides = defaultWorldviewOverrides) {
  const resolvedOverrides = resolveWorldviewOverrides(worldviewOverrides);
  const source = Array.isArray(data && (data.characters || data.ministers)) ? (data.characters || data.ministers) : [];
  const byId = mapById(source);
  const allowedCharacterIds = Array.isArray(resolvedOverrides.allowedCharacterIds) ? resolvedOverrides.allowedCharacterIds : [];
  const characters = allowedCharacterIds
    .map((id) => {
      const override = resolvedOverrides.characters && resolvedOverrides.characters[id];
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
    schemaVersion: (data && data.schemaVersion) || 2,
    characters,
  };
}

function applyOverrideList(list, overrides) {
  return (Array.isArray(list) ? list : []).map((item) => {
    if (!item || typeof item.id !== "string") return item;
    const override = overrides && overrides[item.id];
    if (!override) return item;
    return {
      ...item,
      ...cloneRecord(override),
      id: item.id,
    };
  });
}

function adaptFactionsData(data, worldviewOverrides = defaultWorldviewOverrides) {
  const resolvedOverrides = resolveWorldviewOverrides(worldviewOverrides);
  const source = Array.isArray(data && data.factions) ? data.factions : [];
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

function adaptCourtChatsData(data, worldviewOverrides = defaultWorldviewOverrides) {
  const resolvedOverrides = resolveWorldviewOverrides(worldviewOverrides);
  return cloneRecord(resolvedOverrides.courtChats) || data || {};
}

function adaptPositionsData(data, worldviewOverrides = defaultWorldviewOverrides) {
  const resolvedOverrides = resolveWorldviewOverrides(worldviewOverrides);
  return {
    ...(data || {}),
    modules: applyOverrideList(data && data.modules, resolvedOverrides.modules || {}),
    departments: applyOverrideList(data && data.departments, resolvedOverrides.departments || {}),
    positions: applyOverrideList(data && data.positions, resolvedOverrides.positions || {}),
  };
}

function adaptWorldviewData(filePath, data, worldviewOverrides = defaultWorldviewOverrides) {
  if (!filePath || !data) return data;
  if (filePath.endsWith("data/characters.json")) return adaptCharactersData(data, worldviewOverrides);
  if (filePath.endsWith("data/factions.json")) return adaptFactionsData(data, worldviewOverrides);
  if (filePath.endsWith("data/courtChats.json")) return adaptCourtChatsData(data, worldviewOverrides);
  if (filePath.endsWith("data/positions.json")) return adaptPositionsData(data, worldviewOverrides);
  return data;
}

module.exports = {
  defaultWorldviewOverrides,
  adaptCharactersData,
  adaptCourtChatsData,
  adaptFactionsData,
  adaptPositionsData,
  adaptWorldviewData,
};