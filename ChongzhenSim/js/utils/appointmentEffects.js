function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compactText(text) {
  return String(text || "").replace(/\s+/g, "");
}

function toPattern(text) {
  return escapeRegExp(compactText(text));
}

function buildCurrentHolderByPosition(currentAppointments) {
  const source = currentAppointments && typeof currentAppointments === "object" ? currentAppointments : {};
  const map = {};
  Object.entries(source).forEach(([positionId, characterId]) => {
    if (typeof positionId !== "string" || typeof characterId !== "string") return;
    if (!positionId.trim() || !characterId.trim()) return;
    map[positionId.trim()] = characterId.trim();
  });
  return map;
}

function buildCurrentPositionByCharacter(currentAppointments) {
  const byPosition = buildCurrentHolderByPosition(currentAppointments);
  const map = {};
  Object.entries(byPosition).forEach(([positionId, characterId]) => {
    map[characterId] = positionId;
  });
  return map;
}

export function deriveAppointmentEffectsFromText(edictText, context = {}) {
  const text = compactText(edictText);
  if (!text) return null;

  const ministers = Array.isArray(context.ministers) ? context.ministers : [];
  const positions = Array.isArray(context.positions) ? context.positions : [];
  const currentAppointments = buildCurrentHolderByPosition(context.currentAppointments);
  const currentPositionByCharacter = buildCurrentPositionByCharacter(context.currentAppointments);

  const appointMap = {};
  const dismissSet = new Set();

  const appointKeyword = "(?:任命|擢升|擢任|改任|出任|署理|兼任|命)";
  const dismissKeyword = "(?:免去|罢免|革去|撤去|免职|去职|撤职)";

  positions.forEach((position) => {
    if (!position || typeof position.id !== "string" || typeof position.name !== "string") return;
    const positionId = position.id.trim();
    const positionName = position.name.trim();
    if (!positionId || !positionName) return;

    const posPattern = toPattern(positionName);
    const dismissByPosition = new RegExp(`${dismissKeyword}.{0,10}${posPattern}|${posPattern}.{0,8}${dismissKeyword}`);
    if (dismissByPosition.test(text)) {
      dismissSet.add(positionId);
    }

    ministers.forEach((minister) => {
      if (!minister || typeof minister.id !== "string" || typeof minister.name !== "string") return;
      const characterId = minister.id.trim();
      const characterName = minister.name.trim();
      if (!characterId || !characterName) return;

      const charPattern = toPattern(characterName);

      const appointPattern = new RegExp(
        `${appointKeyword}.{0,10}${charPattern}.{0,8}(?:为|任|出任|担任)?${posPattern}|${charPattern}.{0,8}${appointKeyword}.{0,8}(?:为|任|出任|担任)?${posPattern}|${charPattern}.{0,4}(?:为|任|出任|担任)${posPattern}`
      );
      if (appointPattern.test(text)) {
        appointMap[positionId] = characterId;
      }

      const dismissByPersonAndPosition = new RegExp(
        `${dismissKeyword}.{0,8}${charPattern}.{0,8}${posPattern}|${charPattern}.{0,8}${dismissKeyword}.{0,8}${posPattern}`
      );
      if (dismissByPersonAndPosition.test(text)) {
        dismissSet.add(positionId);
      }
    });
  });

  ministers.forEach((minister) => {
    if (!minister || typeof minister.id !== "string" || typeof minister.name !== "string") return;
    const characterId = minister.id.trim();
    const characterName = minister.name.trim();
    if (!characterId || !characterName) return;

    const currentPositionId = currentPositionByCharacter[characterId];
    if (!currentPositionId) return;

    const charPattern = toPattern(characterName);
    const dismissByPerson = new RegExp(`${dismissKeyword}.{0,8}${charPattern}|${charPattern}.{0,8}${dismissKeyword}`);
    if (dismissByPerson.test(text)) {
      dismissSet.add(currentPositionId);
    }
  });

  // If the same position is both dismissed and appointed in one edict, keep the appointment result only.
  Object.keys(appointMap).forEach((positionId) => dismissSet.delete(positionId));

  const appointmentDismissals = Array.from(dismissSet);
  if (!Object.keys(appointMap).length && !appointmentDismissals.length) return null;

  const next = {};
  if (Object.keys(appointMap).length) next.appointments = appointMap;
  if (appointmentDismissals.length) next.appointmentDismissals = appointmentDismissals;
  return next;
}
