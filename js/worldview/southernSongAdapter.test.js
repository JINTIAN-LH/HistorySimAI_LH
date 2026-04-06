import { describe, expect, it } from "vitest";
import {
  adaptCharactersData,
  adaptCourtChatsData,
  adaptFactionsData,
  adaptPositionsData,
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
});