function toNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function toStringArray(value, fallback = []) {
  if (!Array.isArray(value)) return fallback.slice();
  const normalized = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return normalized.length ? normalized : fallback.slice();
}

export function isCustomWorldviewActive(state) {
  return Boolean(state?.config?.worldviewOverrides);
}

export function isRigidModeAllowed(state) {
  return !isCustomWorldviewActive(state);
}

export function resolveWorldviewEraInfo(state) {
  const worldviewData = state?.config?.worldviewData || {};
  const worldviewOverrides = state?.config?.worldviewOverrides || {};
  const eraLabel =
    toNonEmptyString(worldviewData.eraLabel)
    || toNonEmptyString(worldviewOverrides.eraLabel)
    || "建炎";
  const absoluteStartYear = Number(state?.config?.absoluteStartYear);

  return {
    eraLabel,
    absoluteStartYear: Number.isFinite(absoluteStartYear) ? absoluteStartYear : 1627,
  };
}

export function formatEraTimeByAbsoluteYear(state, absoluteYear, month) {
  const { eraLabel, absoluteStartYear } = resolveWorldviewEraInfo(state);
  const normalizedYear = Number(absoluteYear) || absoluteStartYear;
  const normalizedMonth = Number(month) || 1;
  const eraYear = Math.max(1, normalizedYear - absoluteStartYear + 1);
  return `${eraLabel}${eraYear}年${normalizedMonth}月`;
}

export function formatEraTimeByRelativeYear(state, relativeYear, month) {
  const { eraLabel } = resolveWorldviewEraInfo(state);
  const normalizedYear = Math.max(1, Number(relativeYear) || 1);
  const normalizedMonth = Number(month) || 1;
  return `${eraLabel}${normalizedYear}年${normalizedMonth}月`;
}

export function resolveWorldviewBattleLabels(state) {
  const worldviewData = state?.config?.worldviewData || {};
  const worldviewOverrides = state?.config?.worldviewOverrides || {};
  const militaryLabels = worldviewOverrides?.militaryLabels || worldviewData?.militaryLabels || {};
  const rulerTitle =
    toNonEmptyString(worldviewData?.playerRole?.title)
    || toNonEmptyString(state?.player?.title)
    || "朝廷";

  return {
    playerForceLabel: toNonEmptyString(militaryLabels.playerForceLabel) || `${rulerTitle}军`,
    hostileTrendLabel: toNonEmptyString(militaryLabels.hostileTrendLabel) || "敌军态势",
  };
}

export function resolveWorldviewSemanticLabels(state) {
  const worldviewData = state?.config?.worldviewData || {};
  const worldviewOverrides = state?.config?.worldviewOverrides || {};
  const semanticLabels = worldviewOverrides?.semanticLabels || worldviewData?.semanticLabels || {};

  const defaultNorthernAliases = ["北方敌军", "江北敌军", "北境强敌"];
  const defaultRebelAliases = ["地方叛军", "流寇", "流民军", "兵乱", "叛军"];
  const defaultDengzhouAliases = ["登州叛军", "叛军"];

  return {
    primaryHostileName: toNonEmptyString(semanticLabels.primaryHostileName) || "北方敌军",
    northernHostileAliases: toStringArray(semanticLabels.northernHostileAliases, defaultNorthernAliases),
    rebelForceAliases: toStringArray(semanticLabels.rebelForceAliases, defaultRebelAliases),
    dengzhouRebelAliases: toStringArray(semanticLabels.dengzhouRebelAliases, defaultDengzhouAliases),
  };
}