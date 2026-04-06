import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./layout.js", () => ({
  updateTopbarByState: vi.fn(),
  updateMinisterTabBadge: vi.fn(),
}));

import { getState, resetState, setState } from "./state.js";
import {
  applyLoadedGame,
  formatGameTimeFromState,
  formatSaveTimestamp,
  getSaveList,
  loadGame,
  resolveInitialLoadSlotId,
  saveGame,
} from "./storage.js";

describe("storage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetState();
  });

  it("persists the selected slot id in save metadata", () => {
    setState({ currentYear: 3, currentMonth: 4, currentDay: 2, mode: "classic" });

    saveGame({ slotId: "manual_03" });

    const loaded = loadGame("manual_03");
    expect(loaded.slotId).toBe("manual_03");
    expect(loaded.game_data.slotId).toBe("manual_03");
    expect(loaded.game_time).toBe("建炎3年4月第2日");
  });

  it("restores the loaded slot id back into runtime state", () => {
    setState({ currentYear: 2, currentMonth: 6, currentDay: 9, mode: "classic" });
    saveGame({ slotId: "manual_04" });

    const loaded = loadGame("manual_04");
    resetState();

    applyLoadedGame(loaded);

    expect(getState().slotId).toBe("manual_04");
    expect(getState().mode).toBe("classic");
  });

  it("tracks the active slot independently for each gameplay mode", () => {
    setState({ currentYear: 3, currentMonth: 4, currentDay: 1, mode: "classic" });
    saveGame({ slotId: "manual_02" });

    setState({ currentYear: 1, currentMonth: 8, currentDay: 1, mode: "rigid_v1" });
    saveGame({ slotId: "manual_05" });

    expect(resolveInitialLoadSlotId("classic")).toBe("manual_02");
    expect(resolveInitialLoadSlotId("rigid_v1")).toBe("manual_05");
  });

  it("keeps the same slot id isolated between classic and rigid modes", () => {
    setState({ currentYear: 3, currentMonth: 4, currentDay: 1, mode: "classic" });
    saveGame({ slotId: "manual_01" });

    setState({ currentYear: 6, currentMonth: 8, currentDay: 2, mode: "rigid_v1" });
    saveGame({ slotId: "manual_01" });

    const classicSave = loadGame("manual_01", "classic");
    const rigidSave = loadGame("manual_01", "rigid_v1");

    expect(classicSave.game_data.mode).toBe("classic");
    expect(classicSave.game_time).toBe("建炎3年4月第1日");
    expect(rigidSave.game_data.mode).toBe("rigid_v1");
    expect(rigidSave.game_time).toBe("建炎6年8月第2日");
  });

  it("lists only saves for the requested gameplay mode", () => {
    setState({ currentYear: 3, currentMonth: 4, currentDay: 1, mode: "classic" });
    saveGame({ slotId: "manual_02" });

    setState({ currentYear: 5, currentMonth: 6, currentDay: 7, mode: "rigid_v1" });
    saveGame({ slotId: "manual_02" });

    expect(getSaveList("classic").map((save) => save.slotId)).toEqual(["manual_02"]);
    expect(getSaveList("rigid_v1").map((save) => save.slotId)).toEqual(["manual_02"]);
    expect(getSaveList("classic")[0].game_data.mode).toBe("classic");
    expect(getSaveList("rigid_v1")[0].game_data.mode).toBe("rigid_v1");
  });

  it("formats game time without offsetting the year", () => {
    expect(formatGameTimeFromState({ currentYear: 3, currentMonth: 4, currentDay: 1 })).toBe("建炎3年4月第1日");
  });

  it("formats save timestamps as local date time strings", () => {
    expect(formatSaveTimestamp(0)).toBe("-");
    expect(formatSaveTimestamp(1712232000)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });
});
