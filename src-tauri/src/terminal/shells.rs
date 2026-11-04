use super::error::TerminalError;
use super::types::ShellProfile;
use std::env;
use std::path::{Path, PathBuf};

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

    let program_files = env::var("ProgramFiles").unwrap_or_else(|_| r"C:\Program Files".to_string());
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
                icon: "powershell".to_string(),
                is_default: !default_set,
                platform: "windows".to_string(),
            });
            default_set = true;
            break;
        }
    }

    // 2. Windows PowerShell (powershell.exe)
    let win_powershell = PathBuf::from(&system_root).join(r"System32\WindowsPowerShell\v1.0\powershell.exe");
    if win_powershell.is_file() {
        profiles.push(ShellProfile {
            id: "powershell".to_string(),
            name: "Windows PowerShell".to_string(),
            executable: win_powershell.to_string_lossy().to_string(),
            args: Some(vec!["-NoLogo".to_string()]),
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
            icon: "terminal".to_string(),
            is_default: !default_set,
            platform: "windows".to_string(),
        });
    }

    // 4. Git Bash
    let program_files_x86 = env::var("ProgramFiles(x86)").unwrap_or_else(|_| r"C:\Program Files (x86)".to_string());
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
            icon: "linux".to_string(),
            is_default: false,
            platform: "windows".to_string(),
        });
    }

    // Absolute fallback: if no known paths found (unlikely), fallback to cmd.exe in System32
    if profiles.is_empty() {
        profiles.push(ShellProfile {
            id: "cmd".to_string(),
            name: "Command Prompt".to_string(),
            executable: r"C:\Windows\System32\cmd.exe".to_string(),
            args: None,
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
        ("zsh-brew", "Zsh (Homebrew)", "/opt/homebrew/bin/zsh", vec!["-l".to_string()]),
        ("bash", "Bash", "/bin/bash", vec!["-l".to_string()]),
        ("bash-brew", "Bash (Homebrew)", "/opt/homebrew/bin/bash", vec!["-l".to_string()]),
        ("fish", "Fish", "/opt/homebrew/bin/fish", vec!["-l".to_string()]),
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

            // Avoid duplicate name if both /usr/bin/bash and /bin/bash exist
            if profiles.iter().any(|p: &ShellProfile| p.name == name) {
                continue;
            }

            profiles.push(ShellProfile {
                id: id.to_string(),
                name: name.to_string(),
                executable: path_str.to_string(),
                args: Some(args),
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
            icon: "terminal".to_string(),
            is_default: true,
            platform: "linux".to_string(),
        });
    }

    profiles
}

/// Resolves the default shell profile or matches by profile ID.
pub fn resolve_shell(profile_id: Option<&str>) -> Result<(String, Vec<String>), TerminalError> {
    let available = detect_shells();

    if let Some(id) = profile_id {
        if let Some(found) = available.iter().find(|p| p.id.eq_ignore_ascii_case(id)) {
            return Ok((found.executable.clone(), found.args.clone().unwrap_or_default()));
        }
        return Err(TerminalError::ShellNotFound(format!(
            "Shell profile '{}' is not installed or available on this system.",
            id
        )));
    }

    // Pick marked default or first available
    let default_profile = available
        .iter()
        .find(|p| p.is_default)
        .or_else(|| available.first())
        .ok_or_else(|| TerminalError::ShellNotFound("No valid shell detected on host system".to_string()))?;

    Ok((
        default_profile.executable.clone(),
        default_profile.args.clone().unwrap_or_default(),
    ))
}

/// Validates that an executable requested directly by the frontend is permitted and exists.
pub fn validate_executable(executable: &str) -> Result<PathBuf, TerminalError> {
    let p = Path::new(executable);
    if !p.is_file() {
        return Err(TerminalError::ShellNotFound(format!(
            "Executable path does not exist or is not a file: {}",
            executable
        )));
    }
    Ok(p.to_path_buf())
}

/// Validates and resolves the working directory for a new terminal session.
pub fn resolve_working_directory(
    requested: Option<&str>,
    workspace_root: Option<&Path>,
) -> Result<PathBuf, TerminalError> {
    if let Some(req) = requested {
        let p = Path::new(req);
        if p.is_dir() {
            return Ok(p.to_path_buf());
        } else {
            return Err(TerminalError::InvalidWorkingDirectory(req.to_string()));
        }
    }

    if let Some(ws) = workspace_root {
        if ws.is_dir() {
            return Ok(ws.to_path_buf());
        }
    }

    // Fallback to user home directory
    #[cfg(windows)]
    let home = env::var("USERPROFILE").ok().map(PathBuf::from);

    #[cfg(not(windows))]
    let home = env::var("HOME").ok().map(PathBuf::from);

    if let Some(h) = home {
        if h.is_dir() {
            return Ok(h);
        }
    }

    env::current_dir().map_err(|e| {
        TerminalError::InvalidWorkingDirectory(format!("Could not determine working directory: {}", e))
    })
}
