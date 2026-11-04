/**
 * Command Guard & Prompt Injection Defense for Kairo AI Agent.
 *
 * Inspects shell commands before execution to detect destructive commands,
 * privilege escalation, downloads-piped-to-shell, vault tampering,
 * dependency installations, and Plan-mode mutating commands.
 */
import { PermissionAction, RiskLevel } from "../permissions/types";

// Highly destructive commands that must always be blocked or flagged critical
const DESTRUCTIVE_COMMAND_PATTERNS = [
  /\brm\s+-[a-zA-Z0-9_\-\s]*[rR][a-zA-Z0-9_\-\s]*[fF]\s+([/\\]|\*|~)/i, // rm -rf / or rm -r -f *
  /\brm\s+-[a-zA-Z0-9_\-\s]*[fF][a-zA-Z0-9_\-\s]*[rR]\s+([/\\]|\*|~)/i, // rm -fr /
  /\bdel\s+.*\/[sS].*([a-zA-Z]:[\\/]|\*)/i, // del with /s targeting root or wildcard
  /\bdel\s+.*([a-zA-Z]:[\\/]|\*).*\/[sS]/i,
  /\brmdir\s+.*\/[sS].*[a-zA-Z]:[\\/]/i, // rmdir with /s
  /\bformat\s+[a-zA-Z]:/i, // format C:
  /\bmkfs(\.[a-zA-Z0-9]+)?\s+/i, // mkfs /dev/...
  /\bdiskpart\b/i,
  /\b(shutdown|reboot|init\s+0)\b/i,
];

// Dangerous shell patterns (pipe to shell, encoded powershell)
const DANGEROUS_SHELL_PATTERNS = [
  /\b(curl|wget)\b[^\n|;&]+\|\s*(sh|bash|zsh|dash|powershell|pwsh)\b/i,
  /\bpowershell(\.exe)?\s+.*-(enc|encodedcommand)\b/i,
  /\bSet-ExecutionPolicy\s+(Bypass|Unrestricted)\b/i,
];

// Privilege escalation commands
const PRIVILEGE_ESCALATION_PATTERNS = [
  /\bsudo\b/i,
  /\brunas\b/i,
  /\bsu(\s+|$)/i,
];

// Patterns targeting Kairo internal data
const KAIRO_TAMPER_PATTERNS = [
  /\.kairo[\\/]security/i,
  /credentials\.vault/i,
  /\.kairo[\\/]settings/i,
];

// Package installation patterns
const PACKAGE_INSTALL_PATTERNS = [
  /\b(npm|pnpm|yarn|bun)\s+(install|i|add)\b/i,
  /\b(pip|pip3)\s+install\b/i,
  /\bcargo\s+add\b/i,
  /\bcomposer\s+require\b/i,
  /\bgem\s+install\b/i,
  /\bgo\s+get\b/i,
  /\bdotnet\s+add\s+package\b/i,
];

// Mutating file commands blocked in Plan Mode
const FILE_MUTATING_COMMAND_PATTERNS = [
  /\b(touch|mkdir|rmdir|rm|del|erase|copy|move|ren|rename)\b/i,
  /\b(cp|mv|truncate|dd)\b/i,
  /\bsed\s+-i/i,
  /\btee\b/i,
  /\bpatch\b/i,
  /\bgit\s+(commit|merge|rebase|reset|pull|clean|checkout\s+-b)\b/i,
];

export interface CommandInspectionResult {
  safe: boolean;
  action: PermissionAction;
  risk: RiskLevel;
  isDestructive: boolean;
  isPackageInstall: boolean;
  isPlanModeBlocked: boolean;
  reason?: string;
}

export class CommandGuard {
  /**
   * Helper to inspect if a command looks like a file-editing construct in Plan Mode.
   */
  public findFileEditingCommand(command: string): string | undefined {
    // Check for output redirection to files (>, >>)
    if (/>>|(?<!\d)>(?!\d)|\|\s*tee\b/i.test(command)) {
      return "file output redirection";
    }

    // Check for file-mutating binaries
    for (const pattern of FILE_MUTATING_COMMAND_PATTERNS) {
      if (pattern.test(command)) {
        return `file modifying command (${command.match(pattern)?.[0]})`;
      }
    }

    return undefined;
  }

  /**
   * Inspect a command line string and classify its risk, action, and safety.
   *
   * @param command The shell command to inspect.
   * @param mode The current operational mode ("plan" | "act").
   */
  public inspect(command: string, mode: "plan" | "act" = "act"): CommandInspectionResult {
    const trimmed = (command || "").trim();
    if (!trimmed) {
      return {
        safe: false,
        action: "execute_command",
        risk: "low",
        isDestructive: false,
        isPackageInstall: false,
        isPlanModeBlocked: false,
        reason: "Empty command string.",
      };
    }

    // 1. Check for Kairo security vault tampering
    for (const pattern of KAIRO_TAMPER_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          safe: false,
          action: "execute_command",
          risk: "critical",
          isDestructive: true,
          isPackageInstall: false,
          isPlanModeBlocked: true,
          reason: "Security violation: command attempts to access or modify Kairo internal security storage.",
        };
      }
    }

    // 2. Check for destructive commands
    for (const pattern of DESTRUCTIVE_COMMAND_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          safe: false,
          action: "execute_command",
          risk: "critical",
          isDestructive: true,
          isPackageInstall: false,
          isPlanModeBlocked: true,
          reason: "Security violation: destructive system command detected.",
        };
      }
    }

    // 3. Check for dangerous pipe-to-shell or execution policy bypass
    for (const pattern of DANGEROUS_SHELL_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          safe: false,
          action: "execute_command",
          risk: "critical",
          isDestructive: false,
          isPackageInstall: false,
          isPlanModeBlocked: true,
          reason: "Security violation: execution of unverified remote script or execution policy bypass.",
        };
      }
    }

    // 4. Check for privilege escalation
    for (const pattern of PRIVILEGE_ESCALATION_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          safe: false,
          action: "execute_command",
          risk: "high",
          isDestructive: false,
          isPackageInstall: false,
          isPlanModeBlocked: true,
          reason: "Privilege escalation (sudo/runas) is not permitted in agent tasks.",
        };
      }
    }

    // 5. Check if it is a package dependency installation
    const isPackageInstall = PACKAGE_INSTALL_PATTERNS.some((p) => p.test(trimmed));
    if (isPackageInstall) {
      // In plan mode, installing packages is blocked
      if (mode === "plan") {
        return {
          safe: false,
          action: "install_dependency",
          risk: "high",
          isDestructive: false,
          isPackageInstall: true,
          isPlanModeBlocked: true,
          reason: "Package installation is prohibited in Plan Mode.",
        };
      }

      return {
        safe: true,
        action: "install_dependency",
        risk: "high",
        isDestructive: false,
        isPackageInstall: true,
        isPlanModeBlocked: false,
      };
    }

    // 6. Plan Mode mutating command check
    if (mode === "plan") {
      const fileModifyingDesc = this.findFileEditingCommand(trimmed);
      if (fileModifyingDesc) {
        return {
          safe: false,
          action: "execute_command",
          risk: "high",
          isDestructive: false,
          isPackageInstall: false,
          isPlanModeBlocked: true,
          reason: `Tool execution denied: command '${trimmed}' contains file-modifying construct (${fileModifyingDesc}), which is prohibited in Plan Mode.`,
        };
      }
    }

    // Standard shell execution in act mode
    return {
      safe: true,
      action: "execute_command",
      risk: "high",
      isDestructive: false,
      isPackageInstall: false,
      isPlanModeBlocked: false,
    };
  }
}
