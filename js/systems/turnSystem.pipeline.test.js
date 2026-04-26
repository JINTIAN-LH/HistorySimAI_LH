import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  renderStoryTurnMock: vi.fn(),
  pushCurrentTurnToHistoryMock: vi.fn(),
  applyEffectsMock: vi.fn(),
  estimateEffectsFromEdictMock: vi.fn(() => null),
  deriveAppointmentEffectsFromTextMock: vi.fn(() => null),
  normalizeAppointmentEffectsMock: vi.fn((effects) => effects),
}));

vi.mock("./storySystem.js", () => ({
  renderStoryTurn: mocked.renderStoryTurnMock,
  pushCurrentTurnToHistory: mocked.pushCurrentTurnToHistoryMock,
  applyEffects: mocked.applyEffectsMock,
  estimateEffectsFromEdict: mocked.estimateEffectsFromEdictMock,
}));

vi.mock("../storage.js", () => ({
  autoSaveIfEnabled: vi.fn(),
}));

vi.mock("../layout.js", () => ({
  updateTopbarByState: vi.fn(),
}));

vi.mock("../utils/toast.js", () => ({
  showError: vi.fn(),
}));

vi.mock("./coreGameplaySystem.js", () => ({
  applyProgressionToChoiceEffects: vi.fn((effects) => effects),
  extractCustomPoliciesFromEdict: vi.fn(() => []),
  mergeCustomPolicies: vi.fn((existing, newlyFound) => [...(existing || []), ...(newlyFound || [])]),
  processCoreGameplayTurn: vi.fn(() => ({ statePatch: {}, consequenceEffects: null })),
  resolveHostileForcesAfterChoice: vi.fn(() => null),
  scaleEffectsByExecution: vi.fn((effects) => effects),
}));

vi.mock("../api/validators.js", () => ({
  sanitizeStoryEffects: vi.fn((effects) => effects),
}));

vi.mock("../dataLoader.js", () => ({
  loadJSON: vi.fn(async () => ({ positions: [], departments: [] })),
}));

vi.mock("../utils/displayStateMetrics.js", () => ({
  captureDisplayStateSnapshot: vi.fn(() => ({})),
  buildOutcomeDisplayDelta: vi.fn(() => ({})),
}));

vi.mock("../utils/appointmentEffects.js", () => ({
  deriveAppointmentEffectsFromText: mocked.deriveAppointmentEffectsFromTextMock,
  normalizeAppointmentEffects: mocked.normalizeAppointmentEffectsMock,
}));

vi.mock("./kejuSystem.js", () => ({
  getKejuStateSnapshot: vi.fn((state) => ({
    stage: state?.keju?.stage || "idle",
    candidatePool: state?.keju?.candidatePool || [],
    publishedList: state?.keju?.publishedList || [],
    talentReserve: state?.keju?.talentReserve || [],
    generatedCandidates: state?.keju?.generatedCandidates || [],
    bureauMomentum: state?.keju?.bureauMomentum ?? 52,
    reserveQuality: state?.keju?.reserveQuality ?? 0,
    note: state?.keju?.note || "",
  })),
  getWujuStateSnapshot: vi.fn((state) => ({
    stage: state?.wuju?.stage || "idle",
    candidatePool: state?.wuju?.candidatePool || [],
    publishedList: state?.wuju?.publishedList || [],
    talentReserve: state?.wuju?.talentReserve || [],
    generatedCandidates: state?.wuju?.generatedCandidates || [],
    bureauMomentum: state?.wuju?.bureauMomentum ?? 50,
    reserveQuality: state?.wuju?.reserveQuality ?? 0,
    note: state?.wuju?.note || "",
  })),
  advanceKejuSession: vi.fn((snapshot) => snapshot),
  advanceWujuSession: vi.fn((snapshot) => snapshot),
  resetKejuForNextCycle: vi.fn((snapshot, note) => ({
    ...snapshot,
    stage: "idle",
    candidatePool: [],
    publishedList: [],
    generatedCandidates: [],
    reserveQuality: 0,
    note,
  })),
  resetWujuForNextCycle: vi.fn((snapshot, note) => ({
    ...snapshot,
    stage: "idle",
    candidatePool: [],
    publishedList: [],
    generatedCandidates: [],
    reserveQuality: 0,
    note,
  })),
}));

vi.mock("../utils/storyFacts.js", () => ({
  buildStoryFactsFromState: vi.fn(() => ({ phase: "test" })),
}));

import { getState, resetState, setState } from "../state.js";
import { runCurrentTurn } from "./turnSystem.js";
import { extractCustomPoliciesFromEdict, resolveHostileForcesAfterChoice } from "./coreGameplaySystem.js";
import { showError } from "../utils/toast.js";

describe("turnSystem dual-mode one-turn loop", () => {
  beforeEach(() => {
    resetState();
    setState({ currentYear: 3, currentMonth: 4, currentPhase: "morning" });
    mocked.renderStoryTurnMock.mockReset();
    mocked.pushCurrentTurnToHistoryMock.mockReset();
    mocked.applyEffectsMock.mockReset();
    mocked.deriveAppointmentEffectsFromTextMock.mockClear();
    mocked.normalizeAppointmentEffectsMock.mockClear();

    const main = document.createElement("div");
    main.id = "main-view";
    document.body.innerHTML = "";
    document.body.appendChild(main);
  });

  it("completes one classic-mode turn loop", async () => {
    let choiceTriggered = false;
    mocked.renderStoryTurnMock.mockImplementation(async (_state, _container, onChoice) => {
      if (!choiceTriggered) {
        choiceTriggered = true;
        await onChoice("classic_choice", "整饬吏治", null, { nation: { treasury: 1200 } });
      }
      return { choices: [] };
    });

    const container = document.getElementById("main-view");
    await runCurrentTurn(container);

    const state = getState();
    expect(state.lastChoiceId).toBe("classic_choice");
    expect(state.currentMonth).toBe(5);
    expect(state.currentYear).toBe(3);
    expect(mocked.pushCurrentTurnToHistoryMock).toHaveBeenCalled();
    expect(mocked.renderStoryTurnMock).toHaveBeenCalled();
  });

  it("does not advance to a new turn when llm next-turn generation fails", async () => {
    setState({
      config: {
        ...(getState().config || {}),
        storyMode: "llm",
      },
    });

    let renderCount = 0;
    mocked.renderStoryTurnMock.mockImplementation(async (_state, _container, onChoice) => {
      renderCount += 1;
      if (renderCount === 1) {
        await onChoice("classic_choice", "整饬吏治", null, { nation: { treasury: 1200 } });
        return true;
      }
      if (renderCount === 2) {
        return false;
      }
      return true;
    });

    const container = document.getElementById("main-view");
    await runCurrentTurn(container);

    const state = getState();
    expect(state.lastChoiceId).toBeNull();
    expect(state.currentMonth).toBe(4);
    expect(state.currentYear).toBe(3);
    expect(showError).toHaveBeenCalledWith("大模型本回合生成失败，未推进新回合，请稍后重试。");
  });

  it("applies estimated treasury and grain effects in classic mode when text contains amounts", async () => {
    mocked.estimateEffectsFromEdictMock.mockReturnValueOnce({
      treasury: 200000,
      grain: 30000,
    });

    let choiceTriggered = false;
    mocked.renderStoryTurnMock.mockImplementation(async (_state, _container, onChoice) => {
      if (!choiceTriggered) {
        choiceTriggered = true;
        await onChoice("custom_edict", "抄没入库20万两，拨粮3万石赈济", null, null);
      }
      return { choices: [] };
    });

    const container = document.getElementById("main-view");
    await runCurrentTurn(container);

    expect(mocked.estimateEffectsFromEdictMock).toHaveBeenCalled();
    expect(mocked.applyEffectsMock).toHaveBeenCalledWith(expect.objectContaining({
      treasury: 200000,
      grain: 30000,
    }));
  });

  it("does not trigger immediate natural deaths for Southern Song characters at game start", async () => {
    setState({
      config: {
        ...(getState().config || {}),
        startYear: 3,
        absoluteStartYear: 1129,
      },
      allCharacters: [
        {
          id: "sun_chengzong",
          name: "李纲",
          birthYear: 1083,
          deathYear: 1140,
          isAlive: true,
        },
      ],
      characterStatus: {
        sun_chengzong: { isAlive: true },
      },
      appointments: {
        neige_shoufu: "sun_chengzong",
      },
      systemNewsToday: [],
      currentYear: 3,
      currentMonth: 4,
    });

    let choiceTriggered = false;
    mocked.renderStoryTurnMock.mockImplementation(async (_state, _container, onChoice) => {
      if (!choiceTriggered) {
        choiceTriggered = true;
        await onChoice("classic_choice", "稳住朝局", null, { nation: { treasury: 1000 } });
      }
      return { choices: [] };
    });

    const container = document.getElementById("main-view");
    await runCurrentTurn(container);

    const state = getState();
    expect(state.characterStatus.sun_chengzong.isAlive).toBe(true);
    expect((state.systemNewsToday || []).some((item) => item?.title === "群臣讣告")).toBe(false);
    expect(state.appointments.neige_shoufu).toBe("sun_chengzong");
  });

  it("fills missing non-resource estimates in classic mode when custom edict already adds appointments", async () => {
    mocked.deriveAppointmentEffectsFromTextMock.mockReturnValueOnce({
      appointments: { libu_shangshu: "minister_a" },
    });
    mocked.estimateEffectsFromEdictMock.mockReturnValueOnce({
      treasury: -200000,
      militaryStrength: 8,
      civilMorale: 3,
    });

    let choiceTriggered = false;
    mocked.renderStoryTurnMock.mockImplementation(async (_state, _container, onChoice) => {
      if (!choiceTriggered) {
        choiceTriggered = true;
        await onChoice("custom_edict", "任命甲为吏部尚书，并发军饷", null, null);
      }
      return { choices: [] };
    });

    const container = document.getElementById("main-view");
    await runCurrentTurn(container);

    expect(mocked.applyEffectsMock).toHaveBeenCalledWith(expect.objectContaining({
      appointments: expect.objectContaining({ libu_shangshu: "minister_a" }),
      treasury: -200000,
      militaryStrength: 8,
      civilMorale: 3,
    }));
  });

  it("consumes pending policy edict content on the next real choice only", async () => {
    mocked.estimateEffectsFromEdictMock.mockReturnValueOnce({
      treasury: -150000,
      militaryStrength: 6,
    });

    setState({
      currentMonth: 4,
      currentYear: 3,
      policyDiscussion: {
        ...getState().policyDiscussion,
        pendingIssuedEdict: {
          content: "调拨军饷，增调边军",
          issuedAt: Date.now(),
        },
      },
    });

    let choiceTriggered = false;
    mocked.renderStoryTurnMock.mockImplementation(async (_state, _container, onChoice) => {
      if (!choiceTriggered) {
        choiceTriggered = true;
        await onChoice("classic_choice", "整饬江防", null, null);
      }
      return { choices: [] };
    });

    const container = document.getElementById("main-view");
    await runCurrentTurn(container);

    const state = getState();
    expect(state.lastChoiceId).toBe("classic_choice");
    expect(state.lastChoiceText).toBe("整饬江防\n【问政】调拨军饷，增调边军");
    expect(state.lastChoiceText).toContain("【问政】调拨军饷，增调边军");
    expect(state.lastChoiceText).not.toContain("边患告急");
    expect(state.policyDiscussion.pendingIssuedEdict).toBeNull();
    expect(mocked.applyEffectsMock).toHaveBeenCalledWith(expect.objectContaining({
      treasury: -150000,
      militaryStrength: 6,
    }));
  });

  it("grants one ability point and one policy point on quarter months", async () => {
    setState({
      currentMonth: 2,
      currentYear: 3,
      abilityPoints: 0,
      policyPoints: 0,
    });

    let choiceTriggered = false;
    mocked.renderStoryTurnMock.mockImplementation(async (_state, _container, onChoice) => {
      if (!choiceTriggered) {
        choiceTriggered = true;
        await onChoice("classic_choice", "整饬军政", null, { nation: { treasury: 1000 } });
      }
      return { choices: [] };
    });

    const container = document.getElementById("main-view");
    await runCurrentTurn(container);

    const state = getState();
    expect(state.currentMonth).toBe(3);
    expect(state.abilityPoints).toBe(1);
    expect(state.policyPoints).toBe(1);
  });

});
