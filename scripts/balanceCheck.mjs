import { readFileSync } from "node:fs";
import {
  POLICY_CATALOG,
  applyProgressionToChoiceEffects,
  scaleEffectsByExecution,
  processCoreGameplayTurn,
  resolveHostileForcesAfterChoice,
  initializeCoreGameplayState,
  normalizeUnlockedPolicies,
} from "../js/systems/coreGameplaySystem.js";
import { computeQuarterlyEffects } from "../js/systems/storySystem.js";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function applyNationEffects(state, effects) {
  if (!effects || typeof effects !== "object") return state;
  const nation = { ...(state.nation || {}) };
  const PERCENT_KEYS = ["militaryStrength", "civilMorale", "borderThreat", "disasterLevel", "corruptionLevel"];
  for (const [key, value] of Object.entries(effects)) {
    if (typeof value !== "number") continue;
    if (key === "treasury" || key === "grain") {
      nation[key] = Math.max(0, (nation[key] || 0) + value);
      continue;
    }
    if (PERCENT_KEYS.includes(key)) {
      const clampedDelta = clamp(value, -30, 30);
      nation[key] = clamp((nation[key] || 0) + clampedDelta, 0, 100);
    }
  }
  return { ...state, nation };
}

function resolveTurn(state, turnChoice, nextYear, nextMonth) {
  const progressed = applyProgressionToChoiceEffects(turnChoice.effects, state, turnChoice.text);
  const effective = scaleEffectsByExecution(progressed, state);
  let next = applyNationEffects(state, effective);

  const coreTurn = processCoreGameplayTurn(next, turnChoice.text, effective, nextYear, nextMonth);
  next = { ...next, ...coreTurn.statePatch };
  next = applyNationEffects(next, coreTurn.consequenceEffects);

  const hostileTurn = resolveHostileForcesAfterChoice(next, turnChoice.text, effective || {}, nextYear, nextMonth);
  if (hostileTurn) {
    next = { ...next, ...hostileTurn.statePatch };
    next = applyNationEffects(next, hostileTurn.effectsPatch);
    if (hostileTurn.prestigeDelta) {
      next.prestige = clamp((next.prestige || 0) + hostileTurn.prestigeDelta, 0, 100);
    }
  }

  const quarter = computeQuarterlyEffects(next, nextMonth);
  next = applyNationEffects(next, quarter);

  return {
    state: next,
    quarter,
  };
}

function calcScore(state) {
  const nation = state.nation || {};
  const treasury = nation.treasury || 0;
  const grain = nation.grain || 0;
  const military = nation.militaryStrength || 0;
  const morale = nation.civilMorale || 0;
  const border = nation.borderThreat || 0;
  const disaster = nation.disasterLevel || 0;
  const corruption = nation.corruptionLevel || 0;
  const prestige = state.prestige || 0;
  const execution = state.executionRate || 0;
  const unrest = state.unrest || 0;
  const partyStrife = state.partyStrife || 0;

  const econScore = clamp((treasury / 1200000) * 100, 0, 120) * 0.18 + clamp((grain / 120000) * 100, 0, 120) * 0.16;
  const stabilityScore = military * 0.15 + morale * 0.12 + (100 - border) * 0.09 + (100 - disaster) * 0.08 + (100 - corruption) * 0.08;
  const governanceScore = prestige * 0.08 + execution * 0.08 + (100 - unrest) * 0.08 + (100 - partyStrife) * 0.08;

  return Math.round((econScore + stabilityScore + governanceScore) * 100) / 100;
}

function summarize(name, states) {
  const last = states[states.length - 1];
  const treasuryList = states.map((s) => s.nation.treasury || 0);
  const grainList = states.map((s) => s.nation.grain || 0);
  const unrestList = states.map((s) => s.unrest || 0);
  const partyList = states.map((s) => s.partyStrife || 0);
  const scoreList = states.map((s) => calcScore(s));

  const min = (arr) => Math.min(...arr);
  const max = (arr) => Math.max(...arr);
  const avg = (arr) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);

  const aliveHostiles = (last.hostileForces || []).filter((h) => !h.isDefeated).length;

  return {
    scenario: name,
    finalTreasury: last.nation.treasury,
    finalGrain: last.nation.grain,
    finalMilitary: last.nation.militaryStrength,
    finalMorale: last.nation.civilMorale,
    finalBorderThreat: last.nation.borderThreat,
    finalCorruption: last.nation.corruptionLevel,
    finalUnrest: last.unrest,
    finalPartyStrife: last.partyStrife,
    finalExecution: last.executionRate,
    finalPrestige: last.prestige,
    hostilesAlive: aliveHostiles,
    treasuryRange: `${min(treasuryList)} ~ ${max(treasuryList)}`,
    grainRange: `${min(grainList)} ~ ${max(grainList)}`,
    unrestRange: `${min(unrestList)} ~ ${max(unrestList)}`,
    partyRange: `${min(partyList)} ~ ${max(partyList)}`,
    avgScore: Math.round(avg(scoreList) * 100) / 100,
    endScore: calcScore(last),
  };
}

function makeBaseState(unlockedPolicies) {
  const config = JSON.parse(readFileSync(new URL("../data/config.json", import.meta.url), "utf8"));
  const balance = JSON.parse(readFileSync(new URL("../data/balanceConfig.json", import.meta.url), "utf8"));
  const nationInit = JSON.parse(readFileSync(new URL("../data/nationInit.json", import.meta.url), "utf8"));
  const factionsData = JSON.parse(readFileSync(new URL("../data/factions.json", import.meta.url), "utf8"));
  const factions = Array.isArray(factionsData) ? factionsData : (factionsData.factions || []);

  const rawState = {
    currentYear: 3,
    currentMonth: 4,
    nation: {
      treasury: nationInit.treasury,
      grain: nationInit.grain,
      militaryStrength: nationInit.militaryStrength,
      civilMorale: nationInit.civilMorale,
      borderThreat: nationInit.borderThreat,
      disasterLevel: nationInit.disasterLevel,
      corruptionLevel: nationInit.corruptionLevel,
    },
    newsToday: [],
    publicOpinion: [],
    unlockedPolicies,
    playerAbilities: {
      management: 2,
      military: 2,
      scholarship: 2,
      politics: 2,
    },
    hostileForces: [],
    closedStorylines: [],
  };

  return {
    ...rawState,
    ...initializeCoreGameplayState(rawState, factions, { ...config, balance }, nationInit),
    config: { ...config, balance },
  };
}

const CHOICES = {
  relief: {
    text: "开仓赈灾并整顿吏治，减税安民",
    effects: {
      treasury: -140000,
      grain: -12000,
      civilMorale: 8,
      disasterLevel: -6,
      corruptionLevel: -4,
    },
  },
  military: {
    text: "调兵守边并开拓讨伐敌军，补发军饷",
    effects: {
      treasury: -180000,
      militaryStrength: 10,
      borderThreat: -8,
      civilMorale: 2,
      hostileDamage: { hostile_1: 6 },
    },
  },
  fiscal: {
    text: "推行税制改革并整顿漕运税收",
    effects: {
      treasury: 220000,
      civilMorale: -4,
      corruptionLevel: -1,
    },
  },
};

function* decisionPlan(mode) {
  const order = mode === "war" ? ["military", "fiscal", "military", "relief"] : mode === "welfare" ? ["relief", "fiscal", "relief", "military"] : ["fiscal", "military", "relief", "fiscal"];
  let i = 0;
  while (true) {
    yield CHOICES[order[i % order.length]];
    i += 1;
  }
}

function runSimulation(name, unlockedPolicies, mode, months = 24) {
  let state = makeBaseState(unlockedPolicies);
  const states = [JSON.parse(JSON.stringify(state))];
  const planner = decisionPlan(mode);

  for (let i = 0; i < months; i += 1) {
    let nextMonth = (state.currentMonth || 1) + 1;
    let nextYear = state.currentYear || 1;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    const choice = planner.next().value;
    const resolved = resolveTurn(state, choice, nextYear, nextMonth);
    state = {
      ...resolved.state,
      currentMonth: nextMonth,
      currentYear: nextYear,
    };
    states.push(JSON.parse(JSON.stringify(state)));
  }

  return summarize(name, states);
}

const baselinePolicies = normalizeUnlockedPolicies([]);
const midPolicies = normalizeUnlockedPolicies(POLICY_CATALOG.slice(0, 22).map((p) => p.id));
const fullPolicies = normalizeUnlockedPolicies(POLICY_CATALOG.map((p) => p.id));

const report = [
  runSimulation("A-Default-Blend", baselinePolicies, "blend"),
  runSimulation("B-Mid-WarBias", midPolicies, "war"),
  runSimulation("C-Full-Welfare", fullPolicies, "welfare"),
];

console.log("=== Balance Simulation (24 months) ===");
for (const row of report) {
  console.log(JSON.stringify(row));
}
