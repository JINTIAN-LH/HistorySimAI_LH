import { beforeEach, describe, expect, it } from "vitest";

import { getState, resetState, setState } from "../state.js";
import { appointTalentToPosition, getTalentPool } from "./talentSystem.js";

describe("appointTalentToPosition", () => {
  beforeEach(() => {
    resetState();
    setState({
      appointments: {
        neige_shoufu: "old_holder",
        hubu_shangshu: "talent_1",
      },
      talent: {
        pool: [
          {
            id: "talent_1",
            name: "孙某",
            quality: "excellent",
            field: "politics",
            ability: { military: 50, politics: 84, economy: 62, culture: 66, loyalty: 70 },
            source: "recommend",
          },
        ],
        interactionHistory: {},
        recruiting: false,
      },
    });
  });

  it("returns a normalized appointment map and removes duplicate holdings", () => {
    const result = appointTalentToPosition("talent_1", "neige_shoufu");

    expect(result.replacedTalentId).toBeNull();
    expect(result.nextAppointments).toEqual({
      neige_shoufu: "talent_1",
    });
    expect(result.nextAllCharacters.some((item) => item.id === "talent_1")).toBe(true);
    expect(result.nextCharacterStatus.talent_1.isAlive).toBe(true);
    expect(getTalentPool(getState())).toEqual([]);
  });
});