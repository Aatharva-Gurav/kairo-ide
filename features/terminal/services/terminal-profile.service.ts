import { ShellProfile } from "../types";

export interface ProfileValidationResult {
  valid: boolean;
  errors: string[];
}

const ALLOWED_SHELL_STEMS = new Set([
  "pwsh",
  "powershell",
  "cmd",
  "bash",
  "sh",
  "zsh",
  "fish",
  "dash",
  "nu",
  "nushell",
  "elvish",
  "xonsh",
  "wsl",
  "ubuntu",
  "debian",
  "kali",
]);

const BLOCKED_ENV_VARS = new Set([
  "PATH",
  "PATHEXT",
  "COMSPEC",
  "SHELL",
  "IFS",
  "LD_PRELOAD",
  "LD_LIBRARY_PATH",
  "LD_AUDIT",
  "LD_DEBUG",
  "DYLD_INSERT_LIBRARIES",
  "DYLD_LIBRARY_PATH",
  "DYLD_FRAMEWORK_PATH",
  "DYLD_FALLBACK_LIBRARY_PATH",
  "NODE_OPTIONS",
  "NODE_EXTRA_CA_CERTS",
  "ELECTRON_RUN_AS_NODE",
  "PYTHONSTARTUP",
  "PYTHONPATH",
  "PYTHONHOME",
  "RUBYOPT",
  "RUBYLIB",
  "PERL5OPT",
  "PERL5LIB",
  "JAVA_TOOL_OPTIONS",
  "_JAVA_OPTIONS",
  "JDK_JAVA_OPTIONS",
  "DOTNET_STARTUP_HOOKS",
  "CLR_PROFILER",
  "COR_ENABLE_PROFILING",
  "CORECLR_ENABLE_PROFILING",
  "BASH_ENV",
  "ENV",
  "ZDOTDIR",
  "FPATH",
  "PROMPT_COMMAND",
  "PS4",
  "CDPATH",
  "GLOBIGNORE",
  "GIT_SSH",
  "GIT_SSH_COMMAND",
  "GIT_EXEC_PATH",
  "GIT_TEMPLATE_DIR",
  "RUSTC_WRAPPER",
  "RUSTC_WORKSPACE_WRAPPER",
  "NPM_CONFIG_SCRIPT_SHELL",
]);

function isAllowedShellExecutable(executable: string): boolean {
  const trimmed = executable.trim();
  if (!trimmed || trimmed.includes("\0") || /[\r\n]/.test(trimmed)) {
    return false;
  }
  if (trimmed.startsWith("\\\\") || trimmed.startsWith("//")) {
    return false;
  }
  const segments = trimmed.split(/[\\/]/);
  if (segments.some((seg) => seg === "..")) {
    return false;
  }
  const fileName = segments[segments.length - 1]?.toLowerCase() || "";
  if (!fileName) {
    return false;
  }
  if (fileName.endsWith(".bat") || fileName.endsWith(".cmd")) {
    return false;
  }
  const stem = fileName.endsWith(".exe") ? fileName.slice(0, -4) : fileName;
  return ALLOWED_SHELL_STEMS.has(stem);
}

function isDisallowedShellArg(arg: string): boolean {
  if (typeof arg !== "string" || arg.length > 512 || /[\0\x00-\x1f\x7f]/.test(arg)) {
    return true;
  }
  const lower = arg.trim().toLowerCase();
  if (
    [
      "-c",
      "/c",
      "/k",
      "-e",
      "-file",
      "-f",
      "--command",
      "-command",
      "-encodedcommand",
      "-enc",
    ].includes(lower)
  ) {
    return true;
  }
  if (
    lower.startsWith("-") &&
    !lower.startsWith("--") &&
    lower.length > 2 &&
    ("-command".startsWith(lower) ||
      "-encodedcommand".startsWith(lower) ||
      "-file".startsWith(lower))
  ) {
    return true;
  }
  if (
    lower.startsWith("-") &&
    !lower.startsWith("--") &&
    lower.length >= 2 &&
    /^[a-z]+$/.test(lower.slice(1)) &&
    lower !== "-nologo" &&
    lower !== "-noprofile" &&
    lower !== "-noexit" &&
    lower !== "-login" &&
    (lower.slice(1).includes("c") || lower.slice(1).includes("e"))
  ) {
    return true;
  }
  return false;
}

function isBlockedEnvKey(key: string): boolean {
  const upper = key.toUpperCase();
  if (BLOCKED_ENV_VARS.has(upper)) {
    return true;
  }
  if (upper.startsWith("LD_") || upper.startsWith("DYLD_")) {
    return true;
  }
  if (upper.startsWith("CARGO_TARGET_") && (upper.endsWith("_RUNNER") || upper.endsWith("_LINKER"))) {
    return true;
  }
  return false;
}

export class TerminalProfileService {
  /**
   * Validates a custom shell profile structure, approved shell binary, args, and env overrides.
   */
  static validateProfile(profile: Partial<ShellProfile>): ProfileValidationResult {
    const errors: string[] = [];

    if (!profile.name || profile.name.trim().length === 0) {
      errors.push("Profile name cannot be empty");
    }

    if (!profile.executable || profile.executable.trim().length === 0) {
      errors.push("Executable path cannot be empty");
    } else if (!isAllowedShellExecutable(profile.executable)) {
      errors.push(
        "Executable must be an approved interactive shell binary without UNC or traversal paths"
      );
    }

    if (profile.args !== undefined) {
      if (!Array.isArray(profile.args)) {
        errors.push("Arguments must be an array of strings");
      } else if (profile.args.length > 16) {
        errors.push("Too many shell arguments specified (maximum 16)");
      } else {
        for (const arg of profile.args) {
          if (isDisallowedShellArg(arg)) {
            errors.push(`Disallowed or unsafe shell argument: ${String(arg)}`);
          }
        }
      }
    }

    if (profile.env !== undefined) {
      if (profile.env === null || typeof profile.env !== "object" || Array.isArray(profile.env)) {
        errors.push("Environment variables must be a key-value map");
      } else {
        const entries = Object.entries(profile.env);
        if (entries.length > 64) {
          errors.push("Too many custom environment variables (maximum 64)");
        }
        for (const [key, val] of entries) {
          if (!/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(key) || isBlockedEnvKey(key)) {
            errors.push(`Environment variable '${key}' is blocked or invalid`);
          }
          if (typeof val !== "string" || val.length > 8192 || /[\0\r\n]/.test(val)) {
            errors.push(`Environment variable '${key}' has an invalid value`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Merges OS-detected shells with user custom profiles from settings.
   */
  static mergeProfiles(
    discovered: ShellProfile[],
    custom: ShellProfile[],
    defaultProfileId?: string
  ): ShellProfile[] {
    const map = new Map<string, ShellProfile>();

    for (const d of discovered) {
      map.set(d.id, { ...d, isCustom: false });
    }

    for (const c of custom) {
      map.set(c.id, { ...c, isCustom: true });
    }

    const profiles = Array.from(map.values());

    // Update isDefault flag according to preferred defaultProfileId
    if (defaultProfileId) {
      const match = profiles.find((p) => p.id === defaultProfileId);
      if (match) {
        profiles.forEach((p) => {
          p.isDefault = p.id === defaultProfileId;
        });
      }
    }

    return profiles;
  }

  /**
   * Resolves the active default shell profile from available profiles.
   */
  static resolveDefaultProfile(
    profiles: ShellProfile[],
    preferredId?: string
  ): ShellProfile | null {
    if (profiles.length === 0) return null;

    if (preferredId) {
      const found = profiles.find((p) => p.id === preferredId);
      if (found) return found;
    }

    const markedDefault = profiles.find((p) => p.isDefault);
    return markedDefault || profiles[0];
  }
}
