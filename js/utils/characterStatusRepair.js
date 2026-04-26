import { getAbsoluteYearForEraYear } from "./eraYear.js";

const NATURAL_DEATH_REASON_PATTERN = /(病逝|寿终|老死|寿尽)/;

function isNaturalDeathReason(reason) {
  return typeof reason === "string" && NATURAL_DEATH_REASON_PATTERN.test(reason.trim());
}

export function repairImpossibleNaturalDeaths({
  characters,
  characterStatus,
  config,
  currentYear,
}) {
  const sourceStatus = characterStatus && typeof characterStatus === "object" ? characterStatus : {};
  const roster = Array.isArray(characters) ? characters : [];
  const absoluteYear = getAbsoluteYearForEraYear(currentYear || 1, config);
  const nextStatus = { ...sourceStatus };
  const repairedIds = [];

  roster.forEach((character) => {
    if (!character?.id || typeof character.deathYear !== "number") return;

    const current = sourceStatus[character.id];
    if (!current || current.isAlive !== false) return;

    const reason = typeof current.deathReason === "string" && current.deathReason.trim()
      ? current.deathReason.trim()
      : "";
    if (!isNaturalDeathReason(reason)) return;
    if (absoluteYear >= character.deathYear) return;

    const { deathReason, deathDay, deathYear, lifespanPatchYears, ...rest } = current;
    nextStatus[character.id] = {
      ...rest,
      isAlive: true,
      deathReason: null,
      deathDay: null,
    };
    repairedIds.push(character.id);
  });

  return {
    characterStatus: nextStatus,
    repairedIds,
  };
}
