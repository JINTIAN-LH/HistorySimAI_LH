const LEGACY_ABSOLUTE_BASE_YEAR = 1627;

function toInteger(value) {
  return Number.isInteger(value) ? value : Number.parseInt(value, 10);
}

export function getAbsoluteYearForEraYear(eraYear, config = {}) {
  const resolvedEraYear = Math.max(1, toInteger(eraYear) || 1);
  const absoluteStartYear = toInteger(config?.absoluteStartYear);
  const startYear = Math.max(1, toInteger(config?.startYear) || 1);

  if (Number.isInteger(absoluteStartYear)) {
    return absoluteStartYear + (resolvedEraYear - startYear);
  }

  return LEGACY_ABSOLUTE_BASE_YEAR + resolvedEraYear;
}

export { LEGACY_ABSOLUTE_BASE_YEAR };