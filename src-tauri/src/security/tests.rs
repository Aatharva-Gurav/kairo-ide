use crate::commands::fs::{
    fs_copy_impl, fs_create_directory_impl, fs_create_file_impl, fs_delete_impl, fs_duplicate_impl,
    fs_exists_impl, fs_get_metadata_impl, fs_list_workspace_files_impl, fs_move_impl,
    fs_read_directory_impl, fs_read_file_impl, fs_rename_impl, fs_replace_in_files_impl,
    fs_search_workspace_impl, fs_write_file_impl, FileReplacementPayload, SearchQueryOptions,
};
use crate::commands::workspace::{
    workspace_add_root_impl, workspace_close_impl, workspace_detect_project_impl,
    workspace_open_impl, workspace_remove_root_impl, workspace_validate_path_impl,
};
use crate::security::asset_protocol::handle_asset_request;
use crate::security::{FsSecurityError, SensitivePathPolicy, WorkspaceGuard};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::http::{Request, StatusCode};

struct TempTestDir {
    path: PathBuf,
}

impl TempTestDir {
    fn new(name: &str) -> Self {
        let base = std::env::temp_dir().join(format!("kairo_sec_test_{}", name));
        let _ = fs::remove_dir_all(&base);
        fs::create_dir_all(&base).expect("create temp test dir");
        Self { path: base }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempTestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn default_search_opts() -> SearchQueryOptions {
    SearchQueryOptions {
        is_case_sensitive: false,
        is_whole_word: false,
        is_regex: false,
        include_patterns: vec![],
        exclude_patterns: vec![],
        max_results: Some(100),
    }
}

#[test]
fn test_valid_and_nested_workspace_operations() {
    let ws = TempTestDir::new("valid_nested");
    let guard = WorkspaceGuard::new();
    let auth = guard
        .open_workspace(&ws.path().to_string_lossy(), Some("ws-1".to_string()))
        .unwrap();
    let root = PathBuf::from(&auth.root_path);

    let nested_dir = root.join("src/components/ui");
    fs_create_directory_impl(&guard, nested_dir.to_string_lossy().to_string()).unwrap();

    let nested_file = nested_dir.join("button.tsx");
    fs_create_file_impl(&guard, nested_file.to_string_lossy().to_string()).unwrap();
    fs_write_file_impl(
        &guard,
        nested_file.to_string_lossy().to_string(),
        "export const Button = () => <button />;".to_string(),
    )
    .unwrap();

    let content = fs_read_file_impl(&guard, nested_file.to_string_lossy().to_string()).unwrap();
    assert!(content.content.contains("Button"));

    assert!(fs_exists_impl(&guard, nested_file.to_string_lossy().to_string()).unwrap());
    assert!(!fs_exists_impl(
        &guard,
        nested_dir.join("missing.tsx").to_string_lossy().to_string()
    )
    .unwrap());

    let renamed = nested_dir.join("primary-button.tsx");
    fs_rename_impl(
        &guard,
        nested_file.to_string_lossy().to_string(),
        renamed.to_string_lossy().to_string(),
    )
    .unwrap();
    assert!(fs_exists_impl(&guard, renamed.to_string_lossy().to_string()).unwrap());

    let entries = fs_read_directory_impl(
        &guard,
        nested_dir.to_string_lossy().to_string(),
        Some(false),
    )
    .unwrap();
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "primary-button.tsx");
}

#[test]
fn test_rejects_parent_traversal_attempts() {
    let base = TempTestDir::new("traversal");
    let ws = base.path().join("workspace");
    let outside = base.path().join("outside");
    fs::create_dir_all(ws.join("sub")).unwrap();
    fs::create_dir_all(&outside).unwrap();
    fs::write(outside.join("secret.txt"), "top-secret").unwrap();

    let guard = WorkspaceGuard::new();
    guard.open_workspace(&ws.to_string_lossy(), None).unwrap();

    let traversal_forward = format!("{}/sub/../../outside/secret.txt", ws.to_string_lossy());
    let traversal_back = format!("{}\\sub\\..\\..\\outside\\secret.txt", ws.to_string_lossy());
    let traversal_create = format!("{}/../evil.txt", ws.to_string_lossy());

    for bad in [&traversal_forward, &traversal_back] {
        assert!(matches!(
            fs_read_file_impl(&guard, bad.clone()),
            Err(FsSecurityError::TraversalDetected(_))
        ));
        assert!(matches!(
            fs_exists_impl(&guard, bad.clone()),
            Err(FsSecurityError::TraversalDetected(_))
        ));
        assert!(matches!(
            fs_get_metadata_impl(&guard, bad.clone()),
            Err(FsSecurityError::TraversalDetected(_))
        ));
        assert!(matches!(
            fs_delete_impl(&guard, bad.clone(), false),
            Err(FsSecurityError::TraversalDetected(_))
        ));
    }

    assert!(matches!(
        fs_create_file_impl(&guard, traversal_create.clone()),
        Err(FsSecurityError::TraversalDetected(_))
    ));
    assert!(matches!(
        fs_write_file_impl(&guard, traversal_create, "pwn".to_string()),
        Err(FsSecurityError::TraversalDetected(_))
    ));
}

#[test]
fn test_rejects_outside_workspace_and_prefix_collision() {
    let base = TempTestDir::new("outside");
    let ws = base.path().join("project");
    let sibling_prefix = base.path().join("project_secret");
    fs::create_dir_all(&ws).unwrap();
    fs::create_dir_all(&sibling_prefix).unwrap();
    let outside_file = sibling_prefix.join("data.txt");
    fs::write(&outside_file, "confidential").unwrap();

    let guard = WorkspaceGuard::new();
    guard.open_workspace(&ws.to_string_lossy(), None).unwrap();

    let out_str = outside_file.to_string_lossy().to_string();
    assert!(matches!(
        fs_read_file_impl(&guard, out_str.clone()),
        Err(FsSecurityError::PathOutsideWorkspace(_))
    ));
    assert!(matches!(
        fs_write_file_impl(&guard, out_str.clone(), "x".to_string()),
        Err(FsSecurityError::PathOutsideWorkspace(_))
    ));
    assert!(matches!(
        fs_create_file_impl(
            &guard,
            sibling_prefix.join("new.txt").to_string_lossy().to_string()
        ),
        Err(FsSecurityError::PathOutsideWorkspace(_))
    ));
    assert!(matches!(
        fs_create_directory_impl(
            &guard,
            sibling_prefix.join("dir").to_string_lossy().to_string()
        ),
        Err(FsSecurityError::PathOutsideWorkspace(_))
    ));
    assert!(matches!(
        fs_read_directory_impl(
            &guard,
            sibling_prefix.to_string_lossy().to_string(),
            Some(true)
        ),
        Err(FsSecurityError::PathOutsideWorkspace(_))
    ));
    assert!(matches!(
        fs_delete_impl(&guard, out_str.clone(), false),
        Err(FsSecurityError::PathOutsideWorkspace(_))
    ));
    assert!(matches!(
        fs_copy_impl(
            &guard,
            out_str.clone(),
            ws.join("stolen.txt").to_string_lossy().to_string()
        ),
        Err(FsSecurityError::PathOutsideWorkspace(_))
    ));
    assert!(matches!(
        fs_move_impl(
            &guard,
            out_str.clone(),
            ws.join("moved.txt").to_string_lossy().to_string()
        ),
        Err(FsSecurityError::PathOutsideWorkspace(_))
    ));
    assert!(matches!(
        fs_rename_impl(
            &guard,
            out_str.clone(),
            sibling_prefix
                .join("renamed.txt")
                .to_string_lossy()
                .to_string()
        ),
        Err(FsSecurityError::PathOutsideWorkspace(_))
    ));
    assert!(matches!(
        fs_duplicate_impl(&guard, out_str.clone()),
        Err(FsSecurityError::PathOutsideWorkspace(_))
    ));
    assert!(matches!(
        fs_exists_impl(&guard, out_str.clone()),
        Err(FsSecurityError::PathOutsideWorkspace(_))
    ));
    assert!(matches!(
        fs_get_metadata_impl(&guard, out_str),
        Err(FsSecurityError::PathOutsideWorkspace(_))
    ));
    assert!(matches!(
        fs_search_workspace_impl(
            &guard,
            sibling_prefix.to_string_lossy().to_string(),
            "confidential".to_string(),
            default_search_opts()
        ),
        Err(FsSecurityError::PathOutsideWorkspace(_))
    ));
    assert!(matches!(
        fs_list_workspace_files_impl(&guard, sibling_prefix.to_string_lossy().to_string(), None),
        Err(FsSecurityError::PathOutsideWorkspace(_))
    ));
}

#[test]
fn test_rejects_unc_device_and_windows_drive_edge_paths() {
    let ws = TempTestDir::new("win_paths");
    let guard = WorkspaceGuard::new();
    guard
        .open_workspace(&ws.path().to_string_lossy(), None)
        .unwrap();

    let bad_paths = vec![
        "",
        "   ",
        "relative/file.txt",
        "./file.txt",
        r"\\server\share\secret.txt",
        "//server/share/secret.txt",
        r"\\.\PhysicalDrive0",
        r"\\?\C:\Windows\System32\drivers\etc\hosts",
        r"\??\C:\secret.txt",
        "C:relative.txt",
        r"\root_relative.txt",
        "path\0with_null.txt",
    ];

    for bad in bad_paths {
        let res = WorkspaceGuard::lexical_check(bad);
        assert!(res.is_err(), "Expected lexical rejection for: {:?}", bad);
        assert!(fs_read_file_impl(&guard, bad.to_string()).is_err());
    }

    #[cfg(windows)]
    {
        let ads = format!("{}\\normal.txt:hidden_stream", ws.path().to_string_lossy());
        assert!(matches!(
            fs_write_file_impl(&guard, ads, "ads".to_string()),
            Err(FsSecurityError::UnsupportedPathFormat(_))
        ));

        let trailing_dot = format!("{}\\.env.", ws.path().to_string_lossy());
        assert!(matches!(
            fs_create_file_impl(&guard, trailing_dot),
            Err(FsSecurityError::UnsupportedPathFormat(_))
        ));
    }
}

#[test]
fn test_sensitive_path_policy_and_ordinary_files() {
    let ws = TempTestDir::new("sensitive");
    let guard = WorkspaceGuard::new();
    let auth = guard
        .open_workspace(&ws.path().to_string_lossy(), None)
        .unwrap();
    let root = PathBuf::from(&auth.root_path);

    // Create sensitive and ordinary files directly on disk for test setup
    fs::create_dir_all(root.join(".git/hooks")).unwrap();
    fs::create_dir_all(root.join(".ssh")).unwrap();
    fs::create_dir_all(root.join("src")).unwrap();

    let sensitive_files = vec![
        root.join(".env"),
        root.join(".env.local"),
        root.join(".env.production"),
        root.join(".git/config"),
        root.join(".git/hooks/pre-commit"),
        root.join(".ssh/id_rsa"),
        root.join("cert.pem"),
        root.join("private.key"),
        root.join("credentials.json"),
        root.join(".npmrc"),
        root.join("gcp-service-account.json"),
    ];

    for sf in &sensitive_files {
        fs::write(sf, "SECRET_TOKEN=12345").unwrap();
        let s = sf.to_string_lossy().to_string();
        assert!(
            SensitivePathPolicy::is_sensitive(sf),
            "Policy should mark sensitive: {}",
            s
        );
        assert!(matches!(
            fs_read_file_impl(&guard, s.clone()),
            Err(FsSecurityError::SensitivePathBlocked(_))
        ));
        assert!(matches!(
            fs_write_file_impl(&guard, s.clone(), "tamper".to_string()),
            Err(FsSecurityError::SensitivePathBlocked(_))
        ));
        assert!(matches!(
            fs_delete_impl(&guard, s.clone(), false),
            Err(FsSecurityError::SensitivePathBlocked(_))
        ));
        assert!(matches!(
            fs_exists_impl(&guard, s.clone()),
            Err(FsSecurityError::SensitivePathBlocked(_))
        ));
        assert!(matches!(
            fs_get_metadata_impl(&guard, s.clone()),
            Err(FsSecurityError::SensitivePathBlocked(_))
        ));
    }

    // Search and list must skip sensitive files
    let search_hits = fs_search_workspace_impl(
        &guard,
        root.to_string_lossy().to_string(),
        "SECRET_TOKEN".to_string(),
        default_search_opts(),
    )
    .unwrap();
    assert!(search_hits.is_empty());

    let listed =
        fs_list_workspace_files_impl(&guard, root.to_string_lossy().to_string(), None).unwrap();
    assert!(listed.is_empty());

    // Directory listing with show_hidden=true keeps sensitive entries visible (Option 2)
    let dir_entries =
        fs_read_directory_impl(&guard, root.to_string_lossy().to_string(), Some(true)).unwrap();
    assert!(dir_entries.iter().any(|e| e.name == ".env"));

    // Ordinary project files must still work normally
    let ordinary_files = vec![
        (root.join("package.json"), r#"{"name": "kairo-test"}"#),
        (root.join("tsconfig.json"), "{}"),
        (root.join(".gitignore"), "node_modules\n"),
        (root.join("src/index.ts"), "export const ok = true;"),
    ];
    for (path, body) in ordinary_files {
        let p = path.to_string_lossy().to_string();
        fs_write_file_impl(&guard, p.clone(), body.to_string()).unwrap();
        let read_back = fs_read_file_impl(&guard, p).unwrap();
        assert_eq!(read_back.content, body);
    }
}

#[test]
fn test_workspace_lifecycle_open_switch_close_and_failed_open() {
    let base = TempTestDir::new("lifecycle");
    let ws_a = base.path().join("ws_a");
    let ws_b = base.path().join("ws_b");
    fs::create_dir_all(&ws_a).unwrap();
    fs::create_dir_all(&ws_b).unwrap();
    let file_a = ws_a.join("a.txt");
    let file_b = ws_b.join("b.txt");
    fs::write(&file_a, "alpha").unwrap();
    fs::write(&file_b, "beta").unwrap();

    let guard = WorkspaceGuard::new();

    // Initially closed: all operations rejected
    assert!(matches!(
        fs_read_file_impl(&guard, file_a.to_string_lossy().to_string()),
        Err(FsSecurityError::NoActiveWorkspace)
    ));

    // Open A
    let auth_a =
        workspace_open_impl(&guard, None, ws_a.to_string_lossy().to_string(), None).unwrap();
    assert_eq!(
        fs_read_file_impl(&guard, file_a.to_string_lossy().to_string())
            .unwrap()
            .content,
        "alpha"
    );

    // Switch to B: A must immediately be rejected
    let auth_b =
        workspace_open_impl(&guard, None, ws_b.to_string_lossy().to_string(), None).unwrap();
    assert!(auth_b.generation > auth_a.generation);
    assert!(matches!(
        fs_read_file_impl(&guard, file_a.to_string_lossy().to_string()),
        Err(FsSecurityError::PathOutsideWorkspace(_))
    ));
    assert_eq!(
        fs_read_file_impl(&guard, file_b.to_string_lossy().to_string())
            .unwrap()
            .content,
        "beta"
    );

    // Stale generation token check
    assert!(matches!(
        guard.ensure_generation(auth_a.generation),
        Err(FsSecurityError::StaleWorkspaceToken)
    ));

    // Failed open must NOT leave partial authorization
    let bad_open = workspace_open_impl(
        &guard,
        None,
        base.path()
            .join("does_not_exist")
            .to_string_lossy()
            .to_string(),
        None,
    );
    assert!(bad_open.is_err());
    assert!(matches!(
        fs_read_file_impl(&guard, file_b.to_string_lossy().to_string()),
        Err(FsSecurityError::NoActiveWorkspace)
    ));

    // Reopen B, test multi-root add/remove and close
    workspace_open_impl(&guard, None, ws_b.to_string_lossy().to_string(), None).unwrap();
    workspace_add_root_impl(&guard, ws_a.to_string_lossy().to_string()).unwrap();
    assert!(fs_read_file_impl(&guard, file_a.to_string_lossy().to_string()).is_ok());

    workspace_remove_root_impl(&guard, ws_a.to_string_lossy().to_string()).unwrap();
    assert!(fs_read_file_impl(&guard, file_a.to_string_lossy().to_string()).is_err());

    workspace_close_impl(&guard, None).unwrap();
    assert!(matches!(
        fs_read_file_impl(&guard, file_b.to_string_lossy().to_string()),
        Err(FsSecurityError::NoActiveWorkspace)
    ));
    assert!(workspace_detect_project_impl(&guard, ws_b.to_string_lossy().to_string()).is_err());
}

#[test]
fn test_cannot_mutate_workspace_root_itself() {
    let ws = TempTestDir::new("root_mutation");
    let guard = WorkspaceGuard::new();
    let auth = guard
        .open_workspace(&ws.path().to_string_lossy(), None)
        .unwrap();

    assert!(matches!(
        fs_delete_impl(&guard, auth.root_path.clone(), true),
        Err(FsSecurityError::WorkspaceRootMutationBlocked(_))
    ));
    assert!(matches!(
        fs_rename_impl(
            &guard,
            auth.root_path.clone(),
            format!("{}_renamed", auth.root_path)
        ),
        Err(FsSecurityError::WorkspaceRootMutationBlocked(_))
    ));
    assert!(matches!(
        fs_move_impl(
            &guard,
            auth.root_path.clone(),
            format!("{}_moved", auth.root_path)
        ),
        Err(FsSecurityError::WorkspaceRootMutationBlocked(_))
    ));
}

#[test]
fn test_batch_replace_is_atomic_on_single_invalid_path() {
    let base = TempTestDir::new("batch_replace");
    let ws = base.path().join("ws");
    let outside = base.path().join("outside");
    fs::create_dir_all(&ws).unwrap();
    fs::create_dir_all(&outside).unwrap();

    let valid_file = ws.join("app.ts");
    let env_file = ws.join(".env");
    let outside_file = outside.join("other.ts");

    fs::write(&valid_file, "const target = 'old';").unwrap();
    fs::write(&env_file, "API_KEY=old").unwrap();
    fs::write(&outside_file, "const target = 'old';").unwrap();

    let guard = WorkspaceGuard::new();
    guard.open_workspace(&ws.to_string_lossy(), None).unwrap();

    // Batch with one out-of-workspace path must fail with ZERO modifications
    let batch_with_outside = vec![
        FileReplacementPayload {
            file_path: valid_file.to_string_lossy().to_string(),
            line_number: 1,
            column: 17,
            match_length: 3,
            replacement: "new".to_string(),
        },
        FileReplacementPayload {
            file_path: outside_file.to_string_lossy().to_string(),
            line_number: 1,
            column: 17,
            match_length: 3,
            replacement: "new".to_string(),
        },
    ];
    assert!(fs_replace_in_files_impl(&guard, batch_with_outside).is_err());
    assert_eq!(
        fs::read_to_string(&valid_file).unwrap(),
        "const target = 'old';"
    );

    // Batch with one sensitive path (.env) must also fail with ZERO modifications
    let batch_with_sensitive = vec![
        FileReplacementPayload {
            file_path: valid_file.to_string_lossy().to_string(),
            line_number: 1,
            column: 17,
            match_length: 3,
            replacement: "new".to_string(),
        },
        FileReplacementPayload {
            file_path: env_file.to_string_lossy().to_string(),
            line_number: 1,
            column: 9,
            match_length: 3,
            replacement: "new".to_string(),
        },
    ];
    assert!(fs_replace_in_files_impl(&guard, batch_with_sensitive).is_err());
    assert_eq!(
        fs::read_to_string(&valid_file).unwrap(),
        "const target = 'old';"
    );
}

#[test]
fn test_asset_protocol_enforces_workspace_and_sensitive_policy() {
    let base = TempTestDir::new("asset_proto");
    let ws = base.path().join("ws");
    let outside = base.path().join("outside");
    fs::create_dir_all(&ws).unwrap();
    fs::create_dir_all(&outside).unwrap();

    let img = ws.join("logo.png");
    let env = ws.join(".env");
    let out_img = outside.join("secret.png");
    fs::write(&img, [0x89, 0x50, 0x4E, 0x47]).unwrap();
    fs::write(&env, "SECRET=1").unwrap();
    fs::write(&out_img, [0x89, 0x50, 0x4E, 0x47]).unwrap();

    let guard = Arc::new(WorkspaceGuard::new());

    let make_req = |p: &Path| {
        let norm = p.to_string_lossy().replace('\\', "/");
        let uri_path = if norm.starts_with('/') {
            format!("http://asset.localhost{}", norm)
        } else {
            format!("http://asset.localhost/{}", norm)
        };
        Request::builder().uri(uri_path).body(Vec::new()).unwrap()
    };

    // Closed workspace -> 403
    assert_eq!(
        handle_asset_request(&guard, &make_req(&img)).status(),
        StatusCode::FORBIDDEN
    );

    // Open workspace -> valid workspace image returns 200, sensitive & outside return 403
    guard.open_workspace(&ws.to_string_lossy(), None).unwrap();
    let ok_resp = handle_asset_request(&guard, &make_req(&img));
    assert_eq!(ok_resp.status(), StatusCode::OK);
    assert_eq!(ok_resp.body().as_ref(), &[0x89, 0x50, 0x4E, 0x47]);

    assert_eq!(
        handle_asset_request(&guard, &make_req(&env)).status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        handle_asset_request(&guard, &make_req(&out_img)).status(),
        StatusCode::FORBIDDEN
    );

    // Close workspace -> image immediately returns 403 again
    guard.close_workspace();
    assert_eq!(
        handle_asset_request(&guard, &make_req(&img)).status(),
        StatusCode::FORBIDDEN
    );
}

#[test]
fn test_single_file_grants_and_system_root_rejection() {
    let base = TempTestDir::new("grants");
    let outside = base.path().join("standalone");
    fs::create_dir_all(&outside).unwrap();

    let picked_ok = outside.join("notes.txt");
    let picked_env = outside.join(".env");
    let save_as_target = outside.join("exported.txt");
    fs::write(&picked_ok, "standalone content").unwrap();
    fs::write(&picked_env, "SECRET=nope").unwrap();

    let guard = WorkspaceGuard::new();

    // Picking a sensitive file is rejected
    assert!(matches!(
        guard.grant_picked_file(&picked_env.to_string_lossy()),
        Err(FsSecurityError::SensitivePathBlocked(_))
    ));

    // Picking an ordinary standalone file allows read/metadata/write on that exact file
    let granted = guard
        .grant_picked_file(&picked_ok.to_string_lossy())
        .unwrap();
    let read = fs_read_file_impl(&guard, granted.to_string_lossy().to_string()).unwrap();
    assert_eq!(read.content, "standalone content");

    // Save As grant allows writing the chosen target
    let save_granted = guard
        .grant_save_as_target(&save_as_target.to_string_lossy())
        .unwrap();
    fs_write_file_impl(
        &guard,
        save_granted.to_string_lossy().to_string(),
        "saved!".to_string(),
    )
    .unwrap();
    assert_eq!(fs::read_to_string(&save_as_target).unwrap(), "saved!");

    // Single-file grants do NOT authorize directory listing or arbitrary sibling access
    assert!(
        fs_read_directory_impl(&guard, outside.to_string_lossy().to_string(), Some(true)).is_err()
    );
    assert!(fs_read_file_impl(&guard, picked_env.to_string_lossy().to_string()).is_err());

    // Closing clears single-file grants
    guard.close_workspace();
    assert!(fs_read_file_impl(&guard, granted.to_string_lossy().to_string()).is_err());

    // System roots cannot be opened as workspaces
    #[cfg(windows)]
    {
        assert!(!workspace_validate_path_impl(r"C:\".to_string()).unwrap());
        assert!(!workspace_validate_path_impl(r"C:\Windows".to_string()).unwrap());
    }
    #[cfg(not(windows))]
    {
        assert!(!workspace_validate_path_impl("/".to_string()).unwrap());
        assert!(!workspace_validate_path_impl("/etc".to_string()).unwrap());
    }
}

#[cfg(windows)]
#[test]
fn test_windows_junction_escape_blocked() {
    use std::process::Command;

    let base = TempTestDir::new("win_junction");
    let ws = base.path().join("ws");
    let outside = base.path().join("outside");
    fs::create_dir_all(&ws).unwrap();
    fs::create_dir_all(&outside).unwrap();

    let outside_secret = outside.join("secret.txt");
    fs::write(&outside_secret, "escaped via junction").unwrap();

    let junction = ws.join("escape_junction");
    let status = Command::new("cmd")
        .args([
            "/C",
            "mklink",
            "/J",
            &junction.to_string_lossy(),
            &outside.to_string_lossy(),
        ])
        .status()
        .expect("run mklink /J");
    if !status.success() {
        eprintln!("Skipping Windows junction test: OS/sandbox denied mklink /J");
        return;
    }

    let guard = WorkspaceGuard::new();
    guard.open_workspace(&ws.to_string_lossy(), None).unwrap();

    let escaped_file = junction.join("secret.txt").to_string_lossy().to_string();

    assert!(matches!(
        fs_read_file_impl(&guard, escaped_file.clone()),
        Err(FsSecurityError::SymlinkOrJunctionBlocked(_))
    ));
    assert!(matches!(
        fs_write_file_impl(&guard, escaped_file.clone(), "pwn".to_string()),
        Err(FsSecurityError::SymlinkOrJunctionBlocked(_))
    ));
    assert!(matches!(
        fs_read_directory_impl(&guard, junction.to_string_lossy().to_string(), Some(true)),
        Err(FsSecurityError::SymlinkOrJunctionBlocked(_))
    ));
    assert!(matches!(
        fs_delete_impl(&guard, junction.to_string_lossy().to_string(), true),
        Err(FsSecurityError::SymlinkOrJunctionBlocked(_))
    ));

    // Directory listing of ws should omit the junction entry
    let root_entries =
        fs_read_directory_impl(&guard, ws.to_string_lossy().to_string(), Some(true)).unwrap();
    assert!(root_entries.is_empty());

    // Search and file list must NOT traverse the junction
    let matches = fs_search_workspace_impl(
        &guard,
        ws.to_string_lossy().to_string(),
        "junction".to_string(),
        default_search_opts(),
    )
    .unwrap();
    assert!(matches.is_empty());

    let listed =
        fs_list_workspace_files_impl(&guard, ws.to_string_lossy().to_string(), None).unwrap();
    assert!(listed.is_empty());

    // Copy of workspace dir must NOT copy files through the junction
    let copy_dest = ws.join("copied_ws");
    fs_create_directory_impl(&guard, copy_dest.to_string_lossy().to_string()).unwrap();
    // Create a clean subdir containing a nested junction and copy it
    let clean_sub = ws.join("sub_with_junction");
    fs::create_dir_all(&clean_sub).unwrap();
    fs::write(clean_sub.join("ok.txt"), "ok").unwrap();
    let nested_junc = clean_sub.join("junc");
    let status2 = Command::new("cmd")
        .args([
            "/C",
            "mklink",
            "/J",
            &nested_junc.to_string_lossy(),
            &outside.to_string_lossy(),
        ])
        .status()
        .expect("run nested mklink /J");
    assert!(status2.success());

    fs_copy_impl(
        &guard,
        clean_sub.to_string_lossy().to_string(),
        copy_dest.join("copied_sub").to_string_lossy().to_string(),
    )
    .unwrap();
    assert!(copy_dest.join("copied_sub/ok.txt").exists());
    assert!(!copy_dest.join("copied_sub/junc/secret.txt").exists());
}

#[test]
fn test_symlink_escape_blocked() {
    let base = TempTestDir::new("symlink");
    let ws = base.path().join("ws");
    let outside = base.path().join("outside");
    fs::create_dir_all(&ws).unwrap();
    fs::create_dir_all(&outside).unwrap();
    let outside_file = outside.join("secret.txt");
    fs::write(&outside_file, "symlink secret").unwrap();

    let link_file = ws.join("link.txt");
    let link_dir = ws.join("link_dir");

    #[cfg(unix)]
    let created = {
        std::os::unix::fs::symlink(&outside_file, &link_file).is_ok()
            && std::os::unix::fs::symlink(&outside, &link_dir).is_ok()
    };

    #[cfg(windows)]
    let created = {
        std::os::windows::fs::symlink_file(&outside_file, &link_file).is_ok()
            && std::os::windows::fs::symlink_dir(&outside, &link_dir).is_ok()
    };

    if !created {
        // On Windows without SeCreateSymbolicLinkPrivilege / Developer Mode,
        // symlink creation returns OS privilege error; junction test above covers Windows reparse links.
        return;
    }

    let guard = WorkspaceGuard::new();
    guard.open_workspace(&ws.to_string_lossy(), None).unwrap();

    assert!(matches!(
        fs_read_file_impl(&guard, link_file.to_string_lossy().to_string()),
        Err(FsSecurityError::SymlinkOrJunctionBlocked(_))
    ));
    assert!(matches!(
        fs_write_file_impl(
            &guard,
            link_file.to_string_lossy().to_string(),
            "x".to_string()
        ),
        Err(FsSecurityError::SymlinkOrJunctionBlocked(_))
    ));
    assert!(matches!(
        fs_read_file_impl(
            &guard,
            link_dir.join("secret.txt").to_string_lossy().to_string()
        ),
        Err(FsSecurityError::SymlinkOrJunctionBlocked(_))
    ));
    assert!(fs_search_workspace_impl(
        &guard,
        ws.to_string_lossy().to_string(),
        "symlink secret".to_string(),
        default_search_opts()
    )
    .unwrap()
    .is_empty());
}

#[test]
fn test_tauri_conf_csp_and_asset_scope_hardening() {
    let conf_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
    let raw = fs::read_to_string(&conf_path).expect("read tauri.conf.json");
    let json: serde_json::Value = serde_json::from_str(&raw).expect("parse tauri.conf.json");

    let security = &json["app"]["security"];
    let prod_csp = security["csp"].as_str().expect("production csp string");
    let dev_csp = security["devCsp"]
        .as_str()
        .expect("development devCsp string");

    // Extract script-src and connect-src directives from production CSP
    let directives: std::collections::HashMap<&str, &str> = prod_csp
        .split(';')
        .map(|d| d.trim())
        .filter(|d| !d.is_empty())
        .filter_map(|d| d.split_once(' '))
        .collect();

    assert_eq!(directives.get("default-src").copied(), Some("'self'"));
    let script_src = directives.get("script-src").copied().unwrap_or("");
    assert!(!script_src.contains("unsafe-eval"));
    assert!(!script_src.contains("unsafe-inline"));
    assert!(!script_src.contains("localhost"));

    let connect_src = directives.get("connect-src").copied().unwrap_or("");
    assert_eq!(connect_src, "'self'");
    assert!(!prod_csp.contains("localhost:3000"));
    assert!(!prod_csp.contains("filesystem:"));
    assert!(!prod_csp.contains("https:;"));
    assert!(!prod_csp.contains("wss:;"));
    assert!(!prod_csp.contains("unsafe-eval"));
    assert_eq!(directives.get("worker-src").copied(), Some("'self'"));
    assert_eq!(directives.get("object-src").copied(), Some("'none'"));
    assert_eq!(directives.get("base-uri").copied(), Some("'self'"));
    assert_eq!(directives.get("frame-ancestors").copied(), Some("'none'"));

    // Dev CSP explicitly keeps Next.js dev server / HMR origins isolated to dev
    assert!(dev_csp.contains("http://localhost:3000"));
    assert!(dev_csp.contains("ws://localhost:3000"));
    assert!(dev_csp.contains("'unsafe-eval'"));

    // Asset protocol scope must never be wildcard
    let scope = security["assetProtocol"]["scope"]
        .as_array()
        .expect("assetProtocol.scope array");
    assert!(scope.is_empty());
}

#[test]
fn test_asset_protocol_workspace_switch_traversal_and_unc() {
    let base = TempTestDir::new("asset_switch");
    let ws_a = base.path().join("ws_a");
    let ws_b = base.path().join("ws_b");
    fs::create_dir_all(&ws_a).unwrap();
    fs::create_dir_all(&ws_b).unwrap();

    let img_a = ws_a.join("a.png");
    let img_b = ws_b.join("b.png");
    fs::write(&img_a, [0x89, 0x50, 0x4E, 0x47]).unwrap();
    fs::write(&img_b, [0x89, 0x50, 0x4E, 0x47]).unwrap();

    let guard = Arc::new(WorkspaceGuard::new());
    let make_req = |p: &Path| {
        let norm = p.to_string_lossy().replace('\\', "/");
        let uri = if norm.starts_with('/') {
            format!("http://asset.localhost{}", norm)
        } else {
            format!("http://asset.localhost/{}", norm)
        };
        Request::builder().uri(uri).body(Vec::new()).unwrap()
    };

    guard.open_workspace(&ws_a.to_string_lossy(), None).unwrap();
    assert_eq!(
        handle_asset_request(&guard, &make_req(&img_a)).status(),
        StatusCode::OK
    );

    // Switch to workspace B -> A is immediately forbidden
    guard.open_workspace(&ws_b.to_string_lossy(), None).unwrap();
    assert_eq!(
        handle_asset_request(&guard, &make_req(&img_a)).status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        handle_asset_request(&guard, &make_req(&img_b)).status(),
        StatusCode::OK
    );

    // Traversal and UNC attempts via asset protocol return 403
    let trav_uri = format!(
        "http://asset.localhost/{}/../ws_a/a.png",
        ws_b.to_string_lossy().replace('\\', "/")
    );
    let trav_req = Request::builder().uri(trav_uri).body(Vec::new()).unwrap();
    assert_eq!(
        handle_asset_request(&guard, &trav_req).status(),
        StatusCode::FORBIDDEN
    );

    let unc_req = Request::builder()
        .uri("http://asset.localhost///server/share/secret.png")
        .body(Vec::new())
        .unwrap();
    assert_eq!(
        handle_asset_request(&guard, &unc_req).status(),
        StatusCode::FORBIDDEN
    );
}
