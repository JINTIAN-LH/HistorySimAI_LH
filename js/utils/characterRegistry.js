function toArray(value) {
  return Array.isArray(value) ? value : [];
}

export function mergeCharacterLists(...lists) {
  const merged = new Map();
  lists.forEach((list) => {
    toArray(list).forEach((character) => {
      if (!character?.id || typeof character.id !== "string") return;
      merged.set(character.id, character);
    });
  });
  return Array.from(merged.values());
}

export function normalizeCandidateCharacter(raw, {
  source = "generated",
  factionLabel = "中立",
  summary = "朝廷新近罗致之士，正待进一步考察。",
  attitude = "观望朝局，愿陈所学。",
  openingLine = "臣愿陈所见，以待朝廷甄用。",
} = {}) {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" ? raw.id.trim() : "";
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!id || !name) return null;

  const ability = raw.ability && typeof raw.ability === "object" ? raw.ability : {};
  const loyalty = Number.isFinite(Number(raw.loyalty))
    ? Number(raw.loyalty)
    : (Number.isFinite(Number(ability.loyalty)) ? Number(ability.loyalty) : 60);

  return {
    id,
    name,
    courtesyName: typeof raw.courtesyName === "string" ? raw.courtesyName : "",
    birthYear: Number.isFinite(Number(raw.birthYear)) ? Number(raw.birthYear) : undefined,
    deathYear: Number.isFinite(Number(raw.deathYear)) ? Number(raw.deathYear) : undefined,
    hometown: typeof raw.hometown === "string" ? raw.hometown : "",
    positions: Array.isArray(raw.positions) ? raw.positions : [],
    faction: typeof raw.faction === "string" && raw.faction ? raw.faction : "neutral",
    factionLabel: typeof raw.factionLabel === "string" && raw.factionLabel ? raw.factionLabel : factionLabel,
    loyalty,
    quality: typeof raw.quality === "string" ? raw.quality : "ordinary",
    field: typeof raw.field === "string" ? raw.field : "politics",
    ability: {
      military: Number(ability.military) || 50,
      politics: Number(ability.politics) || 50,
      economy: Number(ability.economy) || 50,
      culture: Number(ability.culture) || 50,
      loyalty,
    },
    personality: typeof raw.personality === "string" ? raw.personality : "",
    background: typeof raw.background === "string" ? raw.background : "",
    isAlive: raw.isAlive !== false,
    deathReason: raw.deathReason || null,
    deathDay: raw.deathDay || null,
    tags: Array.isArray(raw.tags) ? raw.tags : ["待录用"],
    summary: typeof raw.summary === "string" && raw.summary ? raw.summary : summary,
    attitude: typeof raw.attitude === "string" && raw.attitude ? raw.attitude : attitude,
    openingLine: typeof raw.openingLine === "string" && raw.openingLine ? raw.openingLine : openingLine,
    source: typeof raw.source === "string" && raw.source ? raw.source : source,
  };
}

export function getCandidateCharactersFromState(state) {
  return mergeCharacterLists(
    state?.candidateCharacters,
    state?.talent?.pool,
    state?.keju?.generatedCandidates,
    state?.wuju?.generatedCandidates,
  );
}

export function getKnownCharactersFromState(state) {
  return mergeCharacterLists(
    state?.allCharacters,
    getCandidateCharactersFromState(state),
    state?.ministers,
  );
}

export function getAppointedCharactersFromState(state) {
  const appointments = state?.appointments && typeof state.appointments === "object"
    ? state.appointments
    : {};
  const aliveStatus = state?.characterStatus && typeof state.characterStatus === "object"
    ? state.characterStatus
    : {};
  const byId = new Map(getKnownCharactersFromState(state).map((character) => [character.id, character]));

  return Array.from(new Set(Object.values(appointments).filter((id) => typeof id === "string" && id)))
    .map((id) => byId.get(id))
    .filter((character) => character && aliveStatus[character.id]?.isAlive !== false);
}