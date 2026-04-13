import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../router.js", () => ({
  router: {
    VIEW_IDS: {},
    setView: vi.fn(),
  },
}));

vi.mock("../utils/toast.js", () => ({
  showError: vi.fn(),
  showSuccess: vi.fn(),
}));

vi.mock("../dataLoader.js", () => ({
  loadJSON: vi.fn(async () => ({ positions: [] })),
}));

vi.mock("../api/talentApi.js", () => ({
  requestTalentRecruit: vi.fn(),
  requestTalentInteract: vi.fn(),
}));

import { resetState, setState } from "../state.js";
import { requestTalentRecruit } from "../api/talentApi.js";
import { renderTalentView } from "./talentView.js";

describe("talentView recruit mode", () => {
  beforeEach(() => {
    resetState();
    setState({
      config: {
        worldviewData: {
          talentConfig: {
            recruitTypes: {
              imperial_exam: "科举荐举",
              recommend: "征辟访才",
              search: "寻访奇俊",
            },
          },
        },
      },
    });
    document.body.innerHTML = '<div id="talent-root"></div>';
    vi.mocked(requestTalentRecruit).mockReset();
    vi.mocked(requestTalentRecruit).mockResolvedValue([]);
  });

  it("uses the selected recruit mode instead of the current list filter", async () => {
    const container = document.getElementById("talent-root");

    renderTalentView(container);

    container.querySelector('[data-recruit-kind="mode"][data-recruit-type="search"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    container.querySelector('[data-recruit-kind="filter"][data-recruit-type="imperial_exam"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    container.querySelector(".talent-recruit-btn")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await Promise.resolve();
    await Promise.resolve();

    expect(requestTalentRecruit).toHaveBeenCalledWith("search");
  });
});