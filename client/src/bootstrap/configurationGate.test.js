import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchConfigStatus, saveRuntimeConfig } from "./configurationGate.js";
import { getState, setState } from "@legacy/state.js";

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

  it("keeps existing API key when updating model params without re-entering key", async () => {
    await saveRuntimeConfig({
      LLM_API_KEY: "player-key-5678",
      LLM_API_BASE: "https://example.com/v1",
      LLM_MODEL: "glm-old",
      LLM_CHAT_MODEL: "glm-old-chat",
    });

    const status = await saveRuntimeConfig({
      LLM_API_KEY: "",
      LLM_API_BASE: "https://example.com/v2",
      LLM_MODEL: "glm-new",
      LLM_CHAT_MODEL: "glm-new-chat",
    });

    expect(status.ready).toBe(true);
    expect(status.fields.LLM_API_KEY.masked).toContain("5678");
    expect(status.fields.LLM_API_BASE.value).toBe("https://example.com/v2");
    expect(status.fields.LLM_MODEL.value).toBe("glm-new");
    expect(status.fields.LLM_CHAT_MODEL.value).toBe("glm-new-chat");
  });

  it("syncs saved config into runtime state immediately without reload", async () => {
    // Set up initial state with old config
    setState({
      config: {
        storyMode: "llm",
        llmApiKey: "old-key",
        llmApiBase: "https://old.example.com/v1",
        llmModel: "old-model",
        llmChatModel: "old-chat-model",
      },
    });

    await saveRuntimeConfig({
      LLM_API_KEY: "new-key-9999",
      LLM_API_BASE: "https://new.example.com/v2",
      LLM_MODEL: "new-model",
      LLM_CHAT_MODEL: "new-chat-model",
    });

    const config = getState().config;
    expect(config.llmApiKey).toBe("new-key-9999");
    expect(config.llmApiBase).toBe("https://new.example.com/v2");
    expect(config.llmModel).toBe("new-model");
    expect(config.llmChatModel).toBe("new-chat-model");
    // Non-LLM config fields should be preserved
    expect(config.storyMode).toBe("llm");
  });
});
