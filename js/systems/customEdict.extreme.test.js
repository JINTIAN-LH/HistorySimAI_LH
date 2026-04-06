import { beforeEach, describe, expect, it } from "vitest";
import { getState, resetState, setState } from "../state.js";
import { deriveAppointmentEffectsFromText, normalizeAppointmentEffects } from "../utils/appointmentEffects.js";
import { applyEffects, estimateEffectsFromEdict } from "./storySystem.js";

const positionsMeta = {
  positions: [
    { id: "neige_shoufu", name: "内阁首辅", department: "neige" },
    { id: "hubu_shangshu", name: "户部尚书", department: "hubu" },
    { id: "bingbu_shangshu", name: "兵部尚书", department: "bingbu" },
  ],
  departments: [
    { id: "neige", moduleId: "neige" },
    { id: "hubu", moduleId: "liubu" },
    { id: "bingbu", moduleId: "liubu" },
  ],
};

const roster = [
  { id: "wen_tiren", name: "温体仁", loyalty: 45, isAlive: true },
  { id: "bi_ziyan", name: "毕自严", loyalty: 50, isAlive: true },
  { id: "sun_chengzong", name: "孙承宗", loyalty: 60, isAlive: true },
];

function setupScenario() {
  resetState();
  setState({
    positionsMeta,
    allCharacters: roster,
    ministers: roster,
    nation: {
      ...getState().nation,
      treasury: 500000,
      grain: 30000,
      militaryStrength: 60,
      civilMorale: 35,
      borderThreat: 75,
      disasterLevel: 70,
      corruptionLevel: 80,
    },
    appointments: {
      neige_shoufu: "wen_tiren",
      hubu_shangshu: "bi_ziyan",
    },
    characterStatus: {
      wen_tiren: { isAlive: true, deathReason: null, deathDay: null },
      bi_ziyan: { isAlive: true, deathReason: null, deathDay: null },
      sun_chengzong: { isAlive: true, deathReason: null, deathDay: null },
    },
    storyHistory: [],
    lastChoiceId: null,
  });
}

function buildCustomEdictEffects(text) {
  const state = getState();
  const derived = deriveAppointmentEffectsFromText(text, {
    positions: positionsMeta.positions,
    ministers: roster,
    currentAppointments: state.appointments || {},
  });
  const estimated = estimateEffectsFromEdict(text) || {};
  const merged = {
    ...(derived || {}),
  };

  ["treasury", "grain", "militaryStrength", "civilMorale", "borderThreat", "disasterLevel", "corruptionLevel"].forEach((key) => {
    if (typeof merged[key] === "number") return;
    if (typeof estimated[key] !== "number") return;
    merged[key] = estimated[key];
  });

  return normalizeAppointmentEffects(merged, {
    positions: positionsMeta.positions,
    ministers: roster,
  });
}

describe("custom edict extreme cases", () => {
  beforeEach(() => {
    setupScenario();
  });

  it("applies multiple appointments from one edict without cross-binding ministers", () => {
    const effects = buildCustomEdictEffects("任命孙承宗为兵部尚书，任命毕自严为内阁首辅");
    applyEffects(effects);

    const state = getState();
    expect(state.appointments).toEqual({
      neige_shoufu: "bi_ziyan",
      bingbu_shangshu: "sun_chengzong",
    });
  });

  it("handles dismiss-then-appoint flow as a final office replacement", () => {
    const effects = buildCustomEdictEffects("免去温体仁内阁首辅，任命毕自严为内阁首辅");
    applyEffects(effects);

    const state = getState();
    expect(state.appointments).toEqual({
      neige_shoufu: "bi_ziyan",
    });
  });

  it("applies appointment, execution, and numeric adjustments in a single edict", () => {
    const effects = buildCustomEdictEffects("赐死温体仁，任命毕自严为内阁首辅，并发军饷");
    applyEffects(effects);

    const state = getState();
    expect(state.appointments).toEqual({
      neige_shoufu: "bi_ziyan",
    });
    expect(state.characterStatus.wen_tiren).toMatchObject({
      isAlive: false,
      deathReason: "赐死",
    });
    expect(state.nation).toMatchObject({
      treasury: 300000,
      militaryStrength: 68,
      civilMorale: 38,
    });
  });
});
