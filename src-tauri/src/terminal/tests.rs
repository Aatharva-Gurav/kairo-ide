use super::*;

#[test]
fn test_detect_shells_returns_valid_profiles() {
    let shells = detect_shells();
    assert!(!shells.is_empty(), "Should discover at least one host shell");

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

    let mut child = pair.slave.spawn_command(cmd).expect("Should spawn child in slave PTY");
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
