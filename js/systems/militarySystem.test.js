import { describe, expect, it } from "vitest";
import {
  isMilitaryCombatChoice,
  buildBattleEffectsPatch,
  resolveBattleRound,
  buildEnemyUnits,
  buildInitialSession,
  deriveWeatherFromText,
  UNIT_TYPES,
  FORMATIONS,
} from "./militarySystem.js";
import { resolveHostileForcesAfterChoice } from "./coreGameplaySystem.js";

/* ──────────────────────────────────────────────
   辅助工厂
   ────────────────────────────────────────────── */
function makeSession(overrides = {}) {
  return {
    round: 1,
    maxRounds: 3,
    formation: "phalanx",
    terrain: "plain",
    initialPlayerCount: 5000,
    playerUnits: [
      { unitId: "infantry_spear", count: 2500, morale: 75 },
      { unitId: "cavalry_guanning", count: 1000, morale: 80 },
      { unitId: "firearm", count: 1000, morale: 65 },
      { unitId: "artillery", count: 500, morale: 60 },
    ],
    enemyUnits: [
      { unitId: "infantry_spear", count: 3000, morale: 65 },
      { unitId: "cavalry_guanning", count: 1250, morale: 70 },
      { unitId: "firearm", count: 750, morale: 55 },
    ],
    roundHistory: [],
    ...overrides,
  };
}

function makeBaseState(militaryAbility = 0) {
  return {
    hostileForces: [
      { id: "li_zicheng", name: "李自成", power: 60, isDefeated: false },
    ],
    playerAbilities: { military: militaryAbility },
    nation: { borderThreat: 50, militaryStrength: 60 },
  };
}

/* ──────────────────────────────────────────────
   1. isMilitaryCombatChoice
   ────────────────────────────────────────────── */
describe("isMilitaryCombatChoice", () => {
  const state = makeBaseState();

  it("returns false when no active hostile forces exist", () => {
    const emptyState = { ...state, hostileForces: [] };
    expect(isMilitaryCombatChoice("any", "征讨敌军", emptyState)).toBe(false);
  });

  it("returns false for all-defeated hostiles", () => {
    const defeatedState = {
      ...state,
      hostileForces: [{ id: "x", name: "x", power: 10, isDefeated: true }],
    };
    expect(isMilitaryCombatChoice("any", "征讨敌军", defeatedState)).toBe(false);
  });

  it("returns true when choice text contains military keywords", () => {
    const keywords = ["军事", "征讨", "围剿", "剿灭", "北伐", "平叛", "出征", "攻打", "进剿", "开拓"];
    keywords.forEach((kw) => {
      expect(isMilitaryCombatChoice("any", `发动${kw}行动`, state)).toBe(true);
    });
  });

  it("returns false for non-military diplomatic text", () => {
    expect(isMilitaryCombatChoice("any", "派使者议和，安抚民心", state)).toBe(false);
  });

  it("returns true for military_expansion_auto choiceId regardless of text", () => {
    expect(isMilitaryCombatChoice("military_expansion_auto", "什么都没写", state)).toBe(true);
  });
});

/* ──────────────────────────────────────────────
   2. buildEnemyUnits
   ────────────────────────────────────────────── */
describe("buildEnemyUnits", () => {
  it("scales enemy count with force power", () => {
    const weak = buildEnemyUnits({ power: 10 });
    const strong = buildEnemyUnits({ power: 100 });
    const weakTotal = weak.reduce((s, u) => s + u.count, 0);
    const strongTotal = strong.reduce((s, u) => s + u.count, 0);
    expect(strongTotal).toBeGreaterThan(weakTotal);
  });

  it("returns three unit types", () => {
    const units = buildEnemyUnits({ power: 50 });
    expect(units).toHaveLength(3);
    expect(units.map((u) => u.unitId)).toContain("infantry_spear");
    expect(units.map((u) => u.unitId)).toContain("cavalry_guanning");
    expect(units.map((u) => u.unitId)).toContain("firearm");
  });

  it("clamps power to [10, 100]", () => {
    const low = buildEnemyUnits({ power: 1 }); // 1 是最小非零正整数，被夹山到 10
    const high = buildEnemyUnits({ power: 200 });
    const mid = buildEnemyUnits({ power: 50 });
    const lowTotal = low.reduce((s, u) => s + u.count, 0);
    const highTotal = high.reduce((s, u) => s + u.count, 0);
    // power 0 clamped to 10, power 200 clamped to 100 — counts should differ
    expect(highTotal).toBeGreaterThan(lowTotal);
    // mid total should be between low and high
    expect(mid.reduce((s, u) => s + u.count, 0)).toBeGreaterThan(lowTotal);
  });
});

/* ──────────────────────────────────────────────
   3. buildInitialSession
   ────────────────────────────────────────────── */
describe("buildInitialSession", () => {
  const force = { id: "li_zicheng", name: "李自成", power: 60 };
  const choice = { text: "出征征讨李自成", effects: {} };

  it("stores initialPlayerCount matching playerUnits total", () => {
    const state = makeBaseState(0);
    const session = buildInitialSession(state, force, choice);
    const unitTotal = session.playerUnits.reduce((s, u) => s + u.count, 0);
    expect(session.initialPlayerCount).toBe(unitTotal);
  });

  it("scales initialPlayerCount with military ability", () => {
    const s0 = buildInitialSession(makeBaseState(0), force, choice);
    const s5 = buildInitialSession(makeBaseState(5), force, choice);
    expect(s5.initialPlayerCount).toBeGreaterThan(s0.initialPlayerCount);
  });

  it("derives terrain from choice text", () => {
    const mountainChoice = { text: "在山地伏击", effects: {} };
    const cityChoice = { text: "攻城拔寨", effects: {} };
    const plainChoice = { text: "野外决战", effects: {} };
    expect(buildInitialSession(makeBaseState(), force, mountainChoice).terrain).toBe("mountain");
    expect(buildInitialSession(makeBaseState(), force, cityChoice).terrain).toBe("city");
    expect(buildInitialSession(makeBaseState(), force, plainChoice).terrain).toBe("plain");
  });
});

/* ──────────────────────────────────────────────
   4. resolveBattleRound — 基础攻防逻辑
   ────────────────────────────────────────────── */
describe("resolveBattleRound — basic", () => {
  it("returns ongoing when neither side is defeated in early rounds", () => {
    const session = makeSession({ round: 1, maxRounds: 3 });
    const result = resolveBattleRound(session, "advance");
    expect(result.outcome).toBe("ongoing");
  });

  it("reduces enemy count after player attack", () => {
    const session = makeSession();
    const result = resolveBattleRound(session, "advance");
    const afterTotal = result.updatedEnemy.reduce((s, u) => s + u.count, 0);
    const beforeTotal = session.enemyUnits.reduce((s, u) => s + u.count, 0);
    expect(afterTotal).toBeLessThan(beforeTotal);
  });

  it("reduces player count when enemy retaliates", () => {
    const session = makeSession();
    const result = resolveBattleRound(session, "advance");
    const afterTotal = result.updatedPlayer.reduce((s, u) => s + u.count, 0);
    const beforeTotal = session.playerUnits.reduce((s, u) => s + u.count, 0);
    expect(afterTotal).toBeLessThan(beforeTotal);
  });

  it("declares victory when enemy morale collapses", () => {
    const session = makeSession({
      enemyUnits: [{ unitId: "infantry_spear", count: 1, morale: 18 }],
    });
    const result = resolveBattleRound(session, "advance");
    expect(result.outcome).toBe("victory");
  });

  it("declares defeat when player morale collapses", () => {
    const session = makeSession({
      round: 3,
      maxRounds: 3,
      playerUnits: [{ unitId: "infantry_spear", count: 1, morale: 10 }],
    });
    const result = resolveBattleRound(session, "hold");
    expect(result.outcome).toBe("defeat");
  });
});

/* ──────────────────────────────────────────────
   5. resolveBattleRound — 决策效果验证
   ────────────────────────────────────────────── */
describe("resolveBattleRound — decisions", () => {
  it("hold grants +5 morale to player units", () => {
    const before = makeSession({ playerUnits: [{ unitId: "infantry_spear", count: 2000, morale: 70 }] });
    const result = resolveBattleRound(before, "hold");
    // morale = 70 - (small loss * 60) + 5; should be > raw without hold
    const holdMorale = result.updatedPlayer[0].morale;
    const advanceResult = resolveBattleRound(before, "advance");
    const advanceMorale = advanceResult.updatedPlayer[0].morale;
    expect(holdMorale).toBeGreaterThanOrEqual(advanceMorale);
  });

  it("charge applies chargeBonus to cavalry attack", () => {
    const cavalryOnly = makeSession({
      playerUnits: [{ unitId: "cavalry_guanning", count: 5000, morale: 80 }],
    });
    const chargeResult = resolveBattleRound(cavalryOnly, "charge");
    const advanceResult = resolveBattleRound(cavalryOnly, "advance");
    expect(chargeResult.playerDmgDealt).toBeGreaterThan(advanceResult.playerDmgDealt);
  });

  it("flank reduces player defense (more player casualties vs advance)", () => {
    // 敲使兵力较小，避免双方損失均触到 0.25 上限
    const session = makeSession({
      playerUnits: [{ unitId: "infantry_spear", count: 3000, morale: 75 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 300, morale: 65 }],
    });
    const flankResult = resolveBattleRound(session, "flank");
    const advanceResult = resolveBattleRound(session, "advance");
    const flankPlayerTotal = flankResult.updatedPlayer.reduce((s, u) => s + u.count, 0);
    const advancePlayerTotal = advanceResult.updatedPlayer.reduce((s, u) => s + u.count, 0);
    expect(flankPlayerTotal).toBeLessThan(advancePlayerTotal);
  });

  it("flank reduces enemy morale more than advance", () => {
    const session = makeSession({
      playerUnits: [{ unitId: "infantry_spear", count: 3000, morale: 75 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 1000, morale: 80 }],
    });
    const flankResult = resolveBattleRound(session, "flank");
    const advanceResult = resolveBattleRound(session, "advance");
    const flankAvgMorale = flankResult.updatedEnemy.reduce((s, u) => s + u.morale, 0) / flankResult.updatedEnemy.length;
    const advanceAvgMorale = advanceResult.updatedEnemy.reduce((s, u) => s + u.morale, 0) / advanceResult.updatedEnemy.length;
    expect(flankAvgMorale).toBeLessThan(advanceAvgMorale);
  });
});

/* ──────────────────────────────────────────────
   6. resolveBattleRound — 兵种克制系统
   ────────────────────────────────────────────── */
describe("resolveBattleRound — counter system", () => {
  it("infantry_spear vs cavalry_guanning: spear counters cavalry (more damage)", () => {
    const withSpear = makeSession({
      playerUnits: [{ unitId: "infantry_spear", count: 5000, morale: 80 }],
      enemyUnits: [{ unitId: "cavalry_guanning", count: 5000, morale: 70 }],
    });
    const withFirearm = makeSession({
      playerUnits: [{ unitId: "firearm", count: 5000, morale: 80 }],
      enemyUnits: [{ unitId: "cavalry_guanning", count: 5000, morale: 70 }],
    });
    const spearResult = resolveBattleRound(withSpear, "advance");
    const firearmResult = resolveBattleRound(withFirearm, "advance");
    // spear counters cavalry, firearm is weak against cavalry
    expect(spearResult.playerDmgDealt).toBeGreaterThan(firearmResult.playerDmgDealt);
  });

  it("firearm vs infantry_spear: firearm counters infantry (more damage than spear vs spear)", () => {
    const firearmVsSpear = makeSession({
      playerUnits: [{ unitId: "firearm", count: 5000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 5000, morale: 70 }],
    });
    const spearVsSpear = makeSession({
      playerUnits: [{ unitId: "infantry_spear", count: 5000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 5000, morale: 70 }],
    });
    const firearmResult = resolveBattleRound(firearmVsSpear, "advance");
    const spearResult = resolveBattleRound(spearVsSpear, "advance");
    // firearm counters infantry_spear
    expect(firearmResult.playerDmgDealt).toBeGreaterThan(spearResult.playerDmgDealt);
  });

  it("unit weak_against enemy deals less damage", () => {
    // firearm is weak against cavalry_guanning
    const firearmVsCav = makeSession({
      playerUnits: [{ unitId: "firearm", count: 5000, morale: 80 }],
      enemyUnits: [{ unitId: "cavalry_guanning", count: 1000, morale: 70 }],
    });
    // firearm vs infantry_spear (no weakness)
    const firearmVsSpear = makeSession({
      playerUnits: [{ unitId: "firearm", count: 5000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 1000, morale: 70 }],
    });
    const cavResult = resolveBattleRound(firearmVsCav, "advance");
    const spearResult = resolveBattleRound(firearmVsSpear, "advance");
    // firearm weak against cavalry → less damage
    expect(cavResult.playerDmgDealt).toBeLessThan(spearResult.playerDmgDealt);
  });
});

/* ──────────────────────────────────────────────
   7. resolveBattleRound — 火铳装填冷却
   ────────────────────────────────────────────── */
describe("resolveBattleRound — firearm reload", () => {
  it("firearm skips attack on even rounds", () => {
    const firearmOnly = makeSession({
      round: 2, // even = reload
      playerUnits: [{ unitId: "firearm", count: 3000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 3000, morale: 65 }],
    });
    const oddSession = makeSession({
      round: 1, // odd = fire
      playerUnits: [{ unitId: "firearm", count: 3000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 3000, morale: 65 }],
    });
    const evenResult = resolveBattleRound(firearmOnly, "advance");
    const oddResult = resolveBattleRound(oddSession, "advance");
    expect(oddResult.playerDmgDealt).toBeGreaterThan(evenResult.playerDmgDealt);
  });
});

/* ──────────────────────────────────────────────
   8. resolveBattleRound — 炮兵范围伤害
   ────────────────────────────────────────────── */
describe("resolveBattleRound — artillery area damage", () => {
  it("artillery deals more damage than same-count infantry", () => {
    const artillerySession = makeSession({
      playerUnits: [{ unitId: "artillery", count: 500, morale: 70 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 3000, morale: 65 }],
    });
    const infantrySession = makeSession({
      playerUnits: [{ unitId: "infantry_spear", count: 500, morale: 70 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 3000, morale: 65 }],
    });
    const artResult = resolveBattleRound(artillerySession, "advance");
    const infResult = resolveBattleRound(infantrySession, "advance");
    // artillery: attack 20 * 1.3 area * 1.4 counter > infantry: attack 8
    expect(artResult.playerDmgDealt).toBeGreaterThan(infResult.playerDmgDealt);
  });
});

/* ──────────────────────────────────────────────
   9. resolveBattleRound — 阵型效果
   ────────────────────────────────────────────── */
describe("resolveBattleRound — formations", () => {
  it("wagon_circle (highest defenseMod) results in fewer player casualties than scattered", () => {
    // 使用冷静小兵力避免 0.25 截断压平防御差异
    const wagonSession = makeSession({
      formation: "wagon_circle",
      playerUnits: [{ unitId: "infantry_spear", count: 3000, morale: 75 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 300, morale: 65 }],
    });
    const scatteredSession = makeSession({
      formation: "scattered",
      playerUnits: [{ unitId: "infantry_spear", count: 3000, morale: 75 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 300, morale: 65 }],
    });
    const wagonResult = resolveBattleRound(wagonSession, "advance");
    const scatteredResult = resolveBattleRound(scatteredSession, "advance");
    const wagonTotal = wagonResult.updatedPlayer.reduce((s, u) => s + u.count, 0);
    const scatteredTotal = scatteredResult.updatedPlayer.reduce((s, u) => s + u.count, 0);
    expect(wagonTotal).toBeGreaterThan(scatteredTotal);
  });

  it("wedge (highest attackMod) deals more damage than wagon_circle", () => {
    const wedgeSession = makeSession({ formation: "wedge" });
    const wagonSession = makeSession({ formation: "wagon_circle" });
    const wedgeResult = resolveBattleRound(wedgeSession, "advance");
    const wagonResult = resolveBattleRound(wagonSession, "advance");
    expect(wedgeResult.playerDmgDealt).toBeGreaterThan(wagonResult.playerDmgDealt);
  });
});

/* ──────────────────────────────────────────────
   10. resolveBattleRound — 地形效果
   ────────────────────────────────────────────── */
describe("resolveBattleRound — terrain", () => {
  it("mountain terrain reduces player attack output", () => {
    const mountainSession = makeSession({ terrain: "mountain" });
    const plainSession = makeSession({ terrain: "plain" });
    const mountainResult = resolveBattleRound(mountainSession, "advance");
    const plainResult = resolveBattleRound(plainSession, "advance");
    expect(mountainResult.playerDmgDealt).toBeLessThan(plainResult.playerDmgDealt);
  });

  it("city terrain boosts player attack output vs plain", () => {
    const citySession = makeSession({ terrain: "city" });
    const plainSession = makeSession({ terrain: "plain" });
    const cityResult = resolveBattleRound(citySession, "advance");
    const plainResult = resolveBattleRound(plainSession, "advance");
    expect(cityResult.playerDmgDealt).toBeGreaterThan(plainResult.playerDmgDealt);
  });
});

/* ──────────────────────────────────────────────
   11. buildBattleEffectsPatch — effectsPatch修补
   ────────────────────────────────────────────── */
describe("buildBattleEffectsPatch", () => {
  // 每次新建避免测试间共享引用导致的对象内容污染
  function makeBaseChoice() {
    return {
      effects: {
        hostileDamage: { li_zicheng: 10 },
        borderThreat: -2,
        civilMorale: 0,
      },
    };
  }

  it("victory: increases hostileDamage", () => {
    const patch = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.9, playerMoraleAvg: 75, targetId: "li_zicheng" },
      makeBaseChoice()
    );
    expect(patch.hostileDamage.li_zicheng).toBeGreaterThan(10);
  });

  it("victory: reduces borderThreat", () => {
    const patch = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.9, playerMoraleAvg: 75, targetId: "li_zicheng" },
      makeBaseChoice()
    );
    expect(patch.borderThreat).toBeLessThan(-2);
  });

  it("defeat: clamps hostileDamage down", () => {
    const patch = buildBattleEffectsPatch(
      { outcome: "defeat", survivorRatio: 0.5, playerMoraleAvg: 40, targetId: "li_zicheng" },
      makeBaseChoice()
    );
    expect(patch.hostileDamage.li_zicheng).toBeLessThan(10);
    expect(patch.hostileDamage.li_zicheng).toBeGreaterThanOrEqual(0);
  });

  it("defeat: increases borderThreat", () => {
    const patch = buildBattleEffectsPatch(
      { outcome: "defeat", survivorRatio: 0.5, playerMoraleAvg: 40, targetId: "li_zicheng" },
      makeBaseChoice()
    );
    expect(patch.borderThreat).toBeGreaterThan(-2);
  });

  it("preserves non-standard effect fields untouched", () => {
    const choiceWithExtra = {
      effects: {
        hostileDamage: { li_zicheng: 5 },
        triggerEvent: "some_event",
        appointments: { hubu_shangshu: "zhang_wei" },
      },
    };
    const patch = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.85, playerMoraleAvg: 70 },
      choiceWithExtra
    );
    expect(patch.triggerEvent).toBe("some_event");
    expect(patch.appointments).toEqual({ hubu_shangshu: "zhang_wei" });
  });

  it("victory with existing positive militaryStrength is not clamped to 0", () => {
    const choiceWithBonus = {
      effects: { militaryStrength: 5 },
    };
    // High survivor ratio → tiny penalty (e.g. −1 or −2)
    const patch = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.95, playerMoraleAvg: 80 },
      choiceWithBonus
    );
    // Should not be clamped to 0; 5 + small_negative > 0
    expect(patch.militaryStrength).toBeGreaterThan(0);
  });

  it("high casualty defeat applies significant militaryStrength penalty", () => {
    const patch = buildBattleEffectsPatch(
      { outcome: "defeat", survivorRatio: 0.2, playerMoraleAvg: 30 },
      { effects: {} }
    );
    expect(patch.militaryStrength).toBeLessThan(0);
    expect(patch.militaryStrength).toBeGreaterThanOrEqual(-20);
  });

  it("synthesises hostileDamage map when choice has none but targetId provided", () => {
    const patch = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.9, playerMoraleAvg: 70, targetId: "wu_sangui" },
      { effects: {} }
    );
    expect(patch.hostileDamage).toBeDefined();
    expect(patch.hostileDamage.wu_sangui).toBeGreaterThan(0);
  });
});

/* ──────────────────────────────────────────────
   12. 端到端循环验证 — 军事战斗结果 → 敌对势力值
   ────────────────────────────────────────────── */

/** 完整状态，兼容 resolveHostileForcesAfterChoice 所有字段 */
function makeFullState(power = 60, militaryAbility = 0) {
  return {
    hostileForces: [
      { id: "li_zicheng", name: "李自成", leader: "李自成", power, isDefeated: false },
    ],
    playerAbilities: { military: militaryAbility },
    nation: { borderThreat: 50, militaryStrength: 60 },
    unlockedPolicies: [],
    systemNewsToday: [],
    closedStorylines: [],
  };
}

describe("循环验证 — 胜利削减敌对势力值", () => {
  it("胜利后通过 effectsPatch 传入 resolveHostileForcesAfterChoice 使势力值下降", () => {
    const state = makeFullState(60);
    const choice = { effects: { hostileDamage: { li_zicheng: 10 } } };
    const effectsPatch = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.9, playerMoraleAvg: 75, targetId: "li_zicheng" },
      choice
    );
    // effectsPatch.hostileDamage.li_zicheng = 10 + damageBonus (≥8)
    expect(effectsPatch.hostileDamage.li_zicheng).toBeGreaterThan(10);

    const out = resolveHostileForcesAfterChoice(state, "出师征讨李自成", effectsPatch, 15, 3);
    expect(out).not.toBeNull();
    const updatedPower = out.statePatch.hostileForces[0].power;
    expect(updatedPower).toBeLessThan(60);
    // 精确断言：60 - (10 + damageBonus)，damageBonus = min(20, 8 + round(75/10)) = 16
    expect(updatedPower).toBe(60 - effectsPatch.hostileDamage.li_zicheng);
  });

  it("胜利产生的 effectsPatch 包含负 borderThreat，循环后势力值与边境威胁协同下降", () => {
    const state = makeFullState(50);
    const choice = { effects: { hostileDamage: { li_zicheng: 8 }, borderThreat: 0 } };
    const effectsPatch = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.85, playerMoraleAvg: 70, targetId: "li_zicheng" },
      choice
    );
    expect(effectsPatch.borderThreat).toBeLessThan(0);

    const out = resolveHostileForcesAfterChoice(state, "出师征讨李自成", effectsPatch, 15, 4);
    expect(out).not.toBeNull();
    expect(out.statePatch.hostileForces[0].power).toBeLessThan(50);
    // resolveHostileForces 也会叠加自己的 borderThreat 减量
    expect(out.effectsPatch.borderThreat).toBeLessThan(0);
  });
});

describe("循环验证 — 失败对势力值的影响", () => {
  it("失败后 effectsPatch.borderThreat > 2 触发 isMilitaryFailureText，敌对势力反弹", () => {
    const state = makeFullState(60);
    const choice = { effects: { hostileDamage: { li_zicheng: 10 } } };
    const effectsPatch = buildBattleEffectsPatch(
      { outcome: "defeat", survivorRatio: 0.5, playerMoraleAvg: 40, targetId: "li_zicheng" },
      choice
    );
    // defeat 产生 borderThreat +5，resolveHostileForcesAfterChoice 中
    // isMilitaryFailureText 检测到 borderThreat > 2 → 触发反弹路径
    expect(effectsPatch.borderThreat).toBeGreaterThan(2);

    const out = resolveHostileForcesAfterChoice(state, "出师征讨李自成", effectsPatch, 15, 3);
    expect(out).not.toBeNull();
    // 反弹：damage=4，rebound=max(2,round(4*0.7))=3 → power = 60 + 3 = 63
    expect(out.statePatch.hostileForces[0].power).toBeGreaterThan(60);
  });

  it("失败削减量严格小于同参数胜利削减量", () => {
    const choiceVictory = { effects: { hostileDamage: { li_zicheng: 10 } } };
    const choiceDefeat = { effects: { hostileDamage: { li_zicheng: 10 } } };
    const victoryPatch = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.9, playerMoraleAvg: 75, targetId: "li_zicheng" },
      choiceVictory
    );
    const defeatPatch = buildBattleEffectsPatch(
      { outcome: "defeat", survivorRatio: 0.9, playerMoraleAvg: 75, targetId: "li_zicheng" },
      choiceDefeat
    );

    const stateV = makeFullState(60);
    const stateD = makeFullState(60);
    const outV = resolveHostileForcesAfterChoice(stateV, "出师征讨李自成", victoryPatch, 15, 3);
    const outD = resolveHostileForcesAfterChoice(stateD, "出师征讨李自成", defeatPatch, 15, 3);

    expect(outV.statePatch.hostileForces[0].power).toBeLessThan(
      outD.statePatch.hostileForces[0].power
    );
  });

  it("失败且初始 hostileDamage 为零时 effectsPatch 中无 hostileDamage 字段", () => {
    const effectsPatch = buildBattleEffectsPatch(
      { outcome: "defeat", survivorRatio: 0.5, playerMoraleAvg: 40 },
      { effects: {} }
    );
    // 失败 + 无原始 hostileDamage → patch 不含 hostileDamage
    expect(effectsPatch.hostileDamage).toBeUndefined();
  });
});

describe("循环验证 — 无初始 hostileDamage 时胜利合成", () => {
  it("choice.effects 为空时，胜利通过 targetId 合成 hostileDamage 并削减势力", () => {
    const state = makeFullState(60);
    const effectsPatch = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.9, playerMoraleAvg: 70, targetId: "li_zicheng" },
      { effects: {} }
    );
    expect(effectsPatch.hostileDamage).toBeDefined();
    expect(effectsPatch.hostileDamage.li_zicheng).toBeGreaterThan(0);

    const out = resolveHostileForcesAfterChoice(state, "出师征讨李自成", effectsPatch, 15, 3);
    expect(out).not.toBeNull();
    expect(out.statePatch.hostileForces[0].power).toBeLessThan(60);
  });
});

describe("循环验证 — 连续多次战役势力值单调递减", () => {
  it("连续三次胜利使势力值单调递减至更低水平", () => {
    let state = makeFullState(80);
    const powers = [80];

    for (let i = 0; i < 3; i++) {
      const effectsPatch = buildBattleEffectsPatch(
        { outcome: "victory", survivorRatio: 0.85, playerMoraleAvg: 72, targetId: "li_zicheng" },
        { effects: { hostileDamage: { li_zicheng: 8 } } }
      );
      const out = resolveHostileForcesAfterChoice(state, "出师征讨李自成", effectsPatch, 15, i + 1);
      expect(out).not.toBeNull();
      // 用新势力值更新 state，模拟真实游戏循环
      state = { ...state, hostileForces: out.statePatch.hostileForces };
      powers.push(state.hostileForces[0].power);
    }

    // 每一步都必须严格递减
    expect(powers[1]).toBeLessThan(powers[0]);
    expect(powers[2]).toBeLessThan(powers[1]);
    expect(powers[3]).toBeLessThan(powers[2]);
  });
});

describe("循环验证 — 势力值清零触发灭亡", () => {
  it("高伤害胜利使势力值归零并标记 isDefeated", () => {
    const state = makeFullState(20); // 仅剩 20 点
    // damageBonus = min(20, 8 + round(80/10)) = min(20, 16) = 16; total = 50 + 16 = 66 > 20
    const effectsPatch = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.95, playerMoraleAvg: 80, targetId: "li_zicheng" },
      { effects: { hostileDamage: { li_zicheng: 50 } } }
    );
    const out = resolveHostileForcesAfterChoice(state, "出师征讨李自成", effectsPatch, 16, 2);
    expect(out).not.toBeNull();
    const defeated = out.statePatch.hostileForces[0];
    expect(defeated.power).toBe(0);
    expect(defeated.isDefeated).toBe(true);
    expect(defeated.defeatedYear).toBe(16);
  });

  it("势力灭亡时 closedStorylines 中包含对应故事线标签", () => {
    const state = {
      ...makeFullState(5),
      hostileForces: [
        {
          id: "li_zicheng",
          name: "李自成",
          leader: "李自成",
          power: 5,
          isDefeated: false,
          storylineTag: "li_zicheng_storyline",
        },
      ],
    };
    const effectsPatch = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.9, playerMoraleAvg: 70, targetId: "li_zicheng" },
      { effects: { hostileDamage: { li_zicheng: 30 } } }
    );
    const out = resolveHostileForcesAfterChoice(state, "出师征讨李自成", effectsPatch, 16, 3);
    expect(out.statePatch.closedStorylines).toContain("li_zicheng_storyline");
  });
});

describe("循环验证 — 伤亡率对军力的循环影响", () => {
  it("高存活率胜利比低存活率败退军力损耗小", () => {
    const highSurvivorPatch = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.95, playerMoraleAvg: 80, targetId: "li_zicheng" },
      { effects: {} }
    );
    const lowSurvivorPatch = buildBattleEffectsPatch(
      { outcome: "defeat", survivorRatio: 0.2, playerMoraleAvg: 30, targetId: "li_zicheng" },
      { effects: {} }
    );
    const highMilPenalty = highSurvivorPatch.militaryStrength || 0;
    const lowMilPenalty = lowSurvivorPatch.militaryStrength || 0;
    // 低存活率战败 → 更大军力损耗（更负）
    expect(lowMilPenalty).toBeLessThan(highMilPenalty);
  });

  it("模拟三回合战役：round 推进后存活率影响 militaryStrength 惩罚", () => {
    // 三回合推进，每回合更新 session
    let session = makeSession({
      round: 0,
      maxRounds: 3,
      initialPlayerCount: 5000,
    });
    let outcome = "ongoing";
    for (let r = 1; r <= 3 && outcome === "ongoing"; r++) {
      session.round = r;
      const result = resolveBattleRound(session, "advance");
      session.playerUnits = result.updatedPlayer;
      session.enemyUnits = result.updatedEnemy;
      session.roundHistory = [...session.roundHistory, { round: r, outcome: result.outcome }];
      if (result.outcome !== "ongoing") outcome = result.outcome;
    }

    const survivor = session.playerUnits.reduce((s, u) => s + u.count, 0);
    const survivorRatio = survivor / session.initialPlayerCount;
    const playerMoraleAvg = Math.round(
      session.playerUnits.reduce((s, u) => s + u.morale, 0) / session.playerUnits.length
    );

    const effectsPatch = buildBattleEffectsPatch(
      { outcome, survivorRatio, playerMoraleAvg, targetId: "li_zicheng" },
      { effects: { hostileDamage: { li_zicheng: 10 } } }
    );

    // 军力惩罚必须为非正数（存活率损失必然有惩罚）
    expect(effectsPatch.militaryStrength || 0).toBeLessThanOrEqual(0);
    // survivorRatio 必须小于 1（任何战斗都有伤亡）
    expect(survivorRatio).toBeLessThan(1);
  });
});

/* ──────────────────────────────────────────────
   扩展版本 — 天气系统
   ────────────────────────────────────────────── */
describe("扩展版本 — deriveWeatherFromText", () => {
  it("含「雨」字返回 rain", () => {
    expect(deriveWeatherFromText("雨天交战")).toBe("rain");
    expect(deriveWeatherFromText("阴雨绵绵")).toBe("rain");
    expect(deriveWeatherFromText("潮湿山地")).toBe("rain");
  });

  it("含「雪」「冬」字返回 snow", () => {
    expect(deriveWeatherFromText("雪地奔袭")).toBe("snow");
    expect(deriveWeatherFromText("冬季征讨")).toBe("snow");
    expect(deriveWeatherFromText("冰天冻地")).toBe("snow");
  });

  it("无天气关键字返回 clear", () => {
    expect(deriveWeatherFromText("平原野战")).toBe("clear");
    expect(deriveWeatherFromText("征讨李自成")).toBe("clear");
  });
});

describe("扩展版本 — buildInitialSession 含天气字段", () => {
  it("雨天选项初始化天气为 rain", () => {
    const state = makeBaseState();
    const force = { id: "li_zicheng", name: "李自成", power: 50 };
    const choice = { text: "在阴雨天气中进剿", effects: {} };
    const session = buildInitialSession(state, force, choice);
    expect(session.weather).toBe("rain");
  });

  it("普通选项天气默认为 clear，且含 ammo 与 commanderInjured 字段", () => {
    const state = makeBaseState();
    const force = { id: "li_zicheng", name: "李自成", power: 50 };
    const choice = { text: "出征征讨", effects: {} };
    const session = buildInitialSession(state, force, choice);
    expect(session.weather).toBe("clear");
    expect(session.commanderInjured).toBe(false);
    expect(session.ammo).toBeDefined();
    expect(session.ammo.firearm).toBeGreaterThan(0);
    expect(session.ammo.artillery).toBeGreaterThan(0);
  });

  it("初始化时包含 initialEnemyCount 字段", () => {
    const state = makeBaseState();
    const force = { id: "li_zicheng", name: "李自成", power: 60 };
    const choice = { text: "出征", effects: {} };
    const session = buildInitialSession(state, force, choice);
    expect(session.initialEnemyCount).toBeGreaterThan(0);
    const enemyTotal = session.enemyUnits.reduce((s, u) => s + u.count, 0);
    expect(session.initialEnemyCount).toBe(enemyTotal);
  });
});

describe("扩展版本 — 雨天火铳哑火", () => {
  it("雨天火铳无法攻击，伤害低于晴天", () => {
    const rainSession = makeSession({
      weather: "rain",
      round: 1,
      playerUnits: [{ unitId: "firearm", count: 3000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 3000, morale: 65 }],
    });
    const clearSession = makeSession({
      weather: "clear",
      round: 1,
      playerUnits: [{ unitId: "firearm", count: 3000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 3000, morale: 65 }],
    });
    const rainResult = resolveBattleRound(rainSession, "advance");
    const clearResult = resolveBattleRound(clearSession, "advance");
    expect(rainResult.playerDmgDealt).toBe(0);
    expect(clearResult.playerDmgDealt).toBeGreaterThan(0);
  });
});

describe("扩展版本 — 雪天骑兵减速", () => {
  it("雪天骑兵攻击力低于晴天", () => {
    const snowSession = makeSession({
      weather: "snow",
      round: 1,
      playerUnits: [{ unitId: "cavalry_guanning", count: 2000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 2000, morale: 65 }],
    });
    const clearSession = makeSession({
      weather: "clear",
      round: 1,
      playerUnits: [{ unitId: "cavalry_guanning", count: 2000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 2000, morale: 65 }],
    });
    const snowResult = resolveBattleRound(snowSession, "advance");
    const clearResult = resolveBattleRound(clearSession, "advance");
    expect(snowResult.playerDmgDealt).toBeLessThan(clearResult.playerDmgDealt);
  });
});

/* ──────────────────────────────────────────────
   扩展版本 — 主将临场决策
   ────────────────────────────────────────────── */
describe("扩展版本 — 主将亲率（commanderCharge）士气加成", () => {
  it("commanderCharge 给予更高士气加成（>advance）", () => {
    const base = makeSession({ playerUnits: [{ unitId: "infantry_spear", count: 2000, morale: 60 }] });
    const commanderResult = resolveBattleRound(base, "commanderCharge", 0.99); // 确保不受伤
    const advanceResult  = resolveBattleRound(base, "advance");
    const commanderMorale = commanderResult.updatedPlayer[0].morale;
    const advanceMorale   = advanceResult.updatedPlayer[0].morale;
    expect(commanderMorale).toBeGreaterThan(advanceMorale);
  });

  it("主将负伤（commanderInjured=true）显著降低攻击", () => {
    const injuredSession = makeSession({
      commanderInjured: true,
      playerUnits: [{ unitId: "infantry_spear", count: 3000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 3000, morale: 65 }],
    });
    const healthySession = makeSession({
      commanderInjured: false,
      playerUnits: [{ unitId: "infantry_spear", count: 3000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 3000, morale: 65 }],
    });
    const injuredResult = resolveBattleRound(injuredSession, "advance");
    const healthyResult = resolveBattleRound(healthySession, "advance");
    expect(injuredResult.playerDmgDealt).toBeLessThan(healthyResult.playerDmgDealt);
  });

  it("_injuryRoll < 0.20 触发 commanderInjuredThisRound", () => {
    const session = makeSession();
    const result = resolveBattleRound(session, "commanderCharge", 0.10); // 必然触发
    expect(result.commanderInjuredThisRound).toBe(true);
  });

  it("_injuryRoll >= 0.20 不触发 commanderInjuredThisRound", () => {
    const session = makeSession();
    const result = resolveBattleRound(session, "commanderCharge", 0.20); // 边界：不触发
    expect(result.commanderInjuredThisRound).toBe(false);
  });

  it("非 commanderCharge 决策 commanderInjuredThisRound 始终为 false", () => {
    const session = makeSession();
    for (const d of ["hold", "advance", "charge", "flank"]) {
      const result = resolveBattleRound(session, d, 0.0); // roll=0 也不应触发
      expect(result.commanderInjuredThisRound).toBe(false);
    }
  });
});

/* ──────────────────────────────────────────────
   扩展版本 — 供给/弹药耗尽
   ────────────────────────────────────────────── */
describe("扩展版本 — 弹药耗尽机制", () => {
  it("火铳弹药为 0 时无法攻击（伤害为 0）", () => {
    const noAmmoSession = makeSession({
      round: 1, // 奇数回合，火铳本应射击
      ammo: { firearm: 0, artillery: 99 },
      playerUnits: [{ unitId: "firearm", count: 3000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 3000, morale: 65 }],
    });
    const fullAmmoSession = makeSession({
      round: 1,
      ammo: { firearm: 3, artillery: 99 },
      playerUnits: [{ unitId: "firearm", count: 3000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 3000, morale: 65 }],
    });
    const noAmmoResult  = resolveBattleRound(noAmmoSession,  "advance");
    const fullAmmoResult = resolveBattleRound(fullAmmoSession, "advance");
    expect(noAmmoResult.playerDmgDealt).toBe(0);
    expect(fullAmmoResult.playerDmgDealt).toBeGreaterThan(0);
  });

  it("火铳在奇数回合射击后 updatedAmmo.firearm 递减", () => {
    const session = makeSession({
      round: 1,
      ammo: { firearm: 3, artillery: 2 },
      playerUnits: [{ unitId: "firearm", count: 3000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 3000, morale: 65 }],
    });
    const result = resolveBattleRound(session, "advance");
    expect(result.updatedAmmo.firearm).toBe(2); // 3 → 2
  });

  it("炮兵弹药为 0 时无攻击贡献", () => {
    const noArtAmmo = makeSession({
      round: 1,
      ammo: { firearm: 99, artillery: 0 },
      playerUnits: [{ unitId: "artillery", count: 500, morale: 70 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 3000, morale: 65 }],
    });
    const result = resolveBattleRound(noArtAmmo, "advance");
    expect(result.playerDmgDealt).toBe(0);
  });
});

/* ──────────────────────────────────────────────
   扩展版本 — 局部溃败扩散
   ────────────────────────────────────────────── */
describe("扩展版本 — 局部溃败扩散", () => {
  it("有单位士气 < 30 时，高士气友军额外损失士气", () => {
    // 准备一个场景：炮兵单位 morale=10 已处于崩溃边缘，步兵 morale=80 高士气
    // 弱敌 100 人，保证 playerLoss 极小、不会将 80 压到 < 30
    const session = makeSession({
      playerUnits: [
        { unitId: "artillery", count: 100, morale: 10 },     // 已崩溃
        { unitId: "infantry_spear", count: 3000, morale: 80 }, // 高士气
      ],
      enemyUnits: [{ unitId: "infantry_spear", count: 100, morale: 65 }], // 弱敌
    });
    const result   = resolveBattleRound(session, "advance");
    const highUnit = result.updatedPlayer.find((u) => u.unitId === "infantry_spear");
    // 对比：无崩溃单位时同样弱敌压力下的士气
    const noCollapseSession = makeSession({
      playerUnits: [
        { unitId: "infantry_spear", count: 3000, morale: 80 },
      ],
      enemyUnits: [{ unitId: "infantry_spear", count: 100, morale: 65 }],
    });
    const noCollapseResult = resolveBattleRound(noCollapseSession, "advance");
    const noCollapseHighUnit = noCollapseResult.updatedPlayer[0];
    // 有崩溃扩散时高士气单位士气更低
    expect(highUnit.morale).toBeLessThan(noCollapseHighUnit.morale);
  });

  it("无单位士气 < 30 时不触发扩散", () => {
    const session = makeSession({
      playerUnits: [
        { unitId: "infantry_spear", count: 2000, morale: 75 },
        { unitId: "cavalry_guanning", count: 1000, morale: 80 },
      ],
      enemyUnits: [{ unitId: "infantry_spear", count: 100, morale: 65 }],
    });
    const result = resolveBattleRound(session, "advance");
    // 兵力损失极小，士气只下降极微少量，不会额外扣除扩散惩罚
    result.updatedPlayer.forEach((u) => {
      expect(u.morale).toBeGreaterThanOrEqual(30);
    });
  });
});

/* ──────────────────────────────────────────────
   优化版本 — 配置导出（可供外部 AI 调参）
   ────────────────────────────────────────────── */
describe("优化版本 — UNIT_TYPES 与 FORMATIONS 导出", () => {
  it("UNIT_TYPES 为非空数组，每项含必要字段", () => {
    expect(Array.isArray(UNIT_TYPES)).toBe(true);
    expect(UNIT_TYPES.length).toBeGreaterThan(0);
    UNIT_TYPES.forEach((u) => {
      expect(u).toHaveProperty("id");
      expect(u).toHaveProperty("attack");
      expect(u).toHaveProperty("defense");
      expect(u).toHaveProperty("morale_base");
    });
  });

  it("FORMATIONS 为非空数组，每项含必要字段", () => {
    expect(Array.isArray(FORMATIONS)).toBe(true);
    expect(FORMATIONS.length).toBeGreaterThan(0);
    FORMATIONS.forEach((f) => {
      expect(f).toHaveProperty("id");
      expect(f).toHaveProperty("defenseMod");
      expect(f).toHaveProperty("attackMod");
    });
  });

  it("UNIT_TYPES 各单位攻击力可被外部覆盖并影响战斗结果", () => {
    // 临时保存原始值，修改后验证，随后恢复
    const infantry = UNIT_TYPES.find((u) => u.id === "infantry_spear");
    const originalAttack = infantry.attack;

    infantry.attack = 100; // 极高攻击
    const highAtkSession = makeSession({
      playerUnits: [{ unitId: "infantry_spear", count: 3000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 3000, morale: 65 }],
    });
    const highAtkResult = resolveBattleRound(highAtkSession, "advance");

    infantry.attack = originalAttack; // 恢复
    const normalSession = makeSession({
      playerUnits: [{ unitId: "infantry_spear", count: 3000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 3000, morale: 65 }],
    });
    const normalResult = resolveBattleRound(normalSession, "advance");

    expect(highAtkResult.playerDmgDealt).toBeGreaterThan(normalResult.playerDmgDealt);
  });
});

/* ──────────────────────────────────────────────
   融合版本 — 俘虏处理与战后恢复期
   ────────────────────────────────────────────── */
describe("融合版本 — 俘虏处理", () => {
  it("胜利时 effectsPatch 含 prisoners 字段（= enemyKilled * 0.3）", () => {
    const patch = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.9, playerMoraleAvg: 75, targetId: "li_zicheng", enemyKilled: 3000 },
      { effects: {} }
    );
    expect(patch.prisoners).toBeDefined();
    expect(patch.prisoners).toBe(Math.round(3000 * 0.3)); // 900
  });

  it("失败时 effectsPatch 不含 prisoners 字段", () => {
    const patch = buildBattleEffectsPatch(
      { outcome: "defeat", survivorRatio: 0.6, playerMoraleAvg: 45, targetId: "li_zicheng", enemyKilled: 500 },
      { effects: {} }
    );
    expect(patch.prisoners).toBeUndefined();
  });

  it("胜利且 enemyKilled=0 时不产生 prisoners", () => {
    const patch = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.9, playerMoraleAvg: 75, targetId: "li_zicheng", enemyKilled: 0 },
      { effects: {} }
    );
    expect(patch.prisoners).toBeUndefined();
  });
});

describe("融合版本 — 战后恢复期", () => {
  it("effectsPatch 始终含 recoveryDays 字段（≥0）", () => {
    const patchV = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.9, playerMoraleAvg: 75 },
      { effects: {} }
    );
    const patchD = buildBattleEffectsPatch(
      { outcome: "defeat", survivorRatio: 0.3, playerMoraleAvg: 40 },
      { effects: {} }
    );
    expect(patchV.recoveryDays).toBeGreaterThanOrEqual(0);
    expect(patchD.recoveryDays).toBeGreaterThanOrEqual(0);
  });

  it("低存活率战役恢复期更长", () => {
    const heavyPatch = buildBattleEffectsPatch(
      { outcome: "defeat", survivorRatio: 0.2, playerMoraleAvg: 30 },
      { effects: {} }
    );
    const lightPatch = buildBattleEffectsPatch(
      { outcome: "victory", survivorRatio: 0.95, playerMoraleAvg: 80 },
      { effects: {} }
    );
    expect(heavyPatch.recoveryDays).toBeGreaterThan(lightPatch.recoveryDays);
  });

  it("buildInitialSession.initialEnemyCount 与最终存活数计算 enemyKilled 正确", () => {
    const state = makeBaseState();
    const force = { id: "li_zicheng", name: "李自成", power: 60 };
    const choice = { text: "出征", effects: {} };
    const session = buildInitialSession(state, force, choice);

    // 模拟一回合战斗
    session.round = 1;
    const result = resolveBattleRound(session, "advance");
    const enemySurvivor = result.updatedEnemy.reduce((s, u) => s + u.count, 0);
    const enemyKilled = session.initialEnemyCount - enemySurvivor;
    expect(enemyKilled).toBeGreaterThan(0); // 至少有伤亡
    expect(enemyKilled).toBeLessThan(session.initialEnemyCount);
  });
});

/* ──────────────────────────────────────────────
   高玩内测专项 — chargeCooldown 实现验证
   ────────────────────────────────────────────── */
describe("高玩内测专项 — chargeCooldown 冷却机制", () => {
  it("关宁铁骑配置了 chargeCooldown:2，冷却内选 charge 不触发冲锋加成", () => {
    // 第1回合使用了冲锋，lastChargeRound=1，第2回合处于冷却（1+2>2）
    const coolingSession = makeSession({
      round: 2,
      lastChargeRound: 1,
      playerUnits: [{ unitId: "cavalry_guanning", count: 5000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 5000, morale: 65 }],
    });
    const advanceSession = makeSession({
      round: 2,
      lastChargeRound: 1,
      playerUnits: [{ unitId: "cavalry_guanning", count: 5000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 5000, morale: 65 }],
    });
    const coolingResult = resolveBattleRound(coolingSession, "charge");
    const advanceResult = resolveBattleRound(advanceSession, "advance");
    // 冷却期间 charge 应退化为普通攻击，与 advance 结果相当（无 chargeBonus）
    expect(coolingResult.playerDmgDealt).toBe(advanceResult.playerDmgDealt);
  });

  it("冷却结束后（第3回合）charge 重新触发冲锋加成", () => {
    // lastChargeRound=1，chargeCooldown=2，第3回合：1+2=3，不大于3，冷却结束
    const refreshedSession = makeSession({
      round: 3,
      lastChargeRound: 1,
      playerUnits: [{ unitId: "cavalry_guanning", count: 5000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 5000, morale: 65 }],
    });
    const advanceSession = makeSession({
      round: 3,
      lastChargeRound: 1,
      playerUnits: [{ unitId: "cavalry_guanning", count: 5000, morale: 80 }],
      enemyUnits: [{ unitId: "infantry_spear", count: 5000, morale: 65 }],
    });
    const chargeResult  = resolveBattleRound(refreshedSession, "charge");
    const advanceResult = resolveBattleRound(advanceSession, "advance");
    // 冷却完毕，charge 应再次高于 advance
    expect(chargeResult.playerDmgDealt).toBeGreaterThan(advanceResult.playerDmgDealt);
  });

  it("resolveBattleRound 在 charge 决策时返回 chargeUsedThisRound=true", () => {
    const session = makeSession({ round: 1 });
    const result = resolveBattleRound(session, "charge");
    expect(result.chargeUsedThisRound).toBe(true);
  });

  it("resolveBattleRound 在 advance 决策时返回 chargeUsedThisRound=false", () => {
    const session = makeSession({ round: 1 });
    const result = resolveBattleRound(session, "advance");
    expect(result.chargeUsedThisRound).toBe(false);
  });

  it("buildInitialSession 包含 lastChargeRound:0 字段", () => {
    const state = makeBaseState();
    const force = { id: "li_zicheng", name: "李自成", power: 60 };
    const choice = { text: "出征", effects: {} };
    const session = buildInitialSession(state, force, choice);
    expect(session.lastChargeRound).toBe(0);
  });
});

/* ──────────────────────────────────────────────
   高玩内测专项 — 雨天天气对称性（敌我一致）
   ────────────────────────────────────────────── */
describe("高玩内测专项 — 雨天敌方火铳对称哑火", () => {
  it("雨天敌方火铳伤害与晴天相比被清零", () => {
    const rainSession = makeSession({
      weather: "rain",
      round: 1,
      // 己方无攻击力，让 playerDmg≈0，专门测 enemyDmg
      playerUnits: [{ unitId: "infantry_spear", count: 1, morale: 10 }],
      enemyUnits:  [{ unitId: "firearm",         count: 3000, morale: 80 }],
    });
    const clearSession = makeSession({
      weather: "clear",
      round: 1,
      playerUnits: [{ unitId: "infantry_spear", count: 1, morale: 10 }],
      enemyUnits:  [{ unitId: "firearm",         count: 3000, morale: 80 }],
    });
    const rainResult  = resolveBattleRound(rainSession,  "hold");
    const clearResult = resolveBattleRound(clearSession, "hold");
    // 雨天敌方火铳应哑火 → 敌方伤害更低
    expect(rainResult.enemyDmgDealt).toBeLessThan(clearResult.enemyDmgDealt);
  });
});

/* ──────────────────────────────────────────────
   高玩内测专项 — state.weather 作为战场天气 fallback
   ────────────────────────────────────────────── */
describe("高玩内测专项 — state.weather 天气联动", () => {
  const force = { id: "li_zicheng", name: "李自成", power: 50 };

  it("choice.text 无天气关键字时，state.weather='桃花雪' 应映射到雪天", () => {
    const state = { ...makeBaseState(), weather: "桃花雪" };
    const choice = { text: "出征征讨李自成", effects: {} };
    const session = buildInitialSession(state, force, choice);
    expect(session.weather).toBe("snow");
  });

  it("choice.text 有天气关键字时，优先使用 choice.text 的天气", () => {
    const state = { ...makeBaseState(), weather: "大雪漫天" };
    const choice = { text: "趁阴雨出兵渡河", effects: {} };
    const session = buildInitialSession(state, force, choice);
    // choice.text 含"雨"→ rain，state.weather 含"雪"→ 应被忽略
    expect(session.weather).toBe("rain");
  });

  it("choice.text 与 state.weather 均无天气关键字时，默认晴天", () => {
    const state = { ...makeBaseState(), weather: "秋高气爽" };
    const choice = { text: "出征征讨", effects: {} };
    const session = buildInitialSession(state, force, choice);
    expect(session.weather).toBe("clear");
  });
});
