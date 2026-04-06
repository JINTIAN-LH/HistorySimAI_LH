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

export function adaptWorldviewData(path, data, worldviewOverrides = defaultWorldviewOverrides) {
  if (!path || !data) return data;
  if (path.endsWith("data/characters.json")) return adaptCharactersData(data, worldviewOverrides);
  if (path.endsWith("data/factions.json")) return adaptFactionsData(data, worldviewOverrides);
  if (path.endsWith("data/courtChats.json")) return adaptCourtChatsData(data, worldviewOverrides);
  if (path.endsWith("data/positions.json")) return adaptPositionsData(data, worldviewOverrides);
  return data;
}