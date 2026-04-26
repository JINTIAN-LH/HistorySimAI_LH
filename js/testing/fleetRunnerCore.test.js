import { describe, expect, it } from "vitest";
import {
  buildArchitectReport,
  buildCoderReport,
  buildPhaseDiagnosis,
  buildWorkflowSummary,
  getTesterCommands,
  loadFleetConfig,
} from "../../scripts/fleetRunnerCore.mjs";

describe("fleetRunnerCore", () => {
  it("loads the Fleet workflow config", async () => {
    const config = await loadFleetConfig();

    expect(config.default_workflow).toBe(true);
    expect(config.project.type).toBe("browser-narrative-strategy-sim");
    expect(config.workflow.steps).toHaveLength(3);
  });

  it("passes the architect phase checks for the current repo", async () => {
    const config = await loadFleetConfig();
    const report = await buildArchitectReport(config);

    expect(report.phase).toBe("architect");
    expect(report.status).toBe("passed");
    expect(report.checks.every((check) => check.passed)).toBe(true);
  });

  it("passes the coder phase checks and exposes tester commands", async () => {
    const config = await loadFleetConfig();
    const report = await buildCoderReport(config);

    expect(report.phase).toBe("coder");
    expect(report.status).toBe("passed");
    expect(getTesterCommands(config)).toEqual([
      "npm run build",
      "npm test",
      "npm run verify:experience",
    ]);
  });

  it("builds a PR-oriented workflow summary for passing reports", async () => {
    const config = await loadFleetConfig();
    const architectReport = await buildArchitectReport(config);
    const coderReport = await buildCoderReport(config);
    const summary = buildWorkflowSummary(config, [architectReport, coderReport]);

    expect(summary.status).toBe("passed");
    expect(summary.blockedPhase).toBe(null);
    expect(summary.markdown).toContain("# Fleet PR Summary");
    expect(summary.markdown).toContain("Ready for review");
  });

  it("builds explicit failure diagnosis for blocked phases", () => {
    const diagnosis = buildPhaseDiagnosis({
      phase: "tester",
      checks: [
        { name: "command: npm test", passed: false, details: "exitCode=1" },
      ],
    });

    expect(diagnosis.headline).toContain("tester phase blocked");
    expect(diagnosis.failedChecks).toHaveLength(1);
    expect(diagnosis.nextAction).toContain("failing command output");
  });
});