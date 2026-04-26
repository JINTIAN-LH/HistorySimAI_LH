import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

const mockSetState = vi.fn();
const mockSaveGame = vi.fn();
const mockSetSavedGameplayMode = vi.fn();
const mockSetView = vi.fn();
const mockShowGoalPanel = vi.fn();
const mockSetPersistentLocalItem = vi.fn();
const mockGetPersistentLocalItem = vi.fn(() => null);
const mockLoadJSON = vi.fn(async (path) => {
  if (path === "data/playerUpdates.json") {
    return {
      version: "9.9.9",
      updates: [
        "测试更新文案：本条应来自 playerUpdates.json",
      ],
    };
  }
  return { lines: [] };
});

const legacyState = {
  config: {
    gameTitle: "历史模拟器",
  },
};

vi.mock("@legacy/dataLoader.js", () => ({
  loadJSON: mockLoadJSON,
}));

vi.mock("@legacy/router.js", () => ({
  router: {
    VIEW_IDS: { EDICT: "edict" },
    setView: mockSetView,
  },
}));

vi.mock("@legacy/state.js", () => ({
  getState: vi.fn(() => legacyState),
  setState: mockSetState,
}));

vi.mock("@legacy/storage.js", () => ({
  saveGame: mockSaveGame,
  setSavedGameplayMode: mockSetSavedGameplayMode,
}));

vi.mock("@ui/goalPanel.js", () => ({
  showGoalPanel: mockShowGoalPanel,
}));

vi.mock("@client/ui/hooks/useLegacySelector.js", () => ({
  useLegacySelector: vi.fn((selector) => selector(legacyState)),
}));

vi.mock("@legacy/worldview/worldviewRuntimeAccessor.js", () => ({
  resolveWorldviewStartIntroLines: vi.fn(() => []),
  resolveWorldviewStartPageCopy: vi.fn(() => ({
    heroTitle: "历史模拟器",
    heroSubtitle: "",
    startButtonLabel: "开始本局",
  })),
}));

vi.mock("@legacy/persistentBrowserStorage.js", () => ({
  getPersistentLocalItem: mockGetPersistentLocalItem,
  setPersistentLocalItem: mockSetPersistentLocalItem,
}));

describe("StartView onboarding modal", () => {
  let container;
  let root;

  beforeEach(async () => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    const { StartView } = await import("./StartView.jsx");
    await act(async () => {
      root.render(createElement(StartView));
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("shows onboarding modal for unseen version and starts after confirmation", async () => {
    mockGetPersistentLocalItem.mockReturnValue(null);

    const startButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent.includes("开始本局")
    );
    expect(startButton).toBeTruthy();

    await act(async () => {
      startButton.click();
    });

    expect(container.textContent).toContain("玩法引导");
    expect(container.textContent).toContain("最近更新");
    expect(container.textContent).toContain("测试更新文案：本条应来自 playerUpdates.json");
    expect(mockSetView).not.toHaveBeenCalled();

    const confirmButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent.includes("开始体验")
    );
    expect(confirmButton).toBeTruthy();

    await act(async () => {
      confirmButton.click();
    });

    expect(mockSetPersistentLocalItem).toHaveBeenCalledWith("history_sim_onboarding_seen_v1", "9.9.9");
    expect(mockSaveGame).toHaveBeenCalledTimes(1);
    expect(mockSetView).toHaveBeenCalledWith("edict");
  });

  it("skips onboarding modal when current version has been seen", async () => {
    mockGetPersistentLocalItem.mockReturnValue("9.9.9");

    const startButton = Array.from(container.querySelectorAll("button")).find((button) =>
      button.textContent.includes("开始本局")
    );
    expect(startButton).toBeTruthy();

    await act(async () => {
      startButton.click();
    });

    expect(container.textContent).not.toContain("玩法引导");
    expect(mockSaveGame).toHaveBeenCalledTimes(1);
    expect(mockSetView).toHaveBeenCalledWith("edict");
  });
});
