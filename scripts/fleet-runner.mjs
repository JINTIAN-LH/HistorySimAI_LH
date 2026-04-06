import {
  buildArchitectReport,
  buildCoderReport,
  buildPhaseDiagnosis,
  loadFleetConfig,
  runTesterReport,
  writeFleetReport,
  writeWorkflowSummary,
} from "./fleetRunnerCore.mjs";

function getSubcommand() {
  return process.argv[2] || "run";
}

function printSummary(config) {
  const steps = Array.isArray(config?.workflow?.steps) ? config.workflow.steps : [];
  const commands = Array.isArray(config?.verification?.commands) ? config.verification.commands : [];

  const payload = {
    name: config?.name,
    defaultWorkflow: config?.default_workflow === true,
    projectType: config?.project?.type,
    runtimeProfile: config?.project?.runtime_profile,
    localEntry: config?.execution?.local_entry,
    steps: steps.map((step) => ({ id: step.id, agent: step.agent, task: step.task })),
    verificationCommands: commands,
  };

  console.log(JSON.stringify(payload, null, 2));
}

async function runPhase(phase, config) {
  let report;
  if (phase === "architect") {
    report = await buildArchitectReport(config);
  } else if (phase === "coder") {
    report = await buildCoderReport(config);
  } else if (phase === "tester") {
    report = await runTesterReport(config);
  } else {
    throw new Error(`Unknown Fleet phase: ${phase}`);
  }

  await writeFleetReport(report, config);
  console.log(`[fleet] ${phase} phase ${report.status}`);

  return report;
}

async function runWorkflow(config) {
  const steps = Array.isArray(config?.workflow?.steps) ? config.workflow.steps : [];
  const reports = [];
  for (const step of steps) {
    const phase = step?.id || step?.agent;
    console.log(`[fleet] running ${phase}: ${step?.task || ""}`);
    const report = await runPhase(phase, config);
    reports.push(report);
    await writeWorkflowSummary(reports, config);
    if (report.status !== "passed") {
      const diagnosis = buildPhaseDiagnosis(report);
      throw new Error([
        `${phase} phase failed.`,
        diagnosis.headline,
        ...diagnosis.failedChecks.map((check) => `- ${check.name}: ${check.details}`),
        `Next action: ${diagnosis.nextAction}`,
      ].join("\n"));
    }
  }

  return reports;
}

async function main() {
  const subcommand = getSubcommand();
  const config = await loadFleetConfig();

  if (subcommand === "summary") {
    printSummary(config);
    return;
  }

  if (subcommand === "run") {
    await runWorkflow(config);
    return;
  }

  if (subcommand === "phase") {
    const phase = process.argv[3];
    if (!phase) {
      throw new Error("Missing phase name. Usage: node scripts/fleet-runner.mjs phase <architect|coder|tester>");
    }
    await runPhase(phase, config);
    return;
  }

  throw new Error(`Unknown command: ${subcommand}`);
}

main().catch((error) => {
  console.error("[fleet] execution failed");
  console.error(error?.stack || String(error));
  process.exit(1);
});