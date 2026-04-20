import { describe, expect, it } from "vitest";
import {
  adaptCharactersData,
  adaptCourtChatsData,
  adaptFactionsData,
  adaptNationInitData,
  adaptPolicyCatalogData,
  adaptProvinceRulesData,
  adaptPositionsData,
  mapFactionLabel,
  resolveFactionId,
} from "./worldviewAdapter.js";

describe("worldviewAdapter", () => {
  it("should replace the playable roster with Southern Song figures while preserving ids", () => {
    const result = adaptCharactersData({
      schemaVersion: 2,
      characters: [
        { id: "bi_ziyan", name: "毕自严", positions: ["hubu_shangshu"] },
        { id: "wen_tiren", name: "温体仁", positions: ["neige_shoufu"] },
        { id: "unused_old_id", name: "旧人物" },
      ],
    });

    expect(result.characters.some((item) => item.id === "unused_old_id")).toBe(false);
    expect(result.characters.find((item) => item.id === "bi_ziyan")?.name).toBe("叶梦得");
    expect(result.characters.find((item) => item.id === "wen_tiren")?.name).toBe("秦桧");
  });

  it("should rewrite factions and court chats into Southern Song context", () => {
    const factions = adaptFactionsData({ factions: [{ id: "donglin", name: "东林党" }] });
    const chats = adaptCourtChatsData({});

    expect(factions.factions.find((item) => item.id === "donglin")?.name).toBe("主战清议");
    expect(chats.bi_ziyan?.[0]?.text).toContain("东南财赋");
  });

  it("should relabel central institutions without changing position ids", () => {
    const positions = adaptPositionsData({
      modules: [{ id: "neige", name: "内阁" }],
      departments: [{ id: "dutcheng", name: "都察院" }],
      positions: [{ id: "neige_shoufu", name: "内阁首辅" }],
    });

    expect(positions.modules[0].name).toBe("中枢");
    expect(positions.departments[0].name).toBe("御史台");
    expect(positions.positions[0].id).toBe("neige_shoufu");
    expect(positions.positions[0].name).toBe("右相");
  });

  it("should remap policy tree display copy into Southern Song worldview while preserving ids", () => {
    const policies = adaptPolicyCatalogData([
      { id: "politics_east_factory", title: "东厂职能收缩", description: "防止厂卫滥权。" },
      { id: "diplomacy_macao", title: "澳门通商", description: "获取火器与技术。" },
    ]);

    expect(policies[0].id).toBe("politics_east_factory");
    expect(policies[0].title).toBe("察事耳目收束");
    expect(policies[1].title).toBe("海商互市");
    expect(policies[1].description).toContain("南海");
  });

  it("should override nation init threats and provinces when worldview bundle provides them", () => {
    const adapted = adaptNationInitData(
      {
        externalThreats: [{ name: "旧敌军", level: "high" }],
        provinces: [{ name: "旧省份", status: "旧状态" }],
      },
      {
        externalThreats: [{ name: "星海掠袭者", level: "critical" }],
        provinces: [{ name: "主环都会", status: "局势紧张" }],
      }
    );

    expect(adapted.externalThreats[0].name).toBe("星海掠袭者");
    expect(adapted.provinces[0].name).toBe("主环都会");
  });

  it("should apply province rules override from worldview bundle", () => {
    const adapted = adaptProvinceRulesData(
      { regionRules: [{ namePattern: "旧", default: { status: "旧" } }] },
      {
        provinceRules: {
          regionRules: [{ namePattern: "新", default: { status: "新" } }],
        },
      }
    );

    expect(adapted.regionRules).toHaveLength(1);
    expect(adapted.regionRules[0].namePattern).toBe("新");
  });
});

describe("mapFactionLabel – AI talent faction mapping", () => {
  it("should map faction IDs to Southern Song names", () => {
    expect(mapFactionLabel("donglin")).toBe("主战清议");
    expect(mapFactionLabel("neutral")).toBe("务实经世");
    expect(mapFactionLabel("imperial")).toBe("行在近臣");
    expect(mapFactionLabel("military")).toBe("江防宿将");
    expect(mapFactionLabel("eunuch")).toBe("和议近习");
  });

  it("should map Ming-era Chinese labels to Southern Song names", () => {
    expect(mapFactionLabel("东林党")).toBe("主战清议");
    expect(mapFactionLabel("帝党")).toBe("行在近臣");
    expect(mapFactionLabel("阉党")).toBe("和议近习");
    expect(mapFactionLabel("中立")).toBe("务实经世");
    expect(mapFactionLabel("中立派")).toBe("务实经世");
    expect(mapFactionLabel("军事将领")).toBe("江防宿将");
  });

  it("should pass through already-correct Southern Song labels", () => {
    expect(mapFactionLabel("主战清议")).toBe("主战清议");
    expect(mapFactionLabel("务实经世")).toBe("务实经世");
    expect(mapFactionLabel("江防宿将")).toBe("江防宿将");
  });

  it("should return unknown labels as-is", () => {
    expect(mapFactionLabel("未知派系")).toBe("未知派系");
  });

  it("should handle empty or missing input", () => {
    expect(mapFactionLabel("")).toBe("");
    expect(mapFactionLabel(null)).toBe("");
    expect(mapFactionLabel(undefined)).toBe("");
  });
});

describe("resolveFactionId – AI talent faction ID resolution", () => {
  it("should resolve faction IDs to themselves", () => {
    expect(resolveFactionId("donglin")).toBe("donglin");
    expect(resolveFactionId("military")).toBe("military");
  });

  it("should resolve Chinese labels to faction IDs", () => {
    expect(resolveFactionId("东林党")).toBe("donglin");
    expect(resolveFactionId("帝党")).toBe("imperial");
    expect(resolveFactionId("军事将领")).toBe("military");
    expect(resolveFactionId("中立")).toBe("neutral");
  });

  it("should fallback to neutral for unknown input", () => {
    expect(resolveFactionId("未知")).toBe("neutral");
    expect(resolveFactionId("")).toBe("neutral");
    expect(resolveFactionId(null)).toBe("neutral");
  });
});