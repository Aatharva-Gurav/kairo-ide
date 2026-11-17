/**
 * Verification Engine for Kairo AI Agent.
 *
 * Runs post-execution integrity checks on modified files, executes authorized automated tests,
 * inspects diagnostics, and compiles structured verification reports.
 * A task can NEVER transition to 'completed' if verification fails.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Logger } from "../utils/logger";
import { CommandGuard } from "../security/command-guard";
import { PathValidator } from "../security/path-validator";
import { StructuredTaskPlan } from "../../lib/ai-agent/plan-schema";
import { SidecarTerminalManager } from "../terminal/terminal-manager";

export interface FileInspectionResult {
  path: string;
  exists: boolean;
  size: number;
  readable: boolean;
  error?: string;
}

export interface DiagnosticItem {
  file: string;
  message: string;
  severity: "error" | "warning";
  line?: number;
}

export interface TestExecutionResult {
  command: string;
  exitCode: number;
  passed: boolean;
  output: string;
  durationMs: number;
}

export interface VerificationReport {
  passed: boolean;
  inspectedFiles: FileInspectionResult[];
  diagnosticsCount: number;
  diagnosticsErrors: DiagnosticItem[];
  testResults: TestExecutionResult[];
  unresolvedProblems: string[];
  summary: string;
  completedAt: number;
}

export interface VerificationEngineOptions {
  logger?: Logger;
  terminalManager?: SidecarTerminalManager;
  commandGuard?: CommandGuard;
  pathValidator?: PathValidator;
}

export class VerificationEngine {
  private readonly logger: Logger;
  private readonly terminalManager?: SidecarTerminalManager;
  private readonly commandGuard: CommandGuard;
  private readonly pathValidator: PathValidator;

  constructor(options: VerificationEngineOptions = {}) {
    this.logger = options.logger
      ? options.logger.child("verification-engine")
      : new Logger("verification-engine");
    this.terminalManager = options.terminalManager;
    this.commandGuard = options.commandGuard ?? new CommandGuard();
    this.pathValidator = options.pathValidator ?? new PathValidator();
  }

  /**
   * Run verification for an executed task plan.
   */
  public async verifyPlan(params: {
    plan: StructuredTaskPlan;
    workspaceRoot: string;
    runAutomatedTests?: boolean;
    customCommands?: string[];
  }): Promise<VerificationReport> {
    const { plan, workspaceRoot, runAutomatedTests = true, customCommands } = params;
    this.logger.info(`Starting verification for plan: '${plan.objective}'`);

    const inspectedFiles: FileInspectionResult[] = [];
    const diagnosticsErrors: DiagnosticItem[] = [];
    const testResults: TestExecutionResult[] = [];
    const unresolvedProblems: string[] = [];

    // 1. Inspect Files (Integrity, Existence, Readability)
    const filesToInspect = new Map<string, "create" | "modify" | "delete" | "rename">();
    for (const change of plan.proposedChanges) {
      filesToInspect.set(change.path, change.action);
    }

    for (const [relPath, action] of filesToInspect.entries()) {
      const fullPath = path.isAbsolute(relPath)
        ? relPath
        : path.resolve(workspaceRoot, relPath);

      // Path validation check
      const pathVal = this.pathValidator.validate(fullPath, workspaceRoot);
      if (!pathVal.valid) {
        inspectedFiles.push({
          path: fullPath,
          exists: false,
          size: 0,
          readable: false,
          error: `Path security violation: ${pathVal.error}`,
        });
        unresolvedProblems.push(`File '${relPath}' violates workspace security boundaries.`);
        continue;
      }

      try {
        const stat = await fs.stat(fullPath).catch(() => null);

        if (action === "delete") {
          if (stat) {
            inspectedFiles.push({
              path: fullPath,
              exists: true,
              size: stat.size,
              readable: true,
              error: `File was scheduled for deletion but still exists on disk.`,
            });
            unresolvedProblems.push(`File '${relPath}' was not deleted as expected.`);
          } else {
            inspectedFiles.push({
              path: fullPath,
              exists: false,
              size: 0,
              readable: false,
            });
          }
        } else {
          // Action is "create" or "modify"
          if (!stat || !stat.isFile()) {
            inspectedFiles.push({
              path: fullPath,
              exists: false,
              size: 0,
              readable: false,
              error: `Expected file does not exist on disk.`,
            });
            unresolvedProblems.push(`Required file '${relPath}' is missing.`);
          } else {
            const content = await fs.readFile(fullPath, "utf8");
            inspectedFiles.push({
              path: fullPath,
              exists: true,
              size: stat.size,
              readable: true,
            });

            // Basic syntax sanity checks for known extensions
            if (fullPath.endsWith(".json")) {
              try {
                JSON.parse(content);
              } catch (parseErr: unknown) {
                const parseMsg = parseErr instanceof Error ? parseErr.message : String(parseErr);
                diagnosticsErrors.push({
                  file: fullPath,
                  message: `Invalid JSON syntax: ${parseMsg}`,
                  severity: "error",
                });
                unresolvedProblems.push(`File '${relPath}' has syntax errors: ${parseMsg}`);
              }
            }
          }
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        inspectedFiles.push({
          path: fullPath,
          exists: false,
          size: 0,
          readable: false,
          error: errorMsg,
        });
        unresolvedProblems.push(`Failed to inspect file '${relPath}': ${errorMsg}`);
      }
    }

    // 2. Run Authorized Automated Tests
    const testCommandsToRun: string[] = [];
    if (runAutomatedTests && plan.testingStrategy?.automatedCommands) {
      testCommandsToRun.push(...plan.testingStrategy.automatedCommands);
    }
    if (customCommands && customCommands.length > 0) {
      testCommandsToRun.push(...customCommands);
    }

    for (const rawCmd of testCommandsToRun) {
      const trimmed = rawCmd.trim();
      if (!trimmed) continue;

      // Security inspect test command
      const guardResult = this.commandGuard.inspect(trimmed, "act");
      if (!guardResult.safe) {
        testResults.push({
          command: trimmed,
          exitCode: 1,
          passed: false,
          output: `Command blocked by security guard: ${guardResult.reason}`,
          durationMs: 0,
        });
        unresolvedProblems.push(`Test command '${trimmed}' was blocked by security policy.`);
        continue;
      }

      if (this.terminalManager) {
        const startTime = Date.now();
        try {
          const runRes = await this.terminalManager.executeCommand({
            command: trimmed,
            cwd: workspaceRoot,
            timeoutMs: 60000,
          });
          const durationMs = Date.now() - startTime;
          const passed = runRes.exitCode === 0;

          testResults.push({
            command: trimmed,
            exitCode: runRes.exitCode,
            passed,
            output: [runRes.stdout, runRes.stderr].filter(Boolean).join("\n"),
            durationMs,
          });

          if (!passed) {
            unresolvedProblems.push(
              `Test command '${trimmed}' failed with exit code ${runRes.exitCode}.`
            );
          }
        } catch (err: unknown) {
          const durationMs = Date.now() - startTime;
          const errorMsg = err instanceof Error ? err.message : String(err);
          testResults.push({
            command: trimmed,
            exitCode: 1,
            passed: false,
            output: errorMsg,
            durationMs,
          });
          unresolvedProblems.push(`Test command '${trimmed}' threw exception: ${errorMsg}`);
        }
      } else {
        // No terminal manager configured: treat non-destructive inspection as passed or simulated
        this.logger.debug(`Terminal manager not provided for automated test '${trimmed}', skipping execution.`);
      }
    }

    // 3. Compile Outcome
    const fileErrors = inspectedFiles.filter((f) => f.error);
    const hardDiagnostics = diagnosticsErrors.filter((d) => d.severity === "error");
    const failedTests = testResults.filter((t) => !t.passed);

    const passed =
      fileErrors.length === 0 &&
      hardDiagnostics.length === 0 &&
      failedTests.length === 0 &&
      unresolvedProblems.length === 0;

    let summary = "";
    if (passed) {
      summary = `Verification succeeded: ${inspectedFiles.length} files verified intact, ${diagnosticsErrors.length} diagnostics, ${testResults.length} automated tests passed.`;
    } else {
      summary = `Verification failed: ${unresolvedProblems.length} issue(s) detected (${fileErrors.length} file errors, ${hardDiagnostics.length} diagnostic errors, ${failedTests.length} test failures).`;
    }

    this.logger.info(`Verification finished: passed=${passed}`);

    return {
      passed,
      inspectedFiles,
      diagnosticsCount: diagnosticsErrors.length,
      diagnosticsErrors,
      testResults,
      unresolvedProblems,
      summary,
      completedAt: Date.now(),
    };
  }
}
