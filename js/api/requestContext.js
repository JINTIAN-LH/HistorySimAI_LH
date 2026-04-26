import { getPolicyCatalog } from "../systems/coreGameplaySystem.js";
import { buildStoryFactsFromState } from "../utils/storyFacts.js";
import { getKnownCharactersFromState } from "../utils/characterRegistry.js";

function setOptionalArray(target, key, value, { requireNonEmpty = false } = {}) {
  if (!Array.isArray(value)) return;
  if (requireNonEmpty && value.length === 0) return;
  target[key] = value;
}

function setOptionalObject(target, key, value) {
  if (!value || typeof value !== "object") return;
  target[key] = value;
}

function buildPolicyTitleById(state) {
  return new Map(
    getPolicyCatalog(state).map((item) => [String(item.id || ""), String(item.title || item.id || "")])
  );
}

function resolveUnlockedPolicyTitles(unlockedPolicies, policyTitleById) {
  if (!Array.isArray(unlockedPolicies)) return [];
  return unlockedPolicies
    .filter((id) => typeof id === "string" && id.trim())
    .map((id) => policyTitleById.get(id) || id);
}

function resolveUnlockedPolicyTitleMap(unlockedPolicies, policyTitleById) {
  if (!Array.isArray(unlockedPolicies)) return {};
  const out = {};
  unlockedPolicies.forEach((id) => {
    if (typeof id !== "string" || !id.trim()) return;
    out[id] = policyTitleById.get(id) || id;
  });
  return out;
}

function buildWorldviewReadonlyContext(state) {
  const worldviewData = state?.config?.worldviewData;
  const normalizedWorldviewData = worldviewData && typeof worldviewData === "object"
    ? worldviewData
    : {};

  const playerRole = normalizedWorldviewData.playerRole && typeof normalizedWorldviewData.playerRole === "object"
    ? normalizedWorldviewData.playerRole
    : null;
  const factionNames = Array.isArray(state?.factions)
    ? state.factions.map((item) => item?.name).filter((name) => typeof name === "string" && name.trim())
    : [];

  const worldviewId = String(
    normalizedWorldviewData.id || state?.worldVersion || state?.config?.worldVersion || ""
  ).trim();
  const worldviewTitle = String(
    normalizedWorldviewData.title || state?.config?.gameTitle || ""
  ).trim();

  if (!worldviewId && !worldviewTitle) {
    return null;
  }

  return {
    id: worldviewId,
    title: worldviewTitle,
    gameTitle: normalizedWorldviewData.gameTitle || state?.config?.gameTitle || "",
    playerRole: playerRole
      ? {
        name: playerRole.name || state?.player?.name || "",
        title: playerRole.title || state?.player?.title || "",
      }
      : {
        name: state?.player?.name || "",
        title: state?.player?.title || "",
      },
    factionNames,
    storyPrompt: normalizedWorldviewData.storyPrompt || null,
  };
}

export function buildSharedContextFromState(state, { compact = false } = {}) {
  const ctx = {};
  const policyTitleById = buildPolicyTitleById(state);

  setOptionalArray(ctx, "customPolicies", state.customPolicies, { requireNonEmpty: compact });
  setOptionalArray(ctx, "hostileForces", state.hostileForces, { requireNonEmpty: compact });
  setOptionalArray(ctx, "closedStorylines", state.closedStorylines, { requireNonEmpty: compact });
  setOptionalObject(ctx, "storyFacts", state.storyFacts || buildStoryFactsFromState(state));

  setOptionalObject(ctx, "playerAbilities", state.playerAbilities);
  setOptionalArray(ctx, "unlockedPolicies", state.unlockedPolicies, { requireNonEmpty: compact });
  setOptionalArray(ctx, "unlockedPolicyTitles", resolveUnlockedPolicyTitles(state.unlockedPolicies, policyTitleById), { requireNonEmpty: compact });
  setOptionalObject(ctx, "unlockedPolicyTitleMap", resolveUnlockedPolicyTitleMap(state.unlockedPolicies, policyTitleById));

  setOptionalObject(ctx, "worldview", buildWorldviewReadonlyContext(state));

  return ctx;
}

export function buildStoryRequestBody(state, lastChoice) {
  const body = {
    state: {
      currentDay: state.currentDay,
      currentPhase: state.currentPhase,
      currentMonth: state.currentMonth,
      currentYear: state.currentYear,
      nation: state.nation || {},
      appointments: state.appointments || {},
      characterStatus: state.characterStatus || {},
      prestige: state.prestige,
      executionRate: state.executionRate,
    },
    ...buildSharedContextFromState(state, { compact: true }),
  };

  if (lastChoice) {
    body.lastChoiceId = lastChoice.id;
    body.lastChoiceText = lastChoice.text;
    if (lastChoice.hint) body.lastChoiceHint = lastChoice.hint;
  }

  // 自定义世界观的剧情提示词透传
  const storyPrompt = state.config?.worldviewData?.storyPrompt;
  if (typeof storyPrompt === "string" && storyPrompt.trim()) {
    body.worldviewStoryPrompt = storyPrompt.trim();
  } else if (storyPrompt && typeof storyPrompt === "object") {
    body.worldviewStoryPrompt = storyPrompt;
  }

  return body;
}

export function buildMinisterChatRequestBody(state, ministerId, history) {
  return {
    ministerId,
    history,
    state: {
      appointments: state.appointments || {},
      characterStatus: state.characterStatus || {},
      extraCharacters: getKnownCharactersFromState(state).map((item) => ({ ...item })),
    },
    ...buildSharedContextFromState(state, { compact: false }),
  };
}
