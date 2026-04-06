import { describe, expect, it } from "vitest";
import { extractCustomPoliciesFromEdict, computeCustomPolicyQuarterBonus } from "./coreGameplaySystem.js";
import { computeQuarterlyEffects } from "./storySystem.js";
import { buildCustomPolicyQuarterNews } from "./turnSystem.js";

function createQuarterState(customPolicies) {
  return {
    currentYear: 3,
    currentMonth: 6,
    customPolicies,
    nation: {
      treasury: 500000,
      grain: 30000,
      militaryStrength: 60,
      civilMorale: 35,
      borderThreat: 75,
      disasterLevel: 70,
      corruptionLevel: 80,
    },
    playerAbilities: {
      management: 0,
      scholarship: 0,
      military: 0,
      politics: 0,
    },
    unlockedPolicies: [],
    config: {},
  };
}

describe("custom edict quarterly follow-up", () => {
  it("keeps fiscal custom policy quarter news aligned with computed bonus values", () => {
    const customPolicies = extractCustomPoliciesFromEdict("设立海贸试榷，定为国策", 3, 5);
    const state = createQuarterState(customPolicies);

    const quarterEffects = computeQuarterlyEffects(state, 6);
    const customBonus = computeCustomPolicyQuarterBonus(state);
    const news = buildCustomPolicyQuarterNews(customPolicies.length, quarterEffects._customPolicyBonus);

    expect(customPolicies).toHaveLength(1);
    expect(customPolicies[0].category).toBe("fiscal");
    expect(customBonus).toMatchObject({
      treasuryRatio: 1.04,
      grainRatio: 1,
      militaryDelta: 0,
      corruptionDelta: 0,
    });
    expect(quarterEffects._customPolicyBonus).toEqual(customBonus);
    expect(news?.summary).toContain("财政系数 x1.04");
    expect(news?.summary).toContain("粮储系数 x1.00");
    expect(news?.summary).toContain("军力 +0");
    expect(news?.summary).toContain("贪腐 0");
  });

  it("keeps military custom policy quarter news aligned with computed military delta", () => {
    const customPolicies = extractCustomPoliciesFromEdict("设立边军轮训，定为国策", 3, 5);
    const state = createQuarterState(customPolicies);

    const quarterEffects = computeQuarterlyEffects(state, 6);
    const news = buildCustomPolicyQuarterNews(customPolicies.length, quarterEffects._customPolicyBonus);

    expect(customPolicies).toHaveLength(1);
    expect(customPolicies[0].category).toBe("military");
    expect(quarterEffects.militaryStrength).toBe(1);
    expect(quarterEffects._customPolicyBonus).toMatchObject({
      treasuryRatio: 1,
      grainRatio: 1,
      militaryDelta: 1,
      corruptionDelta: 0,
    });
    expect(news?.summary).toContain("财政系数 x1.00");
    expect(news?.summary).toContain("粮储系数 x1.00");
    expect(news?.summary).toContain("军力 +1");
    expect(news?.summary).toContain("贪腐 0");
  });
});
