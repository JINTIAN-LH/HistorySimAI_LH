import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

const mockLegacyState = {
  mode: "classic",
  slotId: "manual_01",
  currentYear: 3,
  currentMonth: 4,
  currentDay: 1,
  currentPhase: "morning",
  config: {},
  nation: { treasury: 1200, civilMorale: 55 },
};

const mockUseLegacySelector = vi.fn((selector) => selector(mockLegacyState));
const mockFetchConfigStatus = vi.fn(async () => ({
  fields: {
    LLM_API_BASE: { value: "https://example.com/v1" },
    LLM_MODEL: { value: "story-model" },
    LLM_CHAT_MODEL: { value: "chat-model" },
    LLM_API_KEY: { masked: "sk-****" },
  },
}));

vi.mock("@client/ui/hooks/useLegacySelector.js", () => ({
  shallowEqual: (a, b) => a === b,
  useLegacySelector: mockUseLegacySelector,
}));

vi.mock("@client/bootstrap/configurationGate.js", () => ({
  fetchConfigStatus: mockFetchConfigStatus,
  saveRuntimeConfig: vi.fn(async () => ({ fields: {} })),
}));

vi.mock("@legacy/router.js", () => ({
  router: {
    VIEW_IDS: { EDICT: "edict" },
    setView: vi.fn(),
  },
}));

vi.mock("@legacy/state.js", () => ({
  getState: vi.fn(() => mockLegacyState),
  resetState: vi.fn(),
  setState: vi.fn(),
}));

vi.mock("@legacy/storage.js", () => ({
  applyLoadedGame: vi.fn(),
  clearGame: vi.fn(),
  formatSaveTimestamp: vi.fn(() => "2026-04-26"),
  getSaveList: vi.fn(() => []),
  loadGame: vi.fn(() => null),
  MAX_MANUAL_SLOTS: 3,
  saveGame: vi.fn(),
  setSavedGameplayMode: vi.fn(),
}));

vi.mock("@legacy/layout.js", () => ({
  updateGoalBar: vi.fn(),
  updateTopbarByState: vi.fn(),
}));

vi.mock("@legacy/worldview/worldviewStorage.js", () => ({
  validateWorldviewPackage: vi.fn(() => ({ valid: true, errors: [], warnings: [] })),
  parseWorldviewBundleText: vi.fn((text) => ({ worldview: { id: "sample", title: text }, overrides: {} })),
  saveCustomWorldview: vi.fn(),
  loadCustomWorldview: vi.fn(() => null),
  clearCustomWorldview: vi.fn(),
  hasCustomWorldview: vi.fn(() => false),
  buildWorldviewPreview: vi.fn(() => ({
    title: "示例世界",
    id: "sample",
    playerRole: "穿越者",
    characterCount: 0,
    factionNames: [],
    hasStoryPrompt: false,
    importedAt: "2026-04-26",
  })),
}));

vi.mock("@legacy/worldview/worldviewRuntimeAccessor.js", () => ({
  formatEraTimeByRelativeYear: vi.fn(() => "建炎元年四月"),
}));

describe("SettingsView worldview sample text", () => {
  let container;
  let root;
  let writeTextMock;

  beforeEach(async () => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    writeTextMock = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: writeTextMock },
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      text: async () => "=== worldview.json ===\\n{\\n  \"id\": \"sample\"\\n}",
    })));

    const { SettingsView } = await import("./SettingsView.jsx");
    await act(async () => {
      root.render(createElement(SettingsView));
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("shows sample file text modal when clicking the view button", async () => {
    const viewButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent.includes("查看案例全文")
    );

    expect(viewButton).toBeTruthy();

    await act(async () => {
      viewButton.click();
    });

    expect(fetch).toHaveBeenCalledWith("/data/import-samples/worldview.import.bundle.txt", { cache: "no-cache" });
    expect(container.textContent).toContain("worldview.import.bundle.txt 原始全文");
    expect(container.textContent).toContain("=== worldview.json ===");

    const copyButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent.includes("复制全文")
    );
    expect(copyButton).toBeTruthy();

    await act(async () => {
      copyButton.click();
    });

    expect(writeTextMock).toHaveBeenCalledWith("=== worldview.json ===\\n{\\n  \"id\": \"sample\"\\n}");
  });
});
