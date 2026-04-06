import { runHeadlessPlaytest, runMultiStrategyHeadlessRegression } from "./headless-playtest.mjs";

function getArgValue(name, fallback) {
  const prefix = `--${name}=`;
  const arg = process.argv.find((item) => item.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function summarizeCycle(index, baselineReport, multiStrategyReport) {
  return {
    cycle: index,
    baseline: {
      strategy: baselineReport.strategy,
      turnsRequested: baselineReport.turnsRequested,
      finalStoryHistoryLength: baselineReport.finalState.storyHistoryLength,
      saveChecksPassed: baselineReport.saveChecks.every((item) => item.consistent),
    },
    strategies: multiStrategyReport.strategies.map((item) => ({
      strategy: item.strategy,
      storyHistoryLength: item.finalState.storyHistoryLength,
      consistency: item.consistency,
    })),
  };
}

async function main() {
  const cycles = parsePositiveInt(getArgValue("cycles", "2"), 2);
  const turns = parsePositiveInt(getArgValue("turns", "24"), 24);
  const baselineStrategy = getArgValue("baseline", "balanced");
  const strategies = getArgValue("strategies", "consult,military,relief")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const cycleSummaries = [];

  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    const baselineReport = await runHeadlessPlaytest({ turns, strategy: baselineStrategy });
    const multiStrategyReport = await runMultiStrategyHeadlessRegression({ turns, strategies });

    assert(baselineReport.finalState.storyHistoryLength === turns, `Cycle ${cycle}: baseline story history length drifted.`);
    assert(baselineReport.saveChecks.every((item) => item.consistent), `Cycle ${cycle}: baseline save/load verification failed.`);
    assert(
      baselineReport.turnLogs.every((item) => item.displayConsistency && item.nationPanelConsistency && item.quarterSettlementConsistency),
      `Cycle ${cycle}: baseline panel or quarterly consistency failed.`
    );

    multiStrategyReport.strategies.forEach((item) => {
      assert(item.finalState.storyHistoryLength === turns, `Cycle ${cycle}: strategy ${item.strategy} ended with incorrect story length.`);
      assert(item.consistency.allConsistent, `Cycle ${cycle}: strategy ${item.strategy} has inconsistent gameplay signals.`);
    });

    cycleSummaries.push(summarizeCycle(cycle, baselineReport, multiStrategyReport));
  }

  console.log(JSON.stringify({
    status: "passed",
    cycles,
    turns,
    baselineStrategy,
    strategies,
    cycleSummaries,
  }, null, 2));

  process.exit(0);
}

main().catch((error) => {
  console.error("[verify-player-experience] failed");
  console.error(error?.stack || String(error));
  process.exit(1);
});