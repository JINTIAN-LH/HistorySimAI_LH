import { describe, expect, it } from "vitest";
import { runHeadlessPlaytest, runMultiStrategyHeadlessRegression } from "../../scripts/headless-playtest.mjs";

describe("headless playtest integration", () => {
  it(
    "completes a 24-turn campaign with quarter agenda and stable save/load checkpoints",
    async () => {
      const report = await runHeadlessPlaytest({ turns: 24 });

      expect(report.turnsRequested).toBe(24);
      expect(report.finalState.storyHistoryLength).toBe(24);
      expect(report.finalState.year).toBe(5);
      expect(report.finalState.month).toBe(4);
      expect(report.quarterSelections).toHaveLength(8);
      expect(report.quarterSelections.every((item) => item.agendaId && item.stance && item.factionId)).toBe(true);
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
      expect(report.strategies.every((item) => item.consistency.badQuarter === 0)).toBe(true);
    },
    120000
  );

  it(
    "keeps edict display delta, nation panel values, and quarterly settlement writeback consistent across 24 turns",
    async () => {
      const report = await runHeadlessPlaytest({ turns: 24 });

      expect(report.turnLogs).toHaveLength(24);
      expect(report.turnLogs.every((item) => item.displayConsistency)).toBe(true);
      expect(report.turnLogs.every((item) => item.nationPanelConsistency)).toBe(true);
      expect(report.turnLogs.every((item) => item.quarterSettlementConsistency)).toBe(true);

      const quarterTurns = report.turnLogs.filter((item) => item.quarterExpected);
      expect(quarterTurns).toHaveLength(8);
      expect(quarterTurns.every((item) => item.quarterSettlementRecorded)).toBe(true);
    },
    120000
  );
});