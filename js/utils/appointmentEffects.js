function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compactText(text) {
  return String(text || "").replace(/\s+/g, "");
}

function splitActionClauses(text) {
  return compactText(text)
    .split(/[，；。！？]/)
    .map((item) => item.trim())
    .filter(Boolean);
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

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function canonicalizePositionText(value) {
  const raw = normalizeString(value);
  if (!raw) return "";
  let text = compactText(raw);
  text = text.replace(/督察院/g, "都察院");
  text = text.replace(/^都察院/, "");
  return text;
}

function buildPositionResolvers(positions) {
  const byId = new Map();
  const byName = new Map();
  const byCanonicalName = new Map();
  (Array.isArray(positions) ? positions : []).forEach((position) => {
    const id = normalizeString(position?.id);
    const name = normalizeString(position?.name);
    if (id) byId.set(id, id);
    if (name) byName.set(name, id || name);
    const canonicalName = canonicalizePositionText(name);
    if (canonicalName) byCanonicalName.set(canonicalName, id || name);
  });

  return {
    resolvePositionId(raw) {
      const text = normalizeString(raw);
      if (!text) return "";
      if (byId.has(text)) return byId.get(text);
      if (byName.has(text)) return byName.get(text);
      const canonical = canonicalizePositionText(text);
      if (!canonical) return "";
      if (byCanonicalName.has(canonical)) return byCanonicalName.get(canonical);

      let bestId = "";
      let bestLen = 0;
      for (const [nameKey, id] of byCanonicalName.entries()) {
        if (!nameKey) continue;
        if (canonical.includes(nameKey) || nameKey.includes(canonical)) {
          if (nameKey.length > bestLen) {
            bestLen = nameKey.length;
            bestId = id;
          }
        }
      }
      if (bestId) return bestId;
      return "";
    },
  };
}

function buildMinisterResolvers(ministers) {
  const byId = new Map();
  const byName = new Map();
  (Array.isArray(ministers) ? ministers : []).forEach((minister) => {
    const id = normalizeString(minister?.id);
    const name = normalizeString(minister?.name);
    if (id) byId.set(id, id);
    if (name) byName.set(name, id || name);
  });

  return {
    resolveMinisterId(raw) {
      const text = normalizeString(raw);
      if (!text) return "";
      if (byId.has(text)) return byId.get(text);
      if (byName.has(text)) return byName.get(text);
      return "";
    },
  };
}

export function normalizeAppointmentEffects(effects, context = {}) {
  if (!effects || typeof effects !== "object" || Array.isArray(effects)) return effects;

  const { resolvePositionId } = buildPositionResolvers(context.positions || []);
  const { resolveMinisterId } = buildMinisterResolvers(context.ministers || []);

  const next = { ...effects };

  if (next.appointments && typeof next.appointments === "object" && !Array.isArray(next.appointments)) {
    const normalizedAppointments = {};
    Object.entries(next.appointments).forEach(([rawPosition, rawMinister]) => {
      const positionId = resolvePositionId(rawPosition);
      const ministerId = resolveMinisterId(rawMinister);
      if (!positionId || !ministerId) return;
      normalizedAppointments[positionId] = ministerId;
    });
    if (Object.keys(normalizedAppointments).length) next.appointments = normalizedAppointments;
    else delete next.appointments;
  }

  if (Array.isArray(next.appointmentDismissals)) {
    const normalizedDismissals = Array.from(
      new Set(
        next.appointmentDismissals
          .map((raw) => resolvePositionId(raw))
          .filter(Boolean)
      )
    );
    if (normalizedDismissals.length) next.appointmentDismissals = normalizedDismissals;
    else delete next.appointmentDismissals;
  }

  return next;
}

function buildPositionById(positions) {
  const map = new Map();
  (Array.isArray(positions) ? positions : []).forEach((position) => {
    const id = normalizeString(position?.id);
    if (!id) return;
    map.set(id, position);
  });
  return map;
}

function isMilitaryPosition(position) {
  if (!position || typeof position !== "object") return false;
  const department = normalizeString(position.department);
  if (department === "bingbu" || department === "military") return true;
  const text = compactText(`${position.name || ""}${position.description || ""}`);
  return /(军务|军事|总兵|督师|统兵|边防|江防|防务|都督|制置使|安抚使|兵马|戍守)/.test(text);
}

function getMilitaryPositionScore(position) {
  const importance = Number(position?.importance || 0);
  if (importance >= 10) return 6;
  if (importance >= 8) return 5;
  if (importance >= 6) return 4;
  if (importance >= 4) return 3;
  return 2;
}

function scoreMilitaryAppointments(appointments, positionById) {
  let score = 0;
  Object.entries(buildCurrentHolderByPosition(appointments)).forEach(([positionId, characterId]) => {
    if (!positionId || !characterId) return;
    const position = positionById.get(positionId);
    if (!isMilitaryPosition(position)) return;
    score += getMilitaryPositionScore(position);
  });
  return score;
}

function applyAppointmentMutations(currentAppointments, effects) {
  const nextAppointments = buildCurrentHolderByPosition(currentAppointments);

  if (Array.isArray(effects?.appointmentDismissals)) {
    effects.appointmentDismissals.forEach((positionId) => {
      const id = normalizeString(positionId);
      if (!id) return;
      delete nextAppointments[id];
    });
  }

  if (effects?.appointments && typeof effects.appointments === "object" && !Array.isArray(effects.appointments)) {
    Object.entries(effects.appointments).forEach(([positionId, characterId]) => {
      const posId = normalizeString(positionId);
      const charId = normalizeString(characterId);
      if (!posId || !charId) return;

      Object.entries(nextAppointments).forEach(([existingPosId, holderId]) => {
        if (holderId === charId && existingPosId !== posId) {
          delete nextAppointments[existingPosId];
        }
      });

      nextAppointments[posId] = charId;
    });
  }

  return nextAppointments;
}

export function deriveAppointmentStateEffects(effects, context = {}) {
  if (!effects || typeof effects !== "object" || Array.isArray(effects)) return null;

  const normalized = normalizeAppointmentEffects(effects, context) || effects;
  const positionById = buildPositionById(context.positions || []);
  if (!positionById.size) return null;

  const beforeAppointments = buildCurrentHolderByPosition(context.currentAppointments);
  const afterAppointments = applyAppointmentMutations(beforeAppointments, normalized);
  const beforeScore = scoreMilitaryAppointments(beforeAppointments, positionById);
  const afterScore = scoreMilitaryAppointments(afterAppointments, positionById);
  const militaryStrength = afterScore - beforeScore;

  if (!militaryStrength) return null;
  return { militaryStrength };
}

export function mergeDerivedAppointmentStateEffects(effects, context = {}) {
  if (!effects || typeof effects !== "object" || Array.isArray(effects)) return effects;
  const derived = deriveAppointmentStateEffects(effects, context);
  if (!derived) return effects;

  const merged = { ...effects };
  Object.entries(derived).forEach(([key, value]) => {
    if (typeof value !== "number") return;
    if (typeof merged[key] === "number") merged[key] += value;
    else merged[key] = value;
  });
  return merged;
}

export function deriveAppointmentEffectsFromText(edictText, context = {}) {
  const text = compactText(edictText);
  if (!text) return null;
  const clauses = splitActionClauses(edictText);

  const ministers = Array.isArray(context.ministers) ? context.ministers : [];
  const positions = Array.isArray(context.positions) ? context.positions : [];
  const currentAppointments = buildCurrentHolderByPosition(context.currentAppointments);
  const currentPositionByCharacter = buildCurrentPositionByCharacter(context.currentAppointments);

  const appointMap = {};
  const dismissSet = new Set();
  const deathMap = {};

  const appointKeyword = "(?:任命|擢升|擢任|改任|出任|署理|兼任|命)";
  const dismissKeyword = "(?:免去|罢免|革去|撤去|免职|去职|撤职)";
  const deathKeyword = "(?:赐死|赐予自尽|赐自尽|赐予|自尽|饮鸩|毒酒)";

  positions.forEach((position) => {
    if (!position || typeof position.id !== "string" || typeof position.name !== "string") return;
    const positionId = position.id.trim();
    const positionName = position.name.trim();
    if (!positionId || !positionName) return;

    const posPattern = toPattern(positionName);
    const dismissByPosition = new RegExp(`${dismissKeyword}.{0,10}${posPattern}|${posPattern}.{0,8}${dismissKeyword}`);
    if (clauses.some((clause) => dismissByPosition.test(clause))) {
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
      if (clauses.some((clause) => appointPattern.test(clause))) {
        appointMap[positionId] = characterId;
      }

      const dismissByPersonAndPosition = new RegExp(
        `${dismissKeyword}.{0,8}${charPattern}.{0,8}${posPattern}|${charPattern}.{0,8}${dismissKeyword}.{0,8}${posPattern}`
      );
      if (clauses.some((clause) => dismissByPersonAndPosition.test(clause))) {
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
    if (clauses.some((clause) => dismissByPerson.test(clause))) {
      dismissSet.add(currentPositionId);
    }

    // Death pattern: "赐死 官员名" or "官员名 赐死" (within 2 characters to stay within same action clause)
    const deathPattern = new RegExp(`${deathKeyword}.{0,2}${charPattern}|${charPattern}.{0,2}${deathKeyword}`);
    if (deathPattern.test(text)) {
      deathMap[characterId] = "赐死";
    }
  });

  // If the same position is both dismissed and appointed in one edict, keep the appointment result only.
  Object.keys(appointMap).forEach((positionId) => dismissSet.delete(positionId));

  const appointmentDismissals = Array.from(dismissSet);
  if (!Object.keys(appointMap).length && !appointmentDismissals.length && !Object.keys(deathMap).length) return null;

  const next = {};
  if (Object.keys(appointMap).length) next.appointments = appointMap;
  if (appointmentDismissals.length) next.appointmentDismissals = appointmentDismissals;
  if (Object.keys(deathMap).length) next.characterDeath = deathMap;
  return next;
}
