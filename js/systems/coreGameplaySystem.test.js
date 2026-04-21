import { describe, expect, it } from "vitest";
import { getPolicyCatalog, initializeHostileForces, processCoreGameplayTurn, resolveHostileForcesAfterChoice, scaleEffectsByExecution } from "./coreGameplaySystem.js";

function createBaseState() {
  return {
    hostileForces: [
      {
        id: "hostile_li_zicheng",
        name: "李自成",
        leader: "李自成",
        status: "活跃",
        level: "high",
        power: 70,
        isDefeated: false,
        storylineTag: "李自成_线",
      },
    ],
    nation: {
      borderThreat: 70,
      militaryStrength: 60,
    },
    unlockedPolicies: [],
    playerAbilities: { military: 0 },
    systemNewsToday: [],
    closedStorylines: [],
  };
}

describe("resolveHostileForcesAfterChoice", () => {
  it("should not infer hostile strike when non-military text only mentions hostile name", () => {
    const state = createBaseState();
    const out = resolveHostileForcesAfterChoice(
      state,
      "派使者与李自成议和并安置流民",
      {},
      3,
      5
    );

    expect(out).toBeNull();
  });

  it("should infer hostile strike when military intent is present", () => {
    const state = createBaseState();
    const out = resolveHostileForcesAfterChoice(
      state,
      "出师征讨李自成，围剿其部众",
      {},
      3,
      5
    );

    expect(out).not.toBeNull();
    expect(out.statePatch.hostileForces[0].power).toBeLessThan(70);
    expect(out.statePatch.systemNewsToday.some((item) => String(item.title || "").includes("军事开拓"))).toBe(true);
  });

  it("should target peasant rebels when military text refers to 陕西流寇", () => {
    const state = {
      hostileForces: [
        {
          id: "hostile_后金",
          name: "后金(清)",
          leader: "皇太极",
          status: "整军经武",
          level: "critical",
          power: 88,
          isDefeated: false,
          storylineTag: "后金(清)_线",
        },
        {
          id: "hostile_农民军",
          name: "农民军",
          leader: "李自成等",
          status: "蛰伏山中",
          level: "high",
          power: 72,
          isDefeated: false,
          storylineTag: "农民军_线",
        },
        {
          id: "hostile_登州叛军",
          name: "登州叛军",
          leader: "孔有德",
          status: "欠饷十月",
          level: "high",
          power: 72,
          isDefeated: false,
          storylineTag: "登州叛军_线",
        },
      ],
      nation: {
        borderThreat: 75,
        militaryStrength: 60,
      },
      unlockedPolicies: [],
      playerAbilities: { military: 0 },
      systemNewsToday: [],
      closedStorylines: [],
    };

    const out = resolveHostileForcesAfterChoice(state, "命洪承畴加紧围剿陕西流寇，同时开仓放粮赈济灾民", {}, 3, 5);

    const byId = new Map(out.statePatch.hostileForces.map((item) => [item.id, item.power]));
    expect(byId.get("hostile_农民军")).toBeLessThan(72);
    expect(byId.get("hostile_后金")).toBe(88);
    expect(byId.get("hostile_登州叛军")).toBe(72);
  });
});

describe("initializeHostileForces", () => {
  it("filters out stale hostiles that are no longer present in current world data", () => {
    const out = initializeHostileForces(
      {
        hostileForces: [
          {
            id: "hostile_登州叛军",
            name: "登州叛军",
            leader: "孔有德",
            power: 72,
            isDefeated: false,
          },
          {
            id: "hostile_金军",
            name: "金军",
            leader: "完颜兀术",
            power: 81,
            isDefeated: false,
          },
        ],
      },
      {
        externalThreats: [
          { name: "金军", leader: "完颜兀术", status: "南压江淮", level: "critical" },
          { name: "地方叛军", leader: "张用等", status: "聚众作乱", level: "high" },
          { name: "洞庭水寇", leader: "杨么", status: "盘踞湖湘", level: "high" },
        ],
      }
    );

    expect(out.some((item) => item.name === "登州叛军")).toBe(false);
    expect(out.find((item) => item.name === "金军")?.power).toBe(81);
    expect(out.some((item) => item.name === "洞庭水寇")).toBe(true);
  });
});

describe("worldview policy mapping", () => {
  it("maps policy tree display copy into Southern Song worldview", () => {
    const policies = getPolicyCatalog({ worldVersion: "southern_song_v1", config: { worldVersion: "southern_song_v1" } });

    expect(policies.find((item) => item.id === "politics_east_factory")?.title).toBe("察事耳目收束");
    expect(policies.find((item) => item.id === "diplomacy_macao")?.title).toBe("海商互市");
    expect(policies.find((item) => item.id === "diplomacy_rome")?.description).toContain("诸蕃");
  });

  it("uses default cross-world policy copy when worldVersion is not southern", () => {
    const policies = getPolicyCatalog({
      worldVersion: "cross_world_default_v1",
      config: { worldVersion: "cross_world_default_v1" },
    });

    expect(policies.find((item) => item.id === "civil_light_tax")?.title).toBe("资源减负");
  });

  it("applies custom worldview policy overrides in non-southern world", () => {
    const policies = getPolicyCatalog({
      worldVersion: "custom_world_v1",
      config: {
        worldVersion: "custom_world_v1",
        worldviewOverrides: {
          policies: {
            civil_light_tax: {
              title: "自定义轻税",
              description: "按自定义世界观覆盖国策文案。",
            },
          },
        },
      },
    });

    expect(policies.find((item) => item.id === "civil_light_tax")?.title).toBe("自定义轻税");
    expect(policies.find((item) => item.id === "civil_light_tax")?.description).toBe("按自定义世界观覆盖国策文案。");
  });

  it("uses semanticLabels for diplomacy hostile-force wording", () => {
    const policies = getPolicyCatalog({
      worldVersion: "southern_song_v1",
      config: {
        worldVersion: "southern_song_v1",
        worldviewData: {
          semanticLabels: {
            primaryHostileName: "北境强敌",
          },
        },
      },
    });

    expect(policies.find((item) => item.id === "diplomacy_mongol")?.description).toContain("北境强敌");
    expect(policies.find((item) => item.id === "diplomacy_korea")?.description).toContain("北境强敌");
  });

  it("applies semanticLabels to diplomacy wording in worldview policy catalog", () => {
    const policies = getPolicyCatalog({
      worldVersion: "southern_song_v1",
      config: {
        worldVersion: "southern_song_v1",
        worldviewData: {
          semanticLabels: {
            primaryHostileName: "北境强敌",
          },
        },
      },
    });

    expect(policies.find((item) => item.id === "diplomacy_mongol")?.description).toContain("北境强敌");
  });
});

describe("scaleEffectsByExecution", () => {
  it("should preserve appointment-related non-numeric effects", () => {
    const scaled = scaleEffectsByExecution(
      {
        appointments: { hubu_shangshu: "wen_tiren" },
        appointmentDismissals: ["neige_shoufu"],
        characterDeath: { wen_tiren: "处死" },
      },
      {
        prestige: 30,
        unlockedPolicies: [],
        playerAbilities: { politics: 0 },
      }
    );

    expect(scaled.appointments).toEqual({ hubu_shangshu: "wen_tiren" });
    expect(scaled.appointmentDismissals).toEqual(["neige_shoufu"]);
    expect(scaled.characterDeath).toEqual({ wen_tiren: "处死" });
  });

  it("should still scale numeric effects", () => {
    const scaled = scaleEffectsByExecution(
      {
        treasury: -100000,
        civilMorale: 10,
        appointments: { hubu_shangshu: "wen_tiren" },
      },
      {
        prestige: 30,
        unlockedPolicies: [],
        playerAbilities: { politics: 0 },
      }
    );

    expect(typeof scaled.treasury).toBe("number");
    expect(typeof scaled.civilMorale).toBe("number");
    expect(scaled.appointments).toEqual({ hubu_shangshu: "wen_tiren" });
  });
});

describe("processCoreGameplayTurn balance corrections", () => {
  it("should schedule a delayed downside for consultation-heavy choices", () => {
    const out = processCoreGameplayTurn(
      {
        currentYear: 3,
        currentMonth: 4,
        prestige: 58,
        factionSupport: { donglin: 48, eunuch: 52, neutral: 50, military: 46, imperial: 72 },
        partyStrife: 62,
        unrest: 18,
        taxPressure: 52,
        pendingConsequences: [],
        appointments: {},
        characterStatus: {},
        nation: {
          treasury: 500000,
          grain: 30000,
          militaryStrength: 60,
          civilMorale: 35,
          borderThreat: 75,
          disasterLevel: 70,
          corruptionLevel: 80,
        },
        hostileForces: [],
        unlockedPolicies: [],
        playerAbilities: { politics: 0, military: 0, scholarship: 0, management: 0 },
        systemPublicOpinion: [],
        config: { balance: {} },
      },
      "召集内阁与六部堂官廷议，共商开源节流之策",
      { civilMorale: 2, corruptionLevel: -3 },
      3,
      5
    );

    expect(out.statePatch.pendingConsequences.some((item) => item.id === "court_consultation_delay")).toBe(true);
  });

  it("should grow unsuppressed hostile forces on periodic escalation turns", () => {
    const out = processCoreGameplayTurn(
      {
        currentYear: 3,
        currentMonth: 5,
        prestige: 58,
        factionSupport: { donglin: 48, eunuch: 52, neutral: 50, military: 46, imperial: 72 },
        partyStrife: 62,
        unrest: 26,
        taxPressure: 52,
        pendingConsequences: [],
        appointments: {},
        characterStatus: {},
        nation: {
          treasury: 500000,
          grain: 30000,
          militaryStrength: 60,
          civilMorale: 35,
          borderThreat: 75,
          disasterLevel: 70,
          corruptionLevel: 80,
        },
        hostileForces: [
          { id: "hostile_后金", name: "后金(清)", leader: "皇太极", power: 88, isDefeated: false },
          { id: "hostile_农民军", name: "农民军", leader: "李自成等", power: 72, isDefeated: false },
        ],
        unlockedPolicies: [],
        playerAbilities: { politics: 0, military: 0, scholarship: 0, management: 0 },
        systemPublicOpinion: [],
        config: { balance: {} },
      },
      "召集内阁与六部堂官廷议，共商开源节流之策",
      { civilMorale: 2, corruptionLevel: -3 },
      3,
      6
    );

    const byId = new Map(out.statePatch.hostileForces.map((item) => [item.id, item.power]));
    expect(byId.get("hostile_后金")).toBeGreaterThan(88);
    expect(byId.get("hostile_农民军")).toBeGreaterThan(72);
    expect(out.statePatch.systemNewsToday.some((item) => String(item.title || "").includes("趁隙坐大"))).toBe(true);
  });

  it("should not grow the hostile target that is actively being suppressed", () => {
    const out = processCoreGameplayTurn(
      {
        currentYear: 3,
        currentMonth: 5,
        prestige: 58,
        factionSupport: { donglin: 48, eunuch: 52, neutral: 50, military: 46, imperial: 72 },
        partyStrife: 62,
        unrest: 26,
        taxPressure: 52,
        pendingConsequences: [],
        appointments: {},
        characterStatus: {},
        nation: {
          treasury: 500000,
          grain: 30000,
          militaryStrength: 60,
          civilMorale: 35,
          borderThreat: 75,
          disasterLevel: 70,
          corruptionLevel: 80,
        },
        hostileForces: [
          { id: "hostile_后金", name: "后金(清)", leader: "皇太极", power: 88, isDefeated: false },
          { id: "hostile_农民军", name: "农民军", leader: "李自成等", power: 72, isDefeated: false },
        ],
        unlockedPolicies: [],
        playerAbilities: { politics: 0, military: 0, scholarship: 0, management: 0 },
        systemPublicOpinion: [],
        config: { balance: {} },
      },
      "命洪承畴加紧围剿陕西流寇，同时开仓放粮赈济灾民",
      { civilMorale: 8, disasterLevel: -5 },
      3,
      6
    );

    const byId = new Map(out.statePatch.hostileForces.map((item) => [item.id, item.power]));
    expect(byId.get("hostile_农民军")).toBe(72);
    expect(byId.get("hostile_后金")).toBeGreaterThan(88);
  });
});
