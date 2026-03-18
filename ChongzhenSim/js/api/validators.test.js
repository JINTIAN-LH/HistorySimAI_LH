import { describe, it, expect } from "vitest";
import { normalizeStoryPayload, sanitizeStoryEffects } from "./validators.js";

describe("sanitizeStoryEffects", () => {
  it("should clamp unreasonable numeric deltas", () => {
    const out = sanitizeStoryEffects({
      treasury: 9999999,
      grain: -999999,
      civilMorale: 80,
      borderThreat: -80,
      corruptionLevel: -50,
      loyalty: { a: 99, b: -99 },
      hostileDamage: { x: 100, y: -100 },
    });

    expect(out.treasury).toBe(300000);
    expect(out.grain).toBe(-30000);
    expect(out.civilMorale).toBe(12);
    expect(out.borderThreat).toBe(-12);
    expect(out.corruptionLevel).toBe(-12);
    expect(out.loyalty.a).toBe(10);
    expect(out.loyalty.b).toBe(-10);
    expect(out.hostileDamage.x).toBe(25);
    expect(out.hostileDamage.y).toBe(-25);
  });
});

describe("normalizeStoryPayload", () => {
  it("should sanitize choice effects from LLM payload", () => {
    const parsed = {
      storyParagraphs: ["test"],
      choices: [
        {
          id: "c1",
          text: "test choice",
          effects: {
            treasury: 9999999,
            civilMorale: -100,
          },
        },
      ],
    };

    const normalized = normalizeStoryPayload(parsed, { nation: {} });
    expect(normalized).toBeTruthy();
    expect(normalized.choices[0].effects.treasury).toBe(300000);
    expect(normalized.choices[0].effects.civilMorale).toBe(-12);
  });
});
