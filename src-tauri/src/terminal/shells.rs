use super::error::TerminalError;
use super::types::ShellProfile;
use crate::security::{SensitivePathPolicy, WorkspaceGuard};
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::{Path, PathBuf};

/// Approved interactive shell binary names (stem without extension).
const ALLOWED_SHELL_STEMS: &[&str] = &[
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
];

/// Sensitive environment variables blocked from untrusted terminal overrides.
const BLOCKED_ENV_VARS: &[&str] = &[
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
];

/// Discovers available shell profiles on the current host system.
pub fn detect_shells() -> Vec<ShellProfile> {
    #[cfg(windows)]
    {
        detect_windows_shells()
    }
    #[cfg(target_os = "macos")]
    {
        detect_macos_shells()
    }
    #[cfg(all(not(windows), not(target_os = "macos")))]
    {
        detect_linux_shells()
    }
}

/// Detects shells on Windows operating systems.
#[cfg(windows)]
fn detect_windows_shells() -> Vec<ShellProfile> {
    let mut profiles = Vec::new();
    let mut default_set = false;

    let program_files =
        env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
    let local_app_data = env::var("LOCALAPPDATA").unwrap_or_default();
    let system_root = env::var("SystemRoot").unwrap_or_else(|_| r"C:\Windows".to_string());

    // 1. PowerShell 7 (pwsh.exe)
    let pwsh_candidates = [
        PathBuf::from(&program_files).join(r"PowerShell\7\pwsh.exe"),
        PathBuf::from(&program_files).join(r"PowerShell\7-preview\pwsh.exe"),
        PathBuf::from(&local_app_data).join(r"Microsoft\WindowsApps\pwsh.exe"),
    ];
    for path in &pwsh_candidates {
        if path.is_file() {
            profiles.push(ShellProfile {
                id: "pwsh".to_string(),
                name: "PowerShell 7".to_string(),
                executable: path.to_string_lossy().to_string(),
                args: Some(vec!["-NoLogo".to_string()]),
                env: None,
                cwd: None,
                is_custom: Some(false),
                icon: "powershell".to_string(),
                is_default: !default_set,
                platform: "windows".to_string(),
            });
            default_set = true;
            break;
        }
    }

    // 2. Windows PowerShell (powershell.exe)
    let win_powershell =
        PathBuf::from(&system_root).join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
    if win_powershell.is_file() {
        profiles.push(ShellProfile {
            id: "powershell".to_string(),
            name: "Windows PowerShell".to_string(),
            executable: win_powershell.to_string_lossy().to_string(),
            args: Some(vec!["-NoLogo".to_string()]),
            env: None,
            cwd: None,
            is_custom: Some(false),
            icon: "powershell".to_string(),
            is_default: !default_set,
            platform: "windows".to_string(),
        });
        default_set = true;
    }

    // 3. Command Prompt (cmd.exe)
    let cmd_exe = PathBuf::from(&system_root).join(r"System32\cmd.exe");
    if cmd_exe.is_file() {
        profiles.push(ShellProfile {
            id: "cmd".to_string(),
            name: "Command Prompt".to_string(),
            executable: cmd_exe.to_string_lossy().to_string(),
            args: None,
            env: None,
            cwd: None,
            is_custom: Some(false),
            icon: "terminal".to_string(),
            is_default: !default_set,
            platform: "windows".to_string(),
        });
    }

    // 4. Git Bash
    let program_files_x86 =
        env::var("ProgramFiles(x86)").unwrap_or_else(|_| r"C:\Program Files (x86)".to_string());
    let git_bash_candidates = [
        PathBuf::from(&program_files).join(r"Git\bin\bash.exe"),
        PathBuf::from(&program_files).join(r"Git\usr\bin\bash.exe"),
        PathBuf::from(&program_files_x86).join(r"Git\bin\bash.exe"),
        PathBuf::from(&local_app_data).join(r"Programs\Git\bin\bash.exe"),
    ];
    for path in &git_bash_candidates {
        if path.is_file() {
            profiles.push(ShellProfile {
                id: "git-bash".to_string(),
                name: "Git Bash".to_string(),
                executable: path.to_string_lossy().to_string(),
                args: Some(vec!["--login".to_string(), "-i".to_string()]),
                env: None,
                cwd: None,
                is_custom: Some(false),
                icon: "git".to_string(),
                is_default: false,
                platform: "windows".to_string(),
            });
            break;
        }
    }

    // 5. WSL (Windows Subsystem for Linux)
    let wsl_exe = PathBuf::from(&system_root).join(r"System32\wsl.exe");
    if wsl_exe.is_file() {
        profiles.push(ShellProfile {
            id: "wsl".to_string(),
            name: "WSL (Default)".to_string(),
            executable: wsl_exe.to_string_lossy().to_string(),
            args: None,
            env: None,
            cwd: None,
            is_custom: Some(false),
            icon: "linux".to_string(),
            is_default: false,
            platform: "windows".to_string(),
        });
    }

    if profiles.is_empty() {
        profiles.push(ShellProfile {
            id: "cmd".to_string(),
            name: "Command Prompt".to_string(),
            executable: r"C:\Windows\System32\cmd.exe".to_string(),
            args: None,
            env: None,
            cwd: None,
            is_custom: Some(false),
            icon: "terminal".to_string(),
            is_default: true,
            platform: "windows".to_string(),
        });
    }

    profiles
}

/// Detects shells on macOS.
#[cfg(target_os = "macos")]
fn detect_macos_shells() -> Vec<ShellProfile> {
    let mut profiles = Vec::new();
    let mut default_set = false;
    let env_shell = env::var("SHELL").ok();

    let candidates = [
        ("zsh", "Zsh", "/bin/zsh", vec!["-l".to_string()]),
        (
            "zsh-brew",
            "Zsh (Homebrew)",
            "/opt/homebrew/bin/zsh",
            vec!["-l".to_string()],
        ),
        ("bash", "Bash", "/bin/bash", vec!["-l".to_string()]),
        (
            "bash-brew",
            "Bash (Homebrew)",
            "/opt/homebrew/bin/bash",
            vec!["-l".to_string()],
        ),
        (
            "fish",
            "Fish",
            "/opt/homebrew/bin/fish",
            vec!["-l".to_string()],
        ),
    ];

    for (id, name, path_str, args) in candidates {
        let p = Path::new(path_str);
        if p.is_file() {
            let is_user_default = env_shell.as_deref() == Some(path_str);
            let is_default = is_user_default || (!default_set && id == "zsh");

            profiles.push(ShellProfile {
                id: id.to_string(),
                name: name.to_string(),
                executable: path_str.to_string(),
                args: Some(args),
                env: None,
                cwd: None,
                is_custom: Some(false),
                icon: "terminal".to_string(),
                is_default,
                platform: "macos".to_string(),
            });

            if is_default {
                default_set = true;
            }
        }
    }

    if profiles.is_empty() {
        profiles.push(ShellProfile {
            id: "zsh".to_string(),
            name: "Zsh".to_string(),
            executable: "/bin/zsh".to_string(),
            args: Some(vec!["-l".to_string()]),
            env: None,
            cwd: None,
            is_custom: Some(false),
            icon: "terminal".to_string(),
            is_default: true,
            platform: "macos".to_string(),
        });
    }

    profiles
}

/// Detects shells on Linux.
#[cfg(all(not(windows), not(target_os = "macos")))]
fn detect_linux_shells() -> Vec<ShellProfile> {
    let mut profiles = Vec::new();
    let mut default_set = false;
    let env_shell = env::var("SHELL").ok();

    let candidates = [
        ("bash", "Bash", "/usr/bin/bash", vec!["-l".to_string()]),
        ("bash-bin", "Bash", "/bin/bash", vec!["-l".to_string()]),
        ("zsh", "Zsh", "/usr/bin/zsh", vec!["-l".to_string()]),
        ("fish", "Fish", "/usr/bin/fish", vec!["-l".to_string()]),
        ("sh", "Sh", "/bin/sh", vec!["-l".to_string()]),
    ];

    for (id, name, path_str, args) in candidates {
        let p = Path::new(path_str);
        if p.is_file() {
            let is_user_default = env_shell.as_deref() == Some(path_str);
            let is_default = is_user_default || (!default_set && id.starts_with("bash"));

            if profiles.iter().any(|p: &ShellProfile| p.name == name) {
                continue;
            }

            profiles.push(ShellProfile {
                id: id.to_string(),
                name: name.to_string(),
                executable: path_str.to_string(),
                args: Some(args),
                env: None,
                cwd: None,
                is_custom: Some(false),
                icon: "terminal".to_string(),
                is_default,
                platform: "linux".to_string(),
            });

            if is_default {
                default_set = true;
            }
        }
    }

    if profiles.is_empty() {
        profiles.push(ShellProfile {
            id: "bash".to_string(),
            name: "Bash".to_string(),
            executable: "/bin/bash".to_string(),
            args: Some(vec!["-l".to_string()]),
            env: None,
            cwd: None,
            is_custom: Some(false),
            icon: "terminal".to_string(),
            is_default: true,
            platform: "linux".to_string(),
        });
    }

    profiles
}

/// Resolves a discovered shell profile by ID or returns the default discovered shell.
pub fn resolve_shell(profile_id: Option<&str>) -> Result<(String, Vec<String>), TerminalError> {
    let available = detect_shells();

    if let Some(id) = profile_id {
        if let Some(found) = available.iter().find(|p| p.id.eq_ignore_ascii_case(id)) {
            return Ok((
                found.executable.clone(),
                found.args.clone().unwrap_or_default(),
            ));
        }
        return Err(TerminalError::ShellNotFound(format!(
            "Shell profile '{}' is not installed or available on this system.",
            id
        )));
    }

    let default_profile = available
        .iter()
        .find(|p| p.is_default)
        .or_else(|| available.first())
        .ok_or_else(|| {
            TerminalError::ShellNotFound("No valid shell detected on host system".to_string())
        })?;

    Ok((
        default_profile.executable.clone(),
        default_profile.args.clone().unwrap_or_default(),
    ))
}

fn is_allowed_shell_filename(file_name: &str) -> bool {
    let lower = file_name.to_lowercase();
    #[cfg(windows)]
    let stem = if let Some(s) = lower.strip_suffix(".exe") {
        s
    } else if lower.contains('.') {
        // Reject .bat, .cmd, .com, .ps1, .vbs, etc. on Windows
        return false;
    } else {
        lower.as_str()
    };

    #[cfg(not(windows))]
    let stem = lower.as_str();

    ALLOWED_SHELL_STEMS.contains(&stem)
}

fn is_untrusted_executable_location(
    candidate: &Path,
    workspace_guard: Option<&WorkspaceGuard>,
) -> bool {
    let canon = fs::canonicalize(candidate)
        .map(|p| WorkspaceGuard::strip_verbatim_prefix(&p))
        .unwrap_or_else(|_| WorkspaceGuard::strip_verbatim_prefix(candidate));

    // Reject executables planted inside the active workspace
    if let Some(guard) = workspace_guard {
        if let Ok(snap) = guard.snapshot() {
            if snap
                .authorized_roots
                .iter()
                .any(|root| WorkspaceGuard::is_path_within(root, &canon))
            {
                return true;
            }
        }
    }

    // Reject executables placed inside OS temp directories
    if let Ok(temp_canon) = fs::canonicalize(env::temp_dir()) {
        let temp_clean = WorkspaceGuard::strip_verbatim_prefix(&temp_canon);
        if WorkspaceGuard::is_path_within(&temp_clean, &canon) {
            return true;
        }
    }

    false
}

/// Validates that an executable for a custom shell profile is an approved interactive
/// shell binary on a trusted path (not a symlink/junction, not in workspace/temp, not arbitrary OS binary).
pub fn validate_shell_executable(
    executable: &str,
    workspace_guard: Option<&WorkspaceGuard>,
) -> Result<PathBuf, TerminalError> {
    let trimmed = executable.trim();
    if trimmed.is_empty() || trimmed.contains('\0') || trimmed.chars().any(|c| c.is_control()) {
        return Err(TerminalError::UnauthorizedExecutable(
            "Executable path is empty or contains invalid characters.".to_string(),
        ));
    }

    if trimmed.starts_with(r"\\") || trimmed.starts_with("//") || trimmed.starts_with(r"\??\") {
        return Err(TerminalError::UnauthorizedExecutable(format!(
            "UNC and device paths are not permitted: {}",
            executable
        )));
    }

    if trimmed.split(['/', '\\']).any(|seg| seg == "..") {
        return Err(TerminalError::UnauthorizedExecutable(format!(
            "Traversal segments are not permitted in executable path: {}",
            executable
        )));
    }

    let has_path_sep = trimmed.contains('/') || trimmed.contains('\\') || trimmed.contains(':');
    let p = Path::new(trimmed);

    let file_name = p
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| TerminalError::UnauthorizedExecutable(executable.to_string()))?;

    if !is_allowed_shell_filename(file_name) {
        return Err(TerminalError::UnauthorizedExecutable(format!(
            "'{}' is not an approved interactive shell binary.",
            file_name
        )));
    }

    if has_path_sep {
        let checked = WorkspaceGuard::lexical_check(trimmed)
            .map_err(|e| TerminalError::UnauthorizedExecutable(format!("{}: {}", executable, e)))?;

        let meta = fs::symlink_metadata(&checked).map_err(|_| {
            TerminalError::ShellNotFound(format!("Shell executable not found: {}", executable))
        })?;

        if WorkspaceGuard::is_symlink_or_junction(&checked).unwrap_or(true) {
            return Err(TerminalError::UnauthorizedExecutable(format!(
                "Symlink or junction shell executables are not permitted: {}",
                executable
            )));
        }

        if !meta.is_file() {
            return Err(TerminalError::UnauthorizedExecutable(format!(
                "Shell executable is not a regular file: {}",
                executable
            )));
        }

        if is_untrusted_executable_location(&checked, workspace_guard) {
            return Err(TerminalError::UnauthorizedExecutable(format!(
                "Shell executable cannot reside inside workspace or temp directory: {}",
                executable
            )));
        }

        return Ok(checked);
    }

    // Bare approved shell name: look up only in absolute non-workspace/non-temp system PATH directories
    if let Ok(path_var) = env::var("PATH") {
        #[cfg(windows)]
        let separator = ';';
        #[cfg(not(windows))]
        let separator = ':';

        #[cfg(windows)]
        let extensions: &[&str] = &["", ".exe"];
        #[cfg(not(windows))]
        let extensions: &[&str] = &[""];

        for dir in path_var.split(separator) {
            if dir.trim().is_empty() {
                continue;
            }
            let dir_path = Path::new(dir);
            if !dir_path.is_absolute() {
                continue;
            }
            for ext in extensions {
                let candidate = if ext.is_empty() {
                    dir_path.join(trimmed)
                } else {
                    dir_path.join(format!("{}{}", trimmed, ext))
                };
                if let Ok(meta) = fs::symlink_metadata(&candidate) {
                    if meta.is_file()
                        && !WorkspaceGuard::is_symlink_or_junction(&candidate).unwrap_or(true)
                        && !is_untrusted_executable_location(&candidate, workspace_guard)
                    {
                        if let Some(name) = candidate.file_name().and_then(|n| n.to_str()) {
                            if is_allowed_shell_filename(name) {
                                return Ok(candidate);
                            }
                        }
                    }
                }
            }
        }
    }

    Err(TerminalError::ShellNotFound(format!(
        "Approved shell executable not found: {}",
        executable
    )))
}

/// Validates that an executable name or path resolves to an approved shell binary.
pub fn validate_executable(executable: &str) -> Result<PathBuf, TerminalError> {
    validate_shell_executable(executable, None)
}

/// Validates shell startup arguments, blocking non-interactive command execution flags.
pub fn validate_shell_args(args: &[String]) -> Result<Vec<String>, TerminalError> {
    if args.len() > 16 {
        return Err(TerminalError::InvalidArguments(
            "Too many shell arguments specified (maximum 16).".to_string(),
        ));
    }

    let mut validated = Vec::with_capacity(args.len());
    for arg in args {
        if arg.len() > 512 || arg.contains('\0') || arg.chars().any(|c| c.is_control()) {
            return Err(TerminalError::InvalidArguments(
                "Shell argument contains invalid control characters or exceeds length limit."
                    .to_string(),
            ));
        }

        let lower = arg.trim().to_lowercase();
        let is_exec_flag = matches!(
            lower.as_str(),
            "-c" | "/c"
                | "/k"
                | "-e"
                | "-file"
                | "-f"
                | "--command"
                | "-command"
                | "-encodedcommand"
                | "-enc"
        ) || (lower.starts_with('-')
            && !lower.starts_with("--")
            && lower.len() > 2
            && ("-command".starts_with(&lower)
                || "-encodedcommand".starts_with(&lower)
                || "-file".starts_with(&lower)))
            || (lower.starts_with('-')
                && !lower.starts_with("--")
                && lower.len() >= 2
                && lower[1..].chars().all(|c| c.is_ascii_alphabetic())
                && lower != "-nologo"
                && lower != "-noprofile"
                && lower != "-noexit"
                && (lower[1..].contains('c') || lower[1..].contains('e'))
                && lower != "-login");

        if is_exec_flag {
            return Err(TerminalError::InvalidArguments(format!(
                "Non-interactive execution flag '{}' is not permitted in shell profiles.",
                arg
            )));
        }

        validated.push(arg.clone());
    }

    Ok(validated)
}

fn is_blocked_env_key(key: &str) -> bool {
    let upper = key.to_ascii_uppercase();
    if BLOCKED_ENV_VARS.contains(&upper.as_str()) {
        return true;
    }
    if upper.starts_with("LD_") || upper.starts_with("DYLD_") {
        return true;
    }
    if upper.starts_with("CARGO_TARGET_")
        && (upper.ends_with("_RUNNER") || upper.ends_with("_LINKER"))
    {
        return true;
    }
    false
}

/// Validates and sanitizes terminal environment variable overrides, rejecting
/// dangerous loader, interpreter, shell-startup, and PATH variables.
pub fn sanitize_env_vars(
    env_map: &HashMap<String, String>,
) -> Result<Vec<(String, String)>, TerminalError> {
    if env_map.len() > 64 {
        return Err(TerminalError::BlockedEnvironmentVariable(
            "Too many custom environment variables (maximum 64).".to_string(),
        ));
    }

    let mut sanitized = Vec::with_capacity(env_map.len());
    for (key, val) in env_map {
        if key.is_empty() || key.len() > 128 {
            return Err(TerminalError::BlockedEnvironmentVariable(key.clone()));
        }
        let mut chars = key.chars();
        let valid_first = chars
            .next()
            .map(|c| c.is_ascii_alphabetic() || c == '_')
            .unwrap_or(false);
        let valid_rest = chars.all(|c| c.is_ascii_alphanumeric() || c == '_');
        if !valid_first || !valid_rest {
            return Err(TerminalError::BlockedEnvironmentVariable(key.clone()));
        }

        if is_blocked_env_key(key) {
            return Err(TerminalError::BlockedEnvironmentVariable(key.clone()));
        }

        if val.len() > 8192 || val.contains('\0') || val.contains('\r') || val.contains('\n') {
            return Err(TerminalError::BlockedEnvironmentVariable(key.clone()));
        }

        sanitized.push((key.clone(), val.clone()));
    }

    Ok(sanitized)
}

fn user_home_dir() -> Option<PathBuf> {
    #[cfg(windows)]
    let home = env::var("USERPROFILE").ok().map(PathBuf::from);
    #[cfg(not(windows))]
    let home = env::var("HOME").ok().map(PathBuf::from);
    home.filter(|h| h.is_dir())
}

/// Validates and resolves the working directory for a new terminal session.
/// When `workspace_guard` has an active workspace, requested directories are
/// strictly confined within authorized workspace roots.
pub fn resolve_working_directory_with_guard(
    requested: Option<&str>,
    workspace_root: Option<&Path>,
    workspace_guard: Option<&WorkspaceGuard>,
) -> Result<PathBuf, TerminalError> {
    if let Some(req) = requested {
        let trimmed = req.trim();
        if trimmed.is_empty() {
            return Err(TerminalError::InvalidWorkingDirectory(req.to_string()));
        }

        // Enforce lexical + symlink + sensitive-path rules first
        let checked = WorkspaceGuard::lexical_check(trimmed)
            .map_err(|_| TerminalError::InvalidWorkingDirectory(req.to_string()))?;

        if WorkspaceGuard::is_symlink_or_junction(&checked).unwrap_or(true)
            || SensitivePathPolicy::is_sensitive(&checked)
        {
            return Err(TerminalError::InvalidWorkingDirectory(req.to_string()));
        }

        if let Some(guard) = workspace_guard {
            let snap = guard
                .snapshot()
                .map_err(|_| TerminalError::InvalidWorkingDirectory(req.to_string()))?;
            if !snap.authorized_roots.is_empty() {
                let (validated_dir, _) = guard
                    .validate_existing_dir(trimmed)
                    .map_err(|_| TerminalError::InvalidWorkingDirectory(req.to_string()))?;
                return Ok(validated_dir);
            }
        }

        if let Some(ws) = workspace_root {
            if ws.is_dir() {
                let ws_clean = fs::canonicalize(ws)
                    .map(|p| WorkspaceGuard::strip_verbatim_prefix(&p))
                    .unwrap_or_else(|_| WorkspaceGuard::strip_verbatim_prefix(ws));
                let req_canon = fs::canonicalize(&checked)
                    .map(|p| WorkspaceGuard::strip_verbatim_prefix(&p))
                    .map_err(|_| TerminalError::InvalidWorkingDirectory(req.to_string()))?;
                if !WorkspaceGuard::is_path_within(&ws_clean, &req_canon) {
                    return Err(TerminalError::InvalidWorkingDirectory(req.to_string()));
                }
                return Ok(req_canon);
            }
        }

        // Without an active workspace, still block system/protected roots and non-dirs
        WorkspaceGuard::validate_workspace_root_candidate(trimmed)
            .map_err(|_| TerminalError::InvalidWorkingDirectory(req.to_string()))?;
        return Ok(checked);
    }

    if let Some(guard) = workspace_guard {
        if let Ok(snap) = guard.snapshot() {
            if let Some(first_root) = snap.authorized_roots.first() {
                if first_root.is_dir() {
                    return Ok(first_root.clone());
                }
            }
        }
    }

    if let Some(ws) = workspace_root {
        if ws.is_dir() {
            return Ok(ws.to_path_buf());
        }
    }

    if let Some(h) = user_home_dir() {
        return Ok(h);
    }

    Err(TerminalError::InvalidWorkingDirectory(
        "No valid workspace or user home directory available.".to_string(),
    ))
}

/// Validates and resolves the working directory for a new terminal session.
pub fn resolve_working_directory(
    requested: Option<&str>,
    workspace_root: Option<&Path>,
) -> Result<PathBuf, TerminalError> {
    resolve_working_directory_with_guard(requested, workspace_root, None)
}
