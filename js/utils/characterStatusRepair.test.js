import { describe, expect, it } from "vitest";

import { repairImpossibleNaturalDeaths } from "./characterStatusRepair.js";

describe("repairImpossibleNaturalDeaths", () => {
  it("revives impossible early natural deaths under Southern Song chronology", () => {
    const result = repairImpossibleNaturalDeaths({
      characters: [
        { id: "li_gang", birthYear: 1083, deathYear: 1140 },
      ],
      characterStatus: {
        li_gang: {
          isAlive: false,
          deathReason: "寿终病逝",
          deathDay: 4,
          deathYear: 3,
          lifespanPatchYears: 9,
        },
      },
      config: {
        startYear: 3,
        absoluteStartYear: 1129,
      },
      currentYear: 3,
    });

    expect(result.repairedIds).toEqual(["li_gang"]);
    expect(result.characterStatus.li_gang).toEqual({
      isAlive: true,
      deathReason: null,
      deathDay: null,
    });
  });

  it("keeps non-natural deaths unchanged", () => {
    const result = repairImpossibleNaturalDeaths({
      characters: [
        { id: "yue_fei", birthYear: 1103, deathYear: 1142 },
      ],
      characterStatus: {
        yue_fei: {
          isAlive: false,
          deathReason: "赐死",
          deathDay: 8,
        },
      },
      config: {
        startYear: 3,
        absoluteStartYear: 1129,
      },
      currentYear: 3,
    });

    expect(result.repairedIds).toEqual([]);
    expect(result.characterStatus.yue_fei).toEqual({
      isAlive: false,
      deathReason: "赐死",
      deathDay: 8,
    });
  });

  it("keeps valid natural deaths once chronology has reached the character death year", () => {
    const result = repairImpossibleNaturalDeaths({
      characters: [
        { id: "han_shizhong", birthYear: 1089, deathYear: 1151 },
      ],
      characterStatus: {
        han_shizhong: {
          isAlive: false,
          deathReason: "病逝",
          deathDay: 2,
        },
      },
      config: {
        startYear: 3,
        absoluteStartYear: 1129,
      },
      currentYear: 25,
    });

    expect(result.repairedIds).toEqual([]);
    expect(result.characterStatus.han_shizhong?.isAlive).toBe(false);
  });
});