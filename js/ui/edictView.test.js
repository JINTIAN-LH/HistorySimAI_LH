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

  it("re-syncs floating button visibility when new story blocks are appended after mount", async () => {
    const container = document.createElement("div");
    document.getElementById("main-view").appendChild(container);

    await renderEdictView(container);

    const mainBody = container.querySelector(".gameplay-page__section--main .section-card__body");
    expect(mainBody).toBeTruthy();

    let scrollHeight = 180;
    Object.defineProperty(mainBody, "clientHeight", { value: 220, configurable: true });
    Object.defineProperty(mainBody, "scrollHeight", {
      configurable: true,
      get: () => scrollHeight,
    });
    Object.defineProperty(mainBody, "scrollTop", { value: 0, writable: true, configurable: true });
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

    const button = document.getElementById("edict-scroll-bottom-fab");
    expect(button).toBeTruthy();
    expect(button.hidden).toBe(true);

    scrollHeight = 760;
    const followUpBlock = document.createElement("div");
    followUpBlock.textContent = "追加剧情";
    mainBody.appendChild(followUpBlock);

    await Promise.resolve();
    await Promise.resolve();

    expect(button.hidden).toBe(false);
  });

  it("uses #main-view as scroll host in single-column legacy layout", async () => {
    const mainView = document.getElementById("main-view");
    const container = document.createElement("div");
    mainView.appendChild(container);

    Object.defineProperty(mainView, "clientHeight", { value: 300, configurable: true });
    Object.defineProperty(mainView, "scrollHeight", { value: 1200, configurable: true });
    Object.defineProperty(mainView, "scrollTop", { value: 0, writable: true, configurable: true });
    mainView.scrollTo = vi.fn(({ top }) => {
      mainView.scrollTop = top;
    });
    mainView.getBoundingClientRect = () => ({
      width: 400,
      height: 300,
      top: 50,
      left: 0,
      right: 400,
      bottom: 350,
      x: 0,
      y: 50,
      toJSON: () => ({}),
    });

    await renderEdictView(container, { useLegacyLayout: true });

    // renderEdictView scrolls to bottom; simulate the user scrolling back up
    mainView.scrollTop = 100;
    mainView.dispatchEvent(new Event("scroll"));

    const button = document.getElementById("edict-scroll-bottom-fab");
    expect(button).toBeTruthy();
    expect(button.hidden).toBe(false);

    button.click();
    expect(mainView.scrollTo).toHaveBeenCalledWith({ top: 900, behavior: "smooth" });
  });
});