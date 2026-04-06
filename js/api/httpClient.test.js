import { buildLlmProxyHeaders, getApiBase } from "./httpClient.js";

describe("getApiBase", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the configured apiBase when provided", () => {
    expect(getApiBase({ apiBase: "http://example.com/" }, "test")).toBe("http://example.com");
  });

  it("falls back to the local API server when running on localhost without config", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "http://localhost:8080",
        protocol: "http:",
        hostname: "localhost",
        port: "8080",
      },
    });

    expect(getApiBase({}, "test")).toBe("http://localhost:3002");
  });

  it("falls back to the current origin for non-local browser hosts", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://example.com",
        protocol: "https:",
        hostname: "example.com",
        port: "",
      },
    });

    expect(getApiBase({}, "test")).toBe("https://example.com");
  });

  it("builds request-scoped llm proxy headers from player runtime config", () => {
    expect(buildLlmProxyHeaders({
      llmApiKey: " user-key ",
      llmApiBase: "https://example.com/v1/",
      llmModel: "story-model",
      llmChatModel: "chat-model",
    })).toEqual({
      "X-LLM-API-Key": "user-key",
      "X-LLM-API-Base": "https://example.com/v1",
      "X-LLM-Model": "story-model",
      "X-LLM-Chat-Model": "chat-model",
    });
  });
});