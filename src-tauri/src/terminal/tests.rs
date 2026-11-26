use super::*;

#[test]
fn test_detect_shells_returns_valid_profiles() {
    let shells = detect_shells();
    assert!(
        !shells.is_empty(),
        "Should discover at least one host shell"
    );

    // Must have exactly one default shell
    let default_shells: Vec<_> = shells.iter().filter(|s| s.is_default).collect();
    assert_eq!(
        default_shells.len(),
        1,
        "Exactly one shell profile should be flagged as default"
    );

    for shell in &shells {
        assert!(!shell.id.is_empty());
        assert!(!shell.name.is_empty());
        assert!(!shell.executable.is_empty());
        assert!(
            std::path::Path::new(&shell.executable).is_file(),
            "Discovered shell executable must exist on filesystem: {}",
            shell.executable
        );
    }
}

#[test]
fn test_resolve_default_shell() {
    let (exec, _args) = resolve_shell(None).expect("Should resolve default shell");
    assert!(!exec.is_empty());
    assert!(std::path::Path::new(&exec).is_file());
}

#[test]
fn test_resolve_invalid_shell_profile() {
    let result = resolve_shell(Some("non_existent_custom_shell_profile_xyz"));
    assert!(result.is_err());
    match result.unwrap_err() {
        TerminalError::ShellNotFound(_) => {}
        other => panic!("Expected ShellNotFound, got {:?}", other),
    }
}

#[test]
fn test_resolve_working_directory_valid() {
    let temp_dir = std::env::temp_dir();
    let resolved = resolve_working_directory(Some(&temp_dir.to_string_lossy()), None)
        .expect("Should resolve valid directory");
    assert_eq!(resolved, temp_dir);
}

#[test]
fn test_resolve_working_directory_invalid() {
    let fake_path = if cfg!(windows) {
        r"C:\NonExistentPath_Kairo_Test_123456789"
    } else {
        "/non_existent_path_kairo_test_123456789"
    };

    let result = resolve_working_directory(Some(fake_path), None);
    assert!(result.is_err());
    match result.unwrap_err() {
        TerminalError::InvalidWorkingDirectory(p) => assert_eq!(p, fake_path),
        other => panic!("Expected InvalidWorkingDirectory, got {:?}", other),
    }
}

#[test]
fn test_resolve_working_directory_fallback_workspace() {
    let temp_dir = std::env::temp_dir();
    let resolved = resolve_working_directory(None, Some(&temp_dir))
        .expect("Should fall back to valid workspace directory");
    assert_eq!(resolved, temp_dir);
}

#[test]
fn test_terminal_manager_lifecycle_empty() {
    let manager = TerminalManager::new();
    assert_eq!(manager.list_sessions().len(), 0);

    let fake_id = "00000000-0000-0000-0000-000000000000";
    let get_res = manager.get_session(fake_id);
    assert!(get_res.is_err());

    let write_res = manager.write_session(fake_id, b"echo hello\n");
    assert!(write_res.is_err());

    let resize_res = manager.resize_session(fake_id, 100, 30);
    assert!(resize_res.is_err());

    let kill_res = manager.kill_session(fake_id);
    assert!(kill_res.is_err());
}

#[test]
fn test_terminal_manager_workspace_root_sync() {
    let manager = TerminalManager::new();
    let temp_dir = std::env::temp_dir();
    manager.set_workspace_root(temp_dir.clone());

    assert_eq!(manager.get_workspace_root(), Some(temp_dir));
}

#[test]
fn test_pty_session_direct_creation_and_teardown() {
    let pty_system = portable_pty::native_pty_system();
    let pair = pty_system
        .openpty(portable_pty::PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("Should open native PTY pair");

    let (shell_exec, shell_args) = resolve_shell(None).expect("Should resolve default shell");

    let mut cmd = portable_pty::CommandBuilder::new(&shell_exec);
    cmd.args(&shell_args);
    let temp_dir = std::env::temp_dir();
    cmd.cwd(&temp_dir);

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .expect("Should spawn child in slave PTY");
    assert!(child.process_id().is_some() || cfg!(unix));

    let mut writer = pair.master.take_writer().expect("Should take writer");
    writer.write_all(b"exit\r\n").expect("Should write to PTY");
    writer.flush().expect("Should flush PTY writer");

    // Verify resize
    pair.master
        .resize(portable_pty::PtySize {
            rows: 30,
            cols: 100,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("Should resize master PTY");

    // Clean teardown
    let _ = child.kill();
}

#[test]
fn test_validate_executable_path_lookup() {
    #[cfg(windows)]
    {
        let res = validate_executable("cmd");
        assert!(res.is_ok(), "Should resolve 'cmd' via PATH on Windows");
    }

    #[cfg(unix)]
    {
        let res = validate_executable("sh");
        assert!(res.is_ok(), "Should resolve 'sh' via PATH on Unix");
    }
}

struct TempTestDir(std::path::PathBuf);

impl TempTestDir {
    fn new(prefix: &str) -> Self {
        let unique = format!(
            "kairo_{}_{}_{}",
            prefix,
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        let base = std::fs::canonicalize(std::env::temp_dir())
            .map(|p| crate::security::WorkspaceGuard::strip_verbatim_prefix(&p))
            .unwrap_or_else(|_| std::env::temp_dir());
        let dir = base.join(unique);
        std::fs::create_dir_all(&dir).expect("Failed to create temp test directory");
        Self(dir)
    }
}

impl Drop for TempTestDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

#[test]
fn test_validate_shell_executable_rejects_arbitrary_binaries_and_scripts() {
    use super::shells::validate_shell_executable;

    // Non-shell binaries must be rejected even if present on PATH
    for disallowed in &[
        "python",
        "node",
        "curl",
        "whoami",
        "notepad.exe",
        "run.bat",
        "script.cmd",
    ] {
        let res = validate_shell_executable(disallowed, None);
        assert!(
            res.is_err(),
            "Should reject non-shell executable '{}'",
            disallowed
        );
    }

    // Traversal and UNC paths must be rejected
    assert!(validate_shell_executable("../cmd.exe", None).is_err());
    assert!(validate_shell_executable(r"\\server\share\pwsh.exe", None).is_err());

    // Workspace-planted shell binary must be rejected even if named pwsh.exe / bash
    let ws = TempTestDir::new("ws_planted_shell");
    let planted_name = if cfg!(windows) { "pwsh.exe" } else { "bash" };
    let planted = ws.0.join(planted_name);
    std::fs::write(&planted, b"not a real shell").expect("write planted file");

    let guard = crate::security::WorkspaceGuard::new();
    guard
        .open_workspace(&ws.0.to_string_lossy(), None)
        .expect("open temp workspace");

    let planted_res = validate_shell_executable(&planted.to_string_lossy(), Some(&guard));
    assert!(
        planted_res.is_err(),
        "Workspace-planted shell executable must be rejected"
    );
}

#[test]
fn test_validate_shell_args_blocks_non_interactive_execution_flags() {
    use super::shells::validate_shell_args;

    assert!(validate_shell_args(&["-NoLogo".to_string(), "-NoProfile".to_string()]).is_ok());
    assert!(validate_shell_args(&["-l".to_string(), "-i".to_string()]).is_ok());

    for flag in &[
        "-c",
        "/c",
        "/C",
        "/k",
        "-e",
        "-File",
        "-Command",
        "-EncodedCommand",
        "-enc",
        "-ic",
        "-lc",
    ] {
        let res = validate_shell_args(&[(*flag).to_string()]);
        assert!(
            matches!(res, Err(TerminalError::InvalidArguments(_))),
            "Flag '{}' should be rejected, got {:?}",
            flag,
            res
        );
    }
}

#[test]
fn test_sanitize_env_vars_blocks_dangerous_overrides() {
    use super::shells::sanitize_env_vars;
    use std::collections::HashMap;

    for blocked in &[
        "PATH",
        "path",
        "LD_PRELOAD",
        "LD_LIBRARY_PATH",
        "DYLD_INSERT_LIBRARIES",
        "NODE_OPTIONS",
        "BASH_ENV",
        "PYTHONSTARTUP",
        "CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_RUNNER",
        "GIT_SSH_COMMAND",
    ] {
        let mut map = HashMap::new();
        map.insert((*blocked).to_string(), "evil".to_string());
        let res = sanitize_env_vars(&map);
        assert!(
            matches!(res, Err(TerminalError::BlockedEnvironmentVariable(_))),
            "Blocked env var '{}' must fail, got {:?}",
            blocked,
            res
        );
    }

    let mut invalid_val = HashMap::new();
    invalid_val.insert("SAFE_VAR".to_string(), "line1\nline2".to_string());
    assert!(matches!(
        sanitize_env_vars(&invalid_val),
        Err(TerminalError::BlockedEnvironmentVariable(_))
    ));

    let mut allowed = HashMap::new();
    allowed.insert("NODE_ENV".to_string(), "development".to_string());
    allowed.insert("MY_APP_FLAG".to_string(), "1".to_string());
    let sanitized = sanitize_env_vars(&allowed).expect("Safe env vars should pass");
    assert_eq!(sanitized.len(), 2);
}

#[test]
fn test_resolve_working_directory_with_guard_enforces_workspace_boundary() {
    use super::shells::resolve_working_directory_with_guard;

    let ws = TempTestDir::new("term_cwd_ws");
    let sub = ws.0.join("packages").join("app");
    std::fs::create_dir_all(&sub).expect("create workspace subdir");

    let outside = TempTestDir::new("term_cwd_outside");
    let git_dir = ws.0.join(".git");
    std::fs::create_dir_all(&git_dir).expect("create .git dir");

    let guard = crate::security::WorkspaceGuard::new();
    guard
        .open_workspace(&ws.0.to_string_lossy(), None)
        .expect("open workspace");

    let allowed = resolve_working_directory_with_guard(
        Some(&sub.to_string_lossy()),
        Some(&ws.0),
        Some(&guard),
    );
    assert!(
        allowed.is_ok(),
        "Workspace subdir must be allowed: {:?}",
        allowed
    );

    let default_ws = resolve_working_directory_with_guard(None, Some(&ws.0), Some(&guard));
    assert!(default_ws.is_ok());

    let out_res = resolve_working_directory_with_guard(
        Some(&outside.0.to_string_lossy()),
        Some(&ws.0),
        Some(&guard),
    );
    assert!(
        matches!(out_res, Err(TerminalError::InvalidWorkingDirectory(_))),
        "Outside workspace directory must be rejected"
    );

    let traversal_res = resolve_working_directory_with_guard(
        Some(&format!("{}/../..", sub.to_string_lossy())),
        Some(&ws.0),
        Some(&guard),
    );
    assert!(matches!(
        traversal_res,
        Err(TerminalError::InvalidWorkingDirectory(_))
    ));

    let sensitive_res = resolve_working_directory_with_guard(
        Some(&git_dir.to_string_lossy()),
        Some(&ws.0),
        Some(&guard),
    );
    assert!(matches!(
        sensitive_res,
        Err(TerminalError::InvalidWorkingDirectory(_))
    ));
}

#[test]
fn test_prepare_terminal_launch_rejects_raw_executable_and_syncs_custom_profile() {
    use super::session::prepare_terminal_launch;
    use std::collections::HashMap;

    let ws = TempTestDir::new("term_launch_ws");
    let guard = crate::security::WorkspaceGuard::new();
    guard
        .open_workspace(&ws.0.to_string_lossy(), None)
        .expect("open workspace");

    let malicious_config = TerminalCreateConfig {
        shell_id: None,
        executable: Some(if cfg!(windows) {
            "powershell.exe".to_string()
        } else {
            "sh".to_string()
        }),
        args: None,
        env: None,
        cwd: None,
        cols: Some(80),
        rows: Some(24),
        workspace_id: None,
    };

    let err = prepare_terminal_launch(&malicious_config, Some(&ws.0), Some(&guard), None)
        .expect_err("Direct config.executable override must be rejected");
    assert!(matches!(err, TerminalError::UnauthorizedExecutable(_)));

    let manager = TerminalManager::new();
    let shell_name = if cfg!(windows) { "cmd.exe" } else { "sh" };

    // Invalid custom profile (non-shell executable) must be rejected
    let invalid_custom = vec![ShellProfile {
        id: "evil-python".to_string(),
        name: "Evil Python".to_string(),
        executable: "python".to_string(),
        args: None,
        env: None,
        cwd: None,
        icon: "terminal".to_string(),
        is_default: false,
        is_custom: Some(true),
        platform: std::env::consts::OS.to_string(),
    }];
    assert!(manager
        .sync_custom_profiles(invalid_custom, Some(&guard))
        .is_err());

    // Valid custom profile is accepted and launched by shellId
    let mut safe_env = HashMap::new();
    safe_env.insert("KAIRO_CUSTOM_TERM".to_string(), "yes".to_string());
    let valid_custom = vec![ShellProfile {
        id: "custom-shell".to_string(),
        name: "Custom Shell".to_string(),
        executable: shell_name.to_string(),
        args: Some(vec![]),
        env: Some(safe_env),
        cwd: None,
        icon: "terminal".to_string(),
        is_default: false,
        is_custom: Some(true),
        platform: std::env::consts::OS.to_string(),
    }];
    let synced = manager
        .sync_custom_profiles(valid_custom, Some(&guard))
        .expect("Valid custom shell profile should sync");
    assert_eq!(synced.len(), 1);

    let registered = manager
        .get_custom_profile("custom-shell")
        .expect("Custom profile should be registered in manager");
    let launch_cfg = TerminalCreateConfig {
        shell_id: Some("custom-shell".to_string()),
        executable: None,
        args: None,
        env: None,
        cwd: None,
        cols: Some(80),
        rows: Some(24),
        workspace_id: None,
    };
    let prepared =
        prepare_terminal_launch(&launch_cfg, Some(&ws.0), Some(&guard), Some(&registered))
            .expect("Registered custom profile should prepare cleanly");
    assert!(!prepared.shell_exec.is_empty());
    assert!(prepared
        .sanitized_env
        .iter()
        .any(|(k, v)| k == "KAIRO_CUSTOM_TERM" && v == "yes"));
}

#[test]
fn test_terminal_session_get_info_handles_poisoned_mutexes_without_panicking() {
    use portable_pty::{native_pty_system, CommandBuilder, PtySize};
    use std::sync::atomic::{AtomicBool, AtomicU16};
    use std::sync::{Arc, Mutex};

    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .expect("Should open PTY pair for poison test");

    let (shell_exec, shell_args) = resolve_shell(None).expect("Should resolve shell");
    let mut cmd = CommandBuilder::new(&shell_exec);
    cmd.args(&shell_args);
    cmd.cwd(std::env::temp_dir());

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .expect("Should spawn child process");
    drop(pair.slave);
    let _ = child.kill();
    let _ = child.wait();
    let writer = pair.master.take_writer().expect("Should take writer");

    let session = Arc::new(TerminalSession {
        session_id: "poison-test-session".to_string(),
        pid: None,
        shell: shell_exec,
        args: shell_args,
        cwd: std::env::temp_dir().to_string_lossy().to_string(),
        master: Mutex::new(pair.master),
        writer: Mutex::new(writer),
        child: Mutex::new(child),
        status: Mutex::new(SessionStatus::Running),
        exit_code: Mutex::new(None),
        cols: AtomicU16::new(80),
        rows: AtomicU16::new(24),
        created_at: 0,
        is_shutting_down: Arc::new(AtomicBool::new(false)),
        workspace_id: None,
    });

    // Healthy snapshot succeeds
    let ok_info = session
        .get_info()
        .expect("Healthy session get_info should succeed");
    assert_eq!(ok_info.session_id, "poison-test-session");
    assert_eq!(ok_info.status, SessionStatus::Running);

    let manager = TerminalManager::new();
    manager.insert_session_for_test(Arc::clone(&session));
    assert_eq!(manager.list_sessions().len(), 1);
    assert!(manager.try_list_sessions().is_ok());

    // Intentionally poison `status` mutex inside a scoped panicking thread
    let session_for_panic = Arc::clone(&session);
    let _ = std::thread::spawn(move || {
        let _guard = session_for_panic.status.lock().unwrap();
        panic!("Intentional panic to poison status mutex");
    })
    .join();

    // Must not panic and must return structured LockPoisoned errors
    let info_err = session
        .get_info()
        .expect_err("Poisoned status mutex should return structured error");
    assert!(matches!(info_err, TerminalError::LockPoisoned(_)));

    let get_err = manager
        .get_session("poison-test-session")
        .expect_err("get_session should propagate LockPoisoned");
    assert!(matches!(get_err, TerminalError::LockPoisoned(_)));

    let list_err = manager
        .try_list_sessions()
        .expect_err("try_list_sessions should propagate LockPoisoned");
    assert!(matches!(list_err, TerminalError::LockPoisoned(_)));

    // Non-failing list_sessions skips poisoned entries without panicking
    assert!(manager.list_sessions().is_empty());

    let _ = session.kill();
}
