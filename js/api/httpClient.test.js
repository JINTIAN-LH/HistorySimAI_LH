import { buildLlmProxyHeaders, getApiBase, shouldUseLlmProxy } from "./httpClient.js";

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

    expect(getApiBase({}, "test")).toBe("http://localhost:8080");
  });

  it("uses the local browser origin as proxy when localhost config points to a remote api", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "http://localhost:8080",
        protocol: "http:",
        hostname: "localhost",
        port: "8080",
      },
    });

    expect(getApiBase({ apiBase: "https://historysimai-lh.onrender.com/" }, "test")).toBe("http://localhost:8080");
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

  it("treats browser origin fallback as a valid llm proxy base", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://example.com",
        protocol: "https:",
        hostname: "example.com",
        port: "",
      },
    });

    expect(shouldUseLlmProxy({ storyMode: "llm" }, "test")).toBe(true);
  });

  it("does not enable llm proxy outside llm story mode", () => {
    vi.stubGlobal("window", {
      location: {
        origin: "https://example.com",
        protocol: "https:",
        hostname: "example.com",
        port: "",
      },
    });

    expect(shouldUseLlmProxy({ storyMode: "template" }, "test")).toBe(false);
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