import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../router.js", () => ({
  router: {
    registerView: vi.fn(),
  },
}));

vi.mock("../systems/turnSystem.js", () => ({
  runCurrentTurn: vi.fn(async (container) => {
    const scrollHost = container._storyLayout?.mainBody || container;
    const block = document.createElement("div");
    block.className = "edict-block";
    block.textContent = "诏书正文";
    scrollHost.appendChild(block);
  }),
}));

import { renderEdictView, removeEdictPanelsWrap } from "./edictView.js";

describe("renderEdictView", () => {
  beforeEach(() => {
    document.body.innerHTML = '<main id="main-view"></main>';
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      callback();
      return 1;
    });
  });

  it("shows a floating button when the edict body can scroll further down and jumps to the latest entry on click", async () => {
    const container = document.createElement("div");
    document.getElementById("main-view").appendChild(container);

    await renderEdictView(container);

    const mainBody = container.querySelector(".gameplay-page__section--main .section-card__body");
    expect(mainBody).toBeTruthy();

    Object.defineProperty(mainBody, "clientHeight", { value: 200, configurable: true });
    Object.defineProperty(mainBody, "scrollHeight", { value: 900, configurable: true });
    Object.defineProperty(mainBody, "scrollTop", { value: 120, writable: true, configurable: true });
    mainBody.scrollTo = vi.fn(({ top }) => {
      mainBody.scrollTop = top;
    });
    mainBody.getBoundingClientRect = () => ({
      width: 320,
      height: 420,
      top: 40,
      left: 20,
      right: 340,
      bottom: 460,
      x: 20,
      y: 40,
      toJSON: () => ({}),
    });

    mainBody.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));

    const button = document.getElementById("edict-scroll-bottom-fab");
    expect(button).toBeTruthy();
    expect(button.hidden).toBe(false);

    button.click();

    expect(mainBody.scrollTo).toHaveBeenCalledWith({ top: 700, behavior: "smooth" });
    expect(mainBody.scrollTop).toBe(700);
  });

  it("removes the floating button during edict view cleanup", async () => {
    const container = document.createElement("div");
    document.getElementById("main-view").appendChild(container);

    await renderEdictView(container, { useLegacyLayout: true });

    expect(document.getElementById("edict-scroll-bottom-fab")).toBeTruthy();

    removeEdictPanelsWrap();

    expect(document.getElementById("edict-scroll-bottom-fab")).toBeNull();
  });
});