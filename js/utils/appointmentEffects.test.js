import { describe, expect, it } from "vitest";
import { deriveAppointmentEffectsFromText, deriveAppointmentStateEffects, mergeDerivedAppointmentStateEffects, normalizeAppointmentEffects } from "./appointmentEffects.js";

const context = {
  positions: [
    { id: "neige_shoufu", name: "内阁首辅" },
    { id: "hubu_shangshu", name: "户部尚书" },
    { id: "bingbu_shangshu", name: "兵部尚书", department: "bingbu", importance: 9 },
    { id: "liaodong_zongbing", name: "辽东总兵", department: "military", importance: 9 },
  ],
  ministers: [
    { id: "wen_tiren", name: "温体仁" },
    { id: "bi_ziyan", name: "毕自严" },
    { id: "sun_chengzong", name: "孙承宗" },
  ],
  currentAppointments: {
    neige_shoufu: "wen_tiren",
    hubu_shangshu: "bi_ziyan",
  },
};

describe("deriveAppointmentEffectsFromText", () => {
  it("should parse appoint and dismiss semantics from custom edict text", () => {
    const out = deriveAppointmentEffectsFromText("免去温体仁内阁首辅，任命毕自严为内阁首辅", context);
    expect(out).toEqual({
      appointments: { neige_shoufu: "bi_ziyan" },
    });
  });

  it("should dismiss current holder when text dismisses a minister without explicit position", () => {
    const out = deriveAppointmentEffectsFromText("即刻免去毕自严职务", context);
    expect(out).toEqual({
      appointmentDismissals: ["hubu_shangshu"],
    });
  });

  it("should return null for non-appointment semantic text", () => {
    const out = deriveAppointmentEffectsFromText("命工部核查仓储账册，不涉任免", context);
    expect(out).toBeNull();
  });

  it("should extract character death from '赐死' keyword", () => {
    const out = deriveAppointmentEffectsFromText("赐死温体仁，以示朝纲严明", context);
    expect(out).toEqual({
      characterDeath: { wen_tiren: "赐死" },
    });
  });

  it("should parse combined appointment, dismissal, and death in one text", () => {
    const out = deriveAppointmentEffectsFromText("免去温体仁，赐予自尽；任命毕自严为内阁首辅", context);
    expect(out).toEqual({
      characterDeath: { wen_tiren: "赐死" },
      appointments: { neige_shoufu: "bi_ziyan" },
    });
  });

  it("should not bind one minister across multiple appointment clauses", () => {
    const out = deriveAppointmentEffectsFromText(
      "任命孙承宗为兵部尚书，任命毕自严为内阁首辅",
      {
        ...context,
        positions: [...context.positions, { id: "bingbu_shangshu", name: "兵部尚书" }],
        ministers: [...context.ministers, { id: "sun_chengzong", name: "孙承宗" }],
      }
    );

    expect(out).toEqual({
      appointments: {
        bingbu_shangshu: "sun_chengzong",
        neige_shoufu: "bi_ziyan",
      },
    });
  });

  it("should keep compatibility with compact multi-appointment wording", () => {
    const out = deriveAppointmentEffectsFromText(
      "任命孙承宗、毕自严分别为兵部尚书、内阁首辅",
      {
        ...context,
        positions: [...context.positions, { id: "bingbu_shangshu", name: "兵部尚书" }],
        ministers: [...context.ministers, { id: "sun_chengzong", name: "孙承宗" }],
      }
    );

    expect(out).toEqual({
      appointments: {
        bingbu_shangshu: "sun_chengzong",
        neige_shoufu: "bi_ziyan",
      },
    });
  });
});

describe("normalizeAppointmentEffects", () => {
  it("should normalize appointments from names to canonical ids", () => {
    const out = normalizeAppointmentEffects(
      {
        appointments: {
          "户部尚书": "温体仁",
          neige_shoufu: "毕自严",
        },
      },
      context
    );

    expect(out).toEqual({
      appointments: {
        hubu_shangshu: "wen_tiren",
        neige_shoufu: "bi_ziyan",
      },
    });
  });

  it("should normalize dismissal names to canonical position ids", () => {
    const out = normalizeAppointmentEffects(
      {
        appointmentDismissals: ["户部尚书", "neige_shoufu", "不存在官职"],
      },
      context
    );

    expect(out).toEqual({
      appointmentDismissals: ["hubu_shangshu", "neige_shoufu"],
    });
  });
});

describe("deriveAppointmentStateEffects", () => {
  it("adds military strength when filling a military office", () => {
    const out = deriveAppointmentStateEffects(
      {
        appointments: { bingbu_shangshu: "sun_chengzong" },
      },
      context
    );

    expect(out).toEqual({ militaryStrength: 5 });
  });

  it("does not create military gain when only reassigning a civilian office", () => {
    const out = deriveAppointmentStateEffects(
      {
        appointments: { neige_shoufu: "bi_ziyan" },
      },
      context
    );

    expect(out).toBeNull();
  });
});

describe("mergeDerivedAppointmentStateEffects", () => {
  it("merges derived military gain into existing effects", () => {
    const out = mergeDerivedAppointmentStateEffects(
      {
        treasury: -1000,
        appointments: { bingbu_shangshu: "sun_chengzong" },
      },
      context
    );

    expect(out).toEqual({
      treasury: -1000,
      appointments: { bingbu_shangshu: "sun_chengzong" },
      militaryStrength: 5,
    });
  });
});
