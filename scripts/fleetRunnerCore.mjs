import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import YAML from "yaml";

const DEFAULT_FLEET_PATH = path.join(".fleet", "fleet.yaml");

function normalizeBool(value) {
  return Boolean(value);
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function makeCheck(name, passed, details) {
  return { name, passed: normalizeBool(passed), details };
}

function buildStatus(checks) {
  return checks.every((item) => item.passed) ? "passed" : "failed";
}

function statusIcon(status) {
  return status === "passed" ? "PASS" : "FAIL";
}

function escapeCell(value) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

export function getReportStats(report) {
  const checks = Array.isArray(report?.checks) ? report.checks : [];
  const passedChecks = checks.filter((item) => item.passed).length;
  return {
    totalChecks: checks.length,
    passedChecks,
    failedChecks: checks.length - passedChecks,
  };
}

export function getFailedChecks(report) {
  return (report?.checks || []).filter((item) => !item.passed);
}

export function buildPhaseDiagnosis(report) {
  const failedChecks = getFailedChecks(report);
  if (!failedChecks.length) {
    return {
      headline: `${report.phase} phase cleared all gates.`,
      nextAction: "No follow-up required.",
      failedChecks: [],
    };
  }

  const primaryFailure = failedChecks[0];
  const nextAction = report.phase === "tester"
    ? "Inspect the failing command output first, then rerun npm run fleet:run after the underlying build or test issue is fixed."
    : `Repair the missing or inconsistent ${report.phase} inputs, then rerun npm run fleet:run.`;

  return {
    headline: `${report.phase} phase blocked by ${failedChecks.length} failing check(s).`,
    nextAction,
    failedChecks,
    primaryFailure,
  };
}

export async function loadFleetConfig(rootDir = process.cwd()) {
  const fleetFile = path.join(rootDir, DEFAULT_FLEET_PATH);
  const raw = await fs.readFile(fleetFile, "utf8");
  return YAML.parse(raw);
}

export async function buildArchitectReport(config, rootDir = process.cwd()) {
  const architectureSource = config?.project?.architecture_source;
  const runtimeProfile = config?.project?.runtime_profile;
  const requiredFiles = [
    architectureSource,
    "client/index.html",
    "client/src/main.js",
    "client/src/bootstrap/startApplication.js",
    "client/src/architecture/selectRuntimeProfile.js",
    "js/main.js",
    "server/index.js",
  ].filter(Boolean);

  const fileChecks = await Promise.all(
    requiredFiles.map(async (relativePath) => {
      const absolutePath = path.join(rootDir, relativePath);
      return makeCheck(`required file: ${relativePath}`, await pathExists(absolutePath), absolutePath);
    })
  );

  const checks = [
    makeCheck("default workflow enabled", config?.default_workflow === true, String(config?.default_workflow)),
    makeCheck("project type selected", Boolean(config?.project?.type), config?.project?.type || "missing"),
    makeCheck("runtime profile declared", Boolean(runtimeProfile), runtimeProfile || "missing"),
    ...fileChecks,
  ];

  return {
    phase: "architect",
    status: buildStatus(checks),
    summary: {
      workflowName: config?.workflow?.name || "unknown",
      projectType: config?.project?.type || "unknown",
      architectureSource,
      runtimeProfile,
    },
    checks,
    stats: getReportStats({ checks }),
  };
}

export async function buildCoderReport(config, rootDir = process.cwd()) {
  const packageJson = await readJson(path.join(rootDir, "package.json"));
  const scripts = packageJson?.scripts || {};
  const requiredScripts = ["build", "test", "verify:experience", "fleet:run", "fleet:summary"];
  const requiredFiles = [
    "scripts/verify-player-experience.mjs",
    "scripts/fleet-runner.mjs",
    "scripts/fleetRunnerCore.mjs",
    "client/src/bootstrap/startApplication.js",
    "js/main.js",
  ];

  const scriptChecks = requiredScripts.map((scriptName) =>
    makeCheck(`package script: ${scriptName}`, typeof scripts[scriptName] === "string", scripts[scriptName] || "missing")
  );

  const fileChecks = await Promise.all(
    requiredFiles.map(async (relativePath) => {
      const absolutePath = path.join(rootDir, relativePath);
      return makeCheck(`implementation file: ${relativePath}`, await pathExists(absolutePath), absolutePath);
    })
  );

  const checks = [
    makeCheck("verification commands declared", Array.isArray(config?.verification?.commands) && config.verification.commands.length >= 3, JSON.stringify(config?.verification?.commands || [])),
    ...scriptChecks,
    ...fileChecks,
  ];

  return {
    phase: "coder",
    status: buildStatus(checks),
    summary: {
      runtimeProfile: config?.project?.runtime_profile || "unknown",
      packageScripts: requiredScripts,
    },
    checks,
    stats: getReportStats({ checks }),
  };
}

export function getTesterCommands(config) {
  return Array.isArray(config?.verification?.commands) ? config.verification.commands : [];
}

export async function runShellCommand(command, rootDir = process.cwd()) {
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: rootDir,
      shell: true,
      stdio: "inherit",
      env: process.env,
    });

    child.on("close", (code) => {
      resolve({ command, code: code ?? 1, passed: code === 0 });
    });
  });
}

export async function runTesterReport(config, rootDir = process.cwd()) {
  const commands = getTesterCommands(config);
  const commandResults = [];

  for (const command of commands) {
    const result = await runShellCommand(command, rootDir);
    commandResults.push(result);
    if (!result.passed) {
      break;
    }
  }

  const checks = commandResults.map((result) =>
    makeCheck(`command: ${result.command}`, result.passed, `exitCode=${result.code}`)
  );

  return {
    phase: "tester",
    status: buildStatus(checks),
    summary: {
      commands,
      completed: commandResults.length,
    },
    checks,
    stats: getReportStats({ checks }),
  };
}

function toMarkdown(report) {
  const stats = report.stats || getReportStats(report);
  const diagnosis = buildPhaseDiagnosis(report);
  const summaryLines = Object.entries(report.summary || {}).map(([key, value]) => `- ${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
  const checkRows = (report.checks || []).map((check) => `| ${escapeCell(check.name)} | ${check.passed ? "PASS" : "FAIL"} | ${escapeCell(check.details)} |`);
  const failureLines = diagnosis.failedChecks.length
    ? diagnosis.failedChecks.map((check) => `- ${check.name}: ${check.details}`)
    : ["- None"];
  return [
    `# Fleet ${report.phase} phase`,
    "",
    `Status: ${statusIcon(report.status)}`,
    "",
    "## PR Summary",
    `- Gate: ${report.status === "passed" ? "Ready" : "Blocked"}`,
    `- Checks: ${stats.passedChecks}/${stats.totalChecks} passed`,
    `- Diagnosis: ${diagnosis.headline}`,
    `- Next action: ${diagnosis.nextAction}`,
    "",
    "## Context",
    ...summaryLines,
    "",
    "## Check Matrix",
    "| Check | Result | Details |",
    "| --- | --- | --- |",
    ...checkRows,
    "",
    "## Failures",
    ...failureLines,
    "",
  ].join("\n");
}

export function buildWorkflowSummary(config, reports) {
  const safeReports = Array.isArray(reports) ? reports : [];
  const steps = Array.isArray(config?.workflow?.steps) ? config.workflow.steps : [];
  const phaseToTask = new Map(steps.map((step) => [step.id || step.agent, step.task || ""]));
  const overallStatus = safeReports.every((report) => report.status === "passed") ? "passed" : "failed";
  const blockedReport = safeReports.find((report) => report.status !== "passed") || null;
  const overviewRows = safeReports.map((report) => {
    const stats = report.stats || getReportStats(report);
    return `| ${report.phase} | ${report.status === "passed" ? "PASS" : "FAIL"} | ${stats.passedChecks}/${stats.totalChecks} | ${escapeCell(phaseToTask.get(report.phase) || "") } |`;
  });
  const blockedLines = blockedReport
    ? buildPhaseDiagnosis(blockedReport).failedChecks.map((check) => `- ${blockedReport.phase}: ${check.name} -> ${check.details}`)
    : ["- None"];

  const markdown = [
    "# Fleet PR Summary",
    "",
    `Status: ${statusIcon(overallStatus)}`,
    "",
    "## Workflow Overview",
    `- Workflow: ${config?.workflow?.name || "unknown"}`,
    `- Project type: ${config?.project?.type || "unknown"}`,
    `- Runtime profile: ${config?.project?.runtime_profile || "unknown"}`,
    `- Result: ${overallStatus === "passed" ? "Ready for review" : `Blocked in ${blockedReport?.phase || "unknown"} phase`}`,
    "",
    "## Phase Matrix",
    "| Phase | Result | Checks | Focus |",
    "| --- | --- | --- | --- |",
    ...overviewRows,
    "",
    "## Failure Diagnosis",
    ...blockedLines,
    "",
  ].join("\n");

  return {
    status: overallStatus,
    blockedPhase: blockedReport?.phase || null,
    reports: safeReports.map((report) => ({
      phase: report.phase,
      status: report.status,
      stats: report.stats || getReportStats(report),
      diagnosis: buildPhaseDiagnosis(report),
    })),
    markdown,
  };
}

export async function writeFleetReport(report, config, rootDir = process.cwd()) {
  const reportDir = path.join(rootDir, config?.execution?.report_dir || ".fleet/reports");
  await fs.mkdir(reportDir, { recursive: true });

  const jsonPath = path.join(reportDir, `${report.phase}-report.json`);
  const mdPath = path.join(reportDir, `${report.phase}-report.md`);

  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(mdPath, toMarkdown(report), "utf8");

  return { jsonPath, mdPath };
}

export async function writeWorkflowSummary(reports, config, rootDir = process.cwd()) {
  const reportDir = path.join(rootDir, config?.execution?.report_dir || ".fleet/reports");
  await fs.mkdir(reportDir, { recursive: true });

  const summary = buildWorkflowSummary(config, reports);
  const jsonPath = path.join(reportDir, "workflow-summary.json");
  const mdPath = path.join(reportDir, "pr-summary.md");

  await fs.writeFile(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  await fs.writeFile(mdPath, `${summary.markdown}\n`, "utf8");

  return { jsonPath, mdPath, summary };
}