import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchConfigStatus, saveRuntimeConfig } from "./configurationGate.js";

describe("configurationGate", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const storage = new Map();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key) => (storage.has(key) ? storage.get(key) : null),
        setItem: (key, value) => storage.set(key, value),
      },
    });
  });

  it("reads config status payload from local browser storage", async () => {
    const result = await fetchConfigStatus();

    expect(result.ready).toBe(false);
    expect(result.storageLabel).toBe("当前浏览器本地存储");
  });

  it("throws a friendly error when saving config fails", async () => {
    await expect(saveRuntimeConfig({ LLM_API_KEY: "" })).rejects.toThrow("LLM_API_KEY is required");
  });

  it("persists player runtime config locally and reports ready state", async () => {
    const status = await saveRuntimeConfig({
      LLM_API_KEY: "player-key-1234",
      LLM_API_BASE: "https://example.com/v1",
      LLM_MODEL: "glm-custom",
      LLM_CHAT_MODEL: "glm-chat",
    });

    expect(status.ready).toBe(true);
    expect(status.fields.LLM_API_KEY.masked).toContain("1234");
    expect(status.fields.LLM_API_BASE.value).toBe("https://example.com/v1");
  });
});
