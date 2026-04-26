import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const root = process.cwd();
const publicRoot = path.join(root, "public");
const SAVE_CHECK_TURNS = new Set([1, 8, 16, 24]);
const DEFAULT_STRATEGY = "balanced";

const STRATEGY_PROFILES = {
  balanced: {
    id: "balanced",
    label: "平衡流",
    storyChoicePriority: ["围剿陕西流寇", "拨银三十万两", "廷议"],
    agendaPriority: ["military_expansion", "military_followup", "frontier_defense", "relief_shaanxi", "diplomacy_trade", "domestic_followup", "followup_court_consultation_delay"],
    stancePriority: ["support", "compromise", "oppose", "suppress"],
    factionPriority: ["military", "donglin", "imperial", "neutral", "eunuch"],
  },
  consult: {
    id: "consult",
    label: "廷议流",
    storyChoicePriority: ["廷议", "拨银三十万两", "围剿陕西流寇"],
    agendaPriority: ["followup_court_consultation_delay", "diplomacy_trade", "domestic_followup", "year_end_reward_ministers", "frontier_defense", "military_followup", "military_expansion"],
    stancePriority: ["support", "compromise", "oppose", "suppress"],
    factionPriority: ["donglin", "neutral", "imperial", "military", "eunuch"],
  },
  military: {
    id: "military",
    label: "军事流",
    storyChoicePriority: ["拨银三十万两", "围剿陕西流寇", "廷议"],
    agendaPriority: ["military_expansion", "military_followup", "frontier_defense", "diplomacy_trade", "year_end_reward_ministers", "domestic_followup", "followup_court_consultation_delay"],
    stancePriority: ["support", "compromise", "suppress", "oppose"],
    factionPriority: ["military", "imperial", "donglin", "neutral", "eunuch"],
  },
  relief: {
    id: "relief",
    label: "赈灾流",
    storyChoicePriority: ["围剿陕西流寇", "廷议", "拨银三十万两"],
    agendaPriority: ["relief_shaanxi", "domestic_followup", "year_end_general_amnesty", "diplomacy_trade", "frontier_defense", "followup_court_consultation_delay", "military_expansion"],
    stancePriority: ["support", "compromise", "oppose", "suppress"],
    factionPriority: ["donglin", "neutral", "imperial", "military", "eunuch"],
  },
};

function getArgValue(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  if (!value) return fallback;
  return value.slice(prefix.length);
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function getStrategyProfile(strategyId) {
  return STRATEGY_PROFILES[strategyId] || STRATEGY_PROFILES[DEFAULT_STRATEGY];
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

function toModuleUrl(relativePath) {
  return pathToFileURL(path.join(root, relativePath)).href;
}

function normalizeText(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function createResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return JSON.parse(body);
    },
    async text() {
      return body;
    },
  };
}

function setupDom() {
  const dom = new JSDOM(
    "<!DOCTYPE html><html><body><div id=\"app\"><div id=\"topbar\"></div><div id=\"bottombar\"></div><div id=\"main-view\"></div></div></body></html>",
    {
      url: "http://localhost/",
      pretendToBeVisual: true,
    }
  );

  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.navigator = window.navigator;
  globalThis.localStorage = window.localStorage;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.Element = window.Element;
  globalThis.Node = window.Node;
  globalThis.NodeFilter = window.NodeFilter;
  globalThis.CustomEvent = window.CustomEvent;
  globalThis.Event = window.Event;
  globalThis.MouseEvent = window.MouseEvent;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  window.matchMedia = () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  });
  window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {};

  globalThis.fetch = async (input) => {
    const raw = typeof input === "string" ? input : input?.url || String(input);
    if (/^https?:/i.test(raw)) {
      throw new Error(`External fetch is disabled in headless playtest: ${raw}`);
    }
    const filePath = path.join(publicRoot, raw.replace(/^\/+/, ""));
    try {
      const content = await fs.readFile(filePath, "utf8");
      return createResponse(content, 200);
    } catch (error) {
      return createResponse(JSON.stringify({ error: String(error?.message || error) }), 404);
    }
  };
  window.fetch = globalThis.fetch;
}

function summarizeHostiles(hostileForces) {
  return (hostileForces || [])
    .filter((item) => !item.isDefeated)
    .map((item) => ({ name: item.name, power: item.power }));
}

function snapshotState(state) {
  return {
    year: state.currentYear,
    month: state.currentMonth,
    currentDay: state.currentDay,
    nation: { ...(state.nation || {}) },
    hostileForces: (state.hostileForces || []).map((item) => ({
      id: item.id,
      power: item.power,
      isDefeated: item.isDefeated,
    })),
    storyHistoryLength: Array.isArray(state.storyHistory) ? state.storyHistory.length : 0,
  };
}

function summarizeConsistency(turnLogs) {
  const logs = Array.isArray(turnLogs) ? turnLogs : [];
  const badDisplay = logs.filter((item) => !item.displayConsistency).length;
  const badPanel = logs.filter((item) => !item.nationPanelConsistency).length;
  return {
    badDisplay,
    badPanel,
    allConsistent: badDisplay === 0 && badPanel === 0,
  };
}

export class HeadlessPlaytestDriver {
  constructor(turns, strategyId = DEFAULT_STRATEGY) {
    this.turns = turns;
    this.strategy = getStrategyProfile(strategyId);
    this.dom = setupDom();
    this.modules = null;
    this.strategyUsage = new Map();
    this.saveChecks = [];
    this.turnLogs = [];
    this.phaseSummaries = [];
  }

  async init() {
    const [
      stateModule,
      turnSystemModule,
      coreGameplayModule,
      storyFactsModule,
      storageModule,
      displayMetricsModule,
    ] = await Promise.all([
      import(toModuleUrl("js/state.js")),
      import(toModuleUrl("js/systems/turnSystem.js")),
      import(toModuleUrl("js/systems/coreGameplaySystem.js")),
      import(toModuleUrl("js/utils/storyFacts.js")),
      import(toModuleUrl("js/storage.js")),
      import(toModuleUrl("js/utils/displayStateMetrics.js")),
    ]);

    this.modules = {
      ...stateModule,
      ...turnSystemModule,
      ...coreGameplayModule,
      ...storyFactsModule,
      ...displayMetricsModule,
      storage: storageModule,
    };
  }

  get state() {
    return this.modules.getState();
  }

  get mainView() {
    return document.getElementById("main-view");
  }

  async loadJson(relativePath) {
    return fetch(relativePath).then((response) => response.json());
  }

  async bootstrapClassicMode() {
    const [
      config,
      balanceConfig,
      charactersData,
      factionsData,
      goals,
      nationInit,
      positionsData,
    ] = await Promise.all([
      this.loadJson("data/config.json"),
      this.loadJson("data/balanceConfig.json"),
      this.loadJson("data/characters.json"),
      this.loadJson("data/factions.json"),
      this.loadJson("data/goals.json"),
      this.loadJson("data/nationInit.json"),
      this.loadJson("data/positions.json"),
    ]);

    this.modules.resetState();
    const allCharacters = charactersData.characters || charactersData.ministers || [];
    const factions = factionsData.factions || [];
    const testConfig = {
      ...config,
      balance: balanceConfig || {},
      storyMode: "template",
      gameplayMode: "classic",
      autoSave: false,
      apiBase: "",
    };
    const nation = {
      treasury: nationInit.treasury || 500000,
      grain: nationInit.grain || 30000,
      militaryStrength: nationInit.militaryStrength || 60,
      civilMorale: nationInit.civilMorale || 35,
      borderThreat: nationInit.borderThreat || 75,
      disasterLevel: nationInit.disasterLevel || 70,
      corruptionLevel: nationInit.corruptionLevel || 80,
    };
    const coreState = this.modules.initializeCoreGameplayState(
      this.modules.getState(),
      factions,
      testConfig,
      nationInit
    );

    this.modules.setState({
      config: testConfig,
      allCharacters,
      factions,
      goals: Array.isArray(goals) ? goals : [],
      positionsMeta: positionsData || { positions: [], departments: [] },
      nation,
      gameStarted: true,
      mode: "classic",
      ...coreState,
    });
    this.modules.setState({
      storyFacts: this.modules.buildStoryFactsFromState(this.modules.getState()),
    });
  }

  async delay(ms = 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async waitFor(predicate, timeoutMs, description) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const value = predicate();
      if (value) return value;
      await this.delay(20);
    }
    throw new Error(`Timed out waiting for ${description}`);
  }

  async click(node, description) {
    if (!node) {
      throw new Error(`Missing node for ${description}`);
    }
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await this.delay(30);
  }

  getStoryActionButtons() {
    return Array.from(document.querySelectorAll(".story-action-btn"));
  }

  findStoryButtonByIncludes(text) {
    return this.getStoryActionButtons().find((button) => normalizeText(button.textContent).includes(text));
  }

  async renderCurrentTurn() {
    this.mainView.innerHTML = "";
    await this.modules.runCurrentTurn(this.mainView);
    await this.delay(30);
  }

  chooseStoryAction(turnNumber) {
    const buttons = this.getStoryActionButtons().filter(
      (button) => !normalizeText(button.textContent).includes("自拟诏书")
    );
    const find = (text) => buttons.find((button) => normalizeText(button.textContent).includes(text));
    const state = this.state;

    for (const preferred of this.strategy.storyChoicePriority) {
      const matched = find(preferred);
      if (!matched) continue;
      if (preferred.includes("廷议") && (state.nation?.treasury || 0) < 80000) {
        continue;
      }
      if (preferred.includes("拨银三十万两") && (state.nation?.treasury || 0) < 200000) {
        continue;
      }
      return matched;
    }

    if (turnNumber % 6 === 1) {
      return find("围剿陕西流寇") || buttons[0];
    }
    if ((state.nation?.treasury || 0) < 160000) {
      return find("廷议") || buttons[0];
    }
    if ((state.nation?.civilMorale || 0) < 40) {
      return find("围剿陕西流寇") || buttons[0];
    }
    if ((state.nation?.borderThreat || 0) > 60) {
      return find("拨银三十万两") || buttons[0];
    }
    return find("廷议") || find("围剿陕西流寇") || buttons[0];
  }

  async resolveMilitaryOverlay() {
    let loops = 0;
    while (document.getElementById("mil-overlay") && loops < 20) {
      loops += 1;

      const startButton = Array.from(document.querySelectorAll(".mil-primary-btn")).find((button) =>
        normalizeText(button.textContent).includes("开始作战")
      );
      if (startButton) {
        await this.click(startButton, "military start button");
        continue;
      }

      const continueButton = Array.from(document.querySelectorAll(".mil-primary-btn")).find((button) =>
        normalizeText(button.textContent).includes("返回诏书界面")
      );
      if (continueButton) {
        await this.click(continueButton, "military continue button");
        await this.delay(50);
        continue;
      }

      const decisionButtons = Array.from(document.querySelectorAll(".mil-decision-btn"));
      if (decisionButtons.length) {
        const title = normalizeText(document.querySelector(".mil-phase-title")?.textContent);
        const roundMatch = title.match(/第\s*(\d+)\s*\/\s*(\d+)/);
        const round = roundMatch ? Number(roundMatch[1]) : 1;
        const choose = (text) => decisionButtons.find((button) => normalizeText(button.textContent).includes(text));
        const decision = round === 1
          ? choose("骑兵冲锋") || choose("稳步推进") || decisionButtons[0]
          : round === 2
            ? choose("坚守待机") || choose("稳步推进") || decisionButtons[0]
            : choose("主将亲率") || choose("稳步推进") || decisionButtons[0];
        await this.click(decision, `military decision round ${round}`);
        continue;
      }

      await this.delay(30);
    }

    if (document.getElementById("mil-overlay")) {
      throw new Error("Military overlay did not resolve within loop budget");
    }
  }

  async performSaveCheck(turnNumber) {
    if (!SAVE_CHECK_TURNS.has(turnNumber)) {
      return;
    }
    const slotId = `manual_${String(turnNumber).padStart(2, "0")}`;
    const beforeSave = snapshotState(this.state);
    this.modules.storage.saveGame({ slotId, mode: this.state.mode || "classic" });
    const loaded = this.modules.storage.loadGame(slotId, this.state.mode || "classic");
    this.modules.storage.applyLoadedGame(loaded);
    const afterLoad = snapshotState(this.state);
    this.saveChecks.push({
      turn: turnNumber,
      slotId,
      consistent: JSON.stringify(beforeSave) === JSON.stringify(afterLoad),
      beforeSave,
      afterLoad,
    });
  }

  maybeSummarizePhase(turnNumber) {
    if (turnNumber % 8 !== 0) {
      return;
    }
    const state = this.state;
    const dominantChoice = [...this.strategyUsage.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "";
    this.phaseSummaries.push({
      range: `${turnNumber - 7}-${turnNumber}`,
      treasury: state.nation?.treasury,
      grain: state.nation?.grain,
      militaryStrength: state.nation?.militaryStrength,
      civilMorale: state.nation?.civilMorale,
      borderThreat: state.nation?.borderThreat,
      activeHostiles: summarizeHostiles(state.hostileForces),
      dominantChoice,
    });
  }

  async playTurn(turnNumber) {
    const before = this.state;
    const beforeMonthKey = `${before.currentYear}-${before.currentMonth}`;
    const beforeDisplaySnapshot = this.modules.captureDisplayStateSnapshot(before);
    await this.renderCurrentTurn();

    const button = this.chooseStoryAction(turnNumber);
    const choiceLabel = normalizeText(button?.textContent);
    if (!button) {
      throw new Error(`No story action button found on turn ${turnNumber}`);
    }

    this.strategyUsage.set(choiceLabel, (this.strategyUsage.get(choiceLabel) || 0) + 1);
    await this.click(button, `story action turn ${turnNumber}`);
    await this.resolveMilitaryOverlay();

    await this.waitFor(
      () => {
        const current = this.state;
        return `${current.currentYear}-${current.currentMonth}` !== beforeMonthKey ? current : null;
      },
      5000,
      `turn ${turnNumber} state advance`
    );

    const current = this.state;
    const afterDisplaySnapshot = this.modules.captureDisplayStateSnapshot(current);
    const expectedDisplayEffects = this.modules.buildOutcomeDisplayDelta(beforeDisplaySnapshot, afterDisplaySnapshot);
    const history = Array.isArray(current.storyHistory) ? current.storyHistory : [];
    const latestHistoryEntry = history.length ? history[history.length - 1] : null;
    const actualDisplayEffects = latestHistoryEntry?.displayEffects || latestHistoryEntry?.effects || null;
    const displayConsistency = JSON.stringify(expectedDisplayEffects) === JSON.stringify(actualDisplayEffects || {});

    const nationPanelValues = afterDisplaySnapshot?.nation || {};
    const stateNationValues = {
      treasury: current.nation?.treasury ?? 0,
      grain: current.nation?.grain ?? 0,
      militaryStrength: current.nation?.militaryStrength ?? 50,
      civilMorale: current.nation?.civilMorale ?? 50,
      borderThreat: current.nation?.borderThreat ?? 50,
      disasterLevel: current.nation?.disasterLevel ?? 50,
      corruptionLevel: current.nation?.corruptionLevel ?? 50,
    };
    const nationPanelConsistency = JSON.stringify(nationPanelValues) === JSON.stringify(stateNationValues);

    this.turnLogs.push({
      turn: turnNumber,
      choice: choiceLabel,
      year: current.currentYear,
      month: current.currentMonth,
      treasury: current.nation?.treasury,
      grain: current.nation?.grain,
      militaryStrength: current.nation?.militaryStrength,
      civilMorale: current.nation?.civilMorale,
      borderThreat: current.nation?.borderThreat,
      activeHostiles: summarizeHostiles(current.hostileForces),
      displayConsistency,
      nationPanelConsistency,
      expectedDisplayEffects: displayConsistency ? undefined : expectedDisplayEffects,
      actualDisplayEffects: displayConsistency ? undefined : actualDisplayEffects,
      nationPanelValues: nationPanelConsistency ? undefined : nationPanelValues,
      stateNationValues: nationPanelConsistency ? undefined : stateNationValues,
    });

    await this.performSaveCheck(turnNumber);
    this.maybeSummarizePhase(turnNumber);
  }

  async run() {
    await this.init();
    await this.bootstrapClassicMode();
    for (let turn = 1; turn <= this.turns; turn += 1) {
      await this.playTurn(turn);
    }
    return {
      turnsRequested: this.turns,
      strategy: this.strategy.id,
      finalState: snapshotState(this.state),
      phaseSummaries: this.phaseSummaries,
      saveChecks: this.saveChecks,
      turnLogs: this.turnLogs,
    };
  }

  dispose() {
    if (this.dom?.window?.close) {
      this.dom.window.close();
    }
  }
}

export async function runHeadlessPlaytest({ turns = 24, strategy = DEFAULT_STRATEGY } = {}) {
  const driver = new HeadlessPlaytestDriver(Number.isFinite(turns) && turns > 0 ? turns : 24, strategy);
  try {
    return await driver.run();
  } finally {
    driver.dispose();
  }
}

export async function runMultiStrategyHeadlessRegression({ turns = 24, strategies = ["consult", "military", "relief"] } = {}) {
  const reports = [];
  for (const strategy of strategies) {
    reports.push(await runHeadlessPlaytest({ turns, strategy }));
  }
  return {
    turnsRequested: turns,
    strategies: reports.map((report) => ({
      strategy: report.strategy,
      finalState: report.finalState,
      phaseSummaries: report.phaseSummaries,
      consistency: summarizeConsistency(report.turnLogs),
    })),
  };
}

if (isMainModule()) {
  const turns = Number.parseInt(getArgValue("turns", "24"), 10);
  const summaryOnly = hasFlag("summary-only");
  const compareStrategies = hasFlag("compare-strategies");
  const strategy = getArgValue("strategy", DEFAULT_STRATEGY);

  try {
    const report = compareStrategies
      ? await runMultiStrategyHeadlessRegression({ turns })
      : await runHeadlessPlaytest({ turns, strategy });
    const output = summaryOnly
      ? {
          ...(compareStrategies
            ? report
            : {
                turnsRequested: report.turnsRequested,
                strategy: report.strategy,
                finalState: report.finalState,
                phaseSummaries: report.phaseSummaries,
                saveChecks: report.saveChecks.map(({ turn, slotId, consistent }) => ({ turn, slotId, consistent })),
              }),
        }
      : report;
    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("[headless-playtest] failed");
    console.error(error?.stack || String(error));
    process.exit(1);
  }
}