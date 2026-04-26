import { describe, expect, it } from "vitest";
import {
  defaultWorldviewOverrides,
  resolveWorldviewOverrides,
  southernSongFallbackWorldviewOverrides,
} from "./worldviewAdapter.js";

describe("worldview override priority", () => {
  it("uses runtime custom overrides first", () => {
    const customOverrides = {
      allowedCharacterIds: ["custom_01"],
      characters: {
        custom_01: { name: "定制角色" },
      },
    };

    expect(resolveWorldviewOverrides(customOverrides)).toBe(customOverrides);
  });

  it("uses default cross-world overrides when runtime custom is missing", () => {
    const resolved = resolveWorldviewOverrides(null);
    expect(resolved).toBe(defaultWorldviewOverrides);
    expect(Array.isArray(resolved.allowedCharacterIds)).toBe(true);
    expect(resolved.allowedCharacterIds[0]).toBe("hero_01");
  });

  it("falls back to southern-song overrides when default overrides are invalid", () => {
    const invalidDefault = { allowedCharacterIds: [], characters: null };
    const resolved = resolveWorldviewOverrides(undefined, {
      defaultOverrides: invalidDefault,
      fallbackOverrides: southernSongFallbackWorldviewOverrides,
    });

    expect(resolved).toBe(southernSongFallbackWorldviewOverrides);
    expect(resolved.allowedCharacterIds[0]).toBe("bi_ziyan");
  });
});
