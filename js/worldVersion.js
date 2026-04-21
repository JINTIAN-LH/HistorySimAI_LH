export const DEFAULT_WORLD_VERSION = "cross_world_default_v1";

export function getConfiguredWorldVersion(config) {
  const version = String(config?.worldVersion || "").trim();
  return version || DEFAULT_WORLD_VERSION;
}

export function getSaveWorldVersion(saveObj) {
  const explicitVersion = String(saveObj?.game_data?.worldVersion || "").trim();
  if (explicitVersion) {
    return explicitVersion;
  }

  const configVersion = String(saveObj?.game_data?.config?.worldVersion || "").trim();
  if (configVersion) {
    return configVersion;
  }

  return "";
}

export function isSaveCompatibleWithWorld(saveObj, config) {
  const expectedVersion = getConfiguredWorldVersion(config);
  const saveVersion = getSaveWorldVersion(saveObj);
  return Boolean(saveVersion) && saveVersion === expectedVersion;
}
