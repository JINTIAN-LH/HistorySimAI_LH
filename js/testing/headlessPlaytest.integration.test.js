import { describe, expect, it } from "vitest";
import { runHeadlessPlaytest, runMultiStrategyHeadlessRegression } from "../../scripts/headless-playtest.mjs";

describe("headless playtest integration", () => {
  it(
    "completes a 24-turn campaign with stable save/load checkpoints",
    async () => {
      const report = await runHeadlessPlaytest({ turns: 24 });

      expect(report.turnsRequested).toBe(24);
      expect(report.finalState.storyHistoryLength).toBe(24);
      expect(report.finalState.year).toBe(3);
      expect(report.finalState.month).toBe(1);
      expect(report.phaseSummaries).toHaveLength(3);
      expect(report.saveChecks).toHaveLength(4);
      expect(report.saveChecks.every((item) => item.consistent)).toBe(true);
    },
    120000
  );

  it(
    "supports distinct multi-strategy regressions",
    async () => {
      const report = await runMultiStrategyHeadlessRegression({ turns: 24, strategies: ["consult", "military", "relief"] });

      expect(report.strategies).toHaveLength(3);
      expect(report.strategies.map((item) => item.strategy)).toEqual(["consult", "military", "relief"]);
      expect(report.strategies.every((item) => item.finalState.storyHistoryLength === 24)).toBe(true);
      expect(report.strategies.every((item) => item.consistency.allConsistent)).toBe(true);
      expect(report.strategies.every((item) => item.consistency.badDisplay === 0)).toBe(true);
      expect(report.strategies.every((item) => item.consistency.badPanel === 0)).toBe(true);
    },
    120000
  );

  it(
    "keeps edict display delta and nation panel values consistent across 24 turns",
    async () => {
      const report = await runHeadlessPlaytest({ turns: 24 });

      expect(report.turnLogs).toHaveLength(24);
      expect(report.turnLogs.every((item) => item.displayConsistency)).toBe(true);
      expect(report.turnLogs.every((item) => item.nationPanelConsistency)).toBe(true);
    },
    120000
  );
});