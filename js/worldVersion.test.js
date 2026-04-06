import { describe, expect, it } from "vitest";
import { DEFAULT_WORLD_VERSION, getConfiguredWorldVersion, getSaveWorldVersion, isSaveCompatibleWithWorld } from "./worldVersion.js";

describe("worldVersion helpers", () => {
  it("falls back to the default world version when config omits it", () => {
    expect(getConfiguredWorldVersion({})).toBe(DEFAULT_WORLD_VERSION);
  });

  it("treats legacy saves without worldVersion as incompatible", () => {
    expect(isSaveCompatibleWithWorld({ game_data: {} }, { worldVersion: DEFAULT_WORLD_VERSION })).toBe(false);
  });

  it("reads worldVersion directly from save payloads", () => {
    expect(getSaveWorldVersion({ game_data: { worldVersion: "southern_song_v1" } })).toBe("southern_song_v1");
    expect(isSaveCompatibleWithWorld({ game_data: { worldVersion: "southern_song_v1" } }, { worldVersion: "southern_song_v1" })).toBe(true);
  });
});