import { resolveCharacterDisplayName, resolvePositionDisplayName } from "./sharedConstants.js";
import { formatEraTimeByRelativeYear } from "../worldview/worldviewRuntimeAccessor.js";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildCharacterNameById(state) {
  const base = toArray(state?.allCharacters);
  const generated = toArray(state?.keju?.generatedCandidates);
  const map = {};
  [...base, ...generated].forEach((item) => {
    if (!item || typeof item.id !== "string") return;
    map[item.id] = item.name || item.id;
  });
  return map;
}

function buildPositionNameById(state) {
  const positions = toArray(state?.positionsMeta?.positions);
  const map = {};
  positions.forEach((item) => {
    if (!item || typeof item.id !== "string") return;
    map[item.id] = item.name || item.id;
  });
  return map;
}

function summarizeDefeatedHostiles(state) {
  return toArray(state?.hostileForces)
    .filter((item) => item && (item.isDefeated || (typeof item.power === "number" && item.power <= 0)))
    .map((item) => ({
      id: item.id,
      name: item.name || item.id,
      leader: item.leader || "",
      defeatedYear: item.defeatedYear || null,
      defeatedMonth: item.defeatedMonth || null,
    }))
    .slice(0, 12);
}

function summarizeDeceasedMinisters(state) {
  const status = state?.characterStatus && typeof state.characterStatus === "object" ? state.characterStatus : {};
  const nameById = buildCharacterNameById(state);
  return Object.entries(status)
    .filter(([, v]) => v && v.isAlive === false)
    .map(([id, v]) => ({
      id,
      name: resolveCharacterDisplayName(nameById, id),
      reason: typeof v.deathReason === "string" && v.deathReason ? v.deathReason : "已故",
      deathDay: v.deathDay ?? null,
    }))
    .slice(0, 20);
}

function summarizeActiveAppointments(state) {
  const appointments = state?.appointments && typeof state.appointments === "object" ? state.appointments : {};
  const status = state?.characterStatus && typeof state.characterStatus === "object" ? state.characterStatus : {};
  const nameById = buildCharacterNameById(state);
  const positionNameById = buildPositionNameById(state);
  return Object.entries(appointments)
    .filter(([, holderId]) => typeof holderId === "string" && holderId && status[holderId]?.isAlive !== false)
    .map(([positionId, holderId]) => ({
      positionId,
      positionName: resolvePositionDisplayName(positionNameById, positionId),
      characterId: holderId,
      characterName: resolveCharacterDisplayName(nameById, holderId),
    }))
    .slice(0, 24);
}

export function buildStoryFactsFromState(state) {
  const defeatedHostiles = summarizeDefeatedHostiles(state);
  const deceasedMinisters = summarizeDeceasedMinisters(state);
  const activeAppointments = summarizeActiveAppointments(state);
  const hardFacts = [];

  defeatedHostiles.forEach((item) => {
    const when = item.defeatedYear && item.defeatedMonth
      ? `（${formatEraTimeByRelativeYear(state, item.defeatedYear, item.defeatedMonth)}）`
      : "";
    hardFacts.push(`敌对势力「${item.name}」已灭亡${when}，不得在后续剧情中以存活势力复活。`);
  });

  deceasedMinisters.slice(0, 8).forEach((item) => {
    hardFacts.push(`人物「${item.name}」已故（${item.reason}），不得在后续剧情中复活任职。`);
  });

  return {
    version: 1,
    updatedAt: {
      year: state?.currentYear || 1,
      month: state?.currentMonth || 1,
      day: state?.currentDay || 1,
    },
    hardFacts: hardFacts.slice(0, 24),
    defeatedHostiles,
    deceasedMinisters,
    activeAppointments,
    closedStorylines: toArray(state?.closedStorylines).slice(-30),
  };
}
