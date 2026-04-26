import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./httpClient.js", () => ({
  buildLlmProxyHeaders: vi.fn(() => ({})),
  getApiBase: vi.fn(() => "http://localhost:3002"),
  postJsonAndReadText: vi.fn(),
}));

import { resetState, setState } from "../state.js";
import { postJsonAndReadText } from "./httpClient.js";
import { requestTalentRecruit } from "./talentApi.js";

describe("requestTalentRecruit", () => {
  beforeEach(() => {
    resetState();
    setState({ config: { apiBase: "http://localhost:3002" } });
    vi.mocked(postJsonAndReadText).mockReset();
  });

  it("falls back to the requested recruit type as source", async () => {
    vi.mocked(postJsonAndReadText).mockResolvedValueOnce(JSON.stringify({
      talents: [
        {
          id: "talent_1",
          name: "韩岳",
          quality: "excellent",
          field: "politics",
          ability: { politics: 82, military: 40, economy: 61, culture: 68, loyalty: 73 },
          tags: ["清议", "治政"],
        },
      ],
    }));

    const talents = await requestTalentRecruit("imperial_exam");

    expect(talents).toHaveLength(1);
    expect(talents[0].source).toBe("imperial_exam");
    expect(talents[0].positions).toEqual([]);
    expect(talents[0].isAlive).toBe(true);
    expect(talents[0].openingLine).toBeTruthy();
    expect(talents[0].tags).toEqual(["清议", "治政"]);
  });

  it("reassigns duplicate recruit ids so new candidates can still enter the pool", async () => {
    setState({
      allCharacters: [{ id: 'talent_1', name: '旧人甲', isAlive: true }],
    });
    vi.mocked(postJsonAndReadText).mockResolvedValueOnce(JSON.stringify({
      talents: [
        {
          id: "talent_1",
          name: "新人乙",
          quality: "ordinary",
          field: "economy",
          ability: { politics: 58, military: 31, economy: 79, culture: 55, loyalty: 64 },
        },
      ],
    }));

    const talents = await requestTalentRecruit("search");

    expect(talents).toHaveLength(1);
    expect(talents[0].id).not.toBe('talent_1');
    expect(talents[0].name).toBe('新人乙');
  });

  it("returns local fallback talents when the remote recruit request fails or times out", async () => {
    vi.mocked(postJsonAndReadText).mockResolvedValueOnce(null);

    const talents = await requestTalentRecruit("search");

    expect(talents).toBeNull();
  });

  it("passes the selected recruit type and known names to the backend", async () => {
    setState({
      allCharacters: [{ id: "old_1", name: "旧人甲", isAlive: true }],
    });
    vi.mocked(postJsonAndReadText).mockResolvedValueOnce(JSON.stringify({ talents: [] }));

    await requestTalentRecruit("recommend");

    expect(postJsonAndReadText).toHaveBeenCalledWith(
      "http://localhost:3002/api/chongzhen/talentRecruit",
      expect.objectContaining({
        recruitType: "recommend",
        existingTalentIds: expect.arrayContaining(["old_1"]),
        existingTalentNames: expect.arrayContaining(["旧人甲"]),
      }),
      "requestTalentRecruit",
      expect.any(Object)
    );
  });
});