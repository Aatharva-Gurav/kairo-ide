use crate::security::{FsSecurityError, WorkspaceAuthInfo, WorkspaceGuard};
use crate::terminal::TerminalManager;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::State;

pub fn workspace_open_impl(
    guard: &WorkspaceGuard,
    terminal_manager: Option<&TerminalManager>,
    root_path: String,
    workspace_id: Option<String>,
) -> Result<WorkspaceAuthInfo, FsSecurityError> {
    match guard.open_workspace(&root_path, workspace_id) {
        Ok(info) => {
            if let Some(tm) = terminal_manager {
                tm.set_workspace_root(PathBuf::from(&info.root_path));
            }
            Ok(info)
        }
        Err(err) => {
            if let Some(tm) = terminal_manager {
                tm.clear_workspace_root();
            }
            Err(err)
        }
    }
}

#[tauri::command]
pub fn workspace_open(
    guard: State<'_, Arc<WorkspaceGuard>>,
    terminal_manager: State<'_, Arc<TerminalManager>>,
    root_path: String,
    workspace_id: Option<String>,
) -> Result<WorkspaceAuthInfo, String> {
    workspace_open_impl(
        guard.inner(),
        Some(terminal_manager.inner().as_ref()),
        root_path,
        workspace_id,
    )
    .map_err(Into::into)
}

pub fn workspace_close_impl(
    guard: &WorkspaceGuard,
    terminal_manager: Option<&TerminalManager>,
) -> Result<(), FsSecurityError> {
    guard.close_workspace();
    if let Some(tm) = terminal_manager {
        tm.clear_workspace_root();
    }
    Ok(())
}

#[tauri::command]
pub fn workspace_close(
    guard: State<'_, Arc<WorkspaceGuard>>,
    terminal_manager: State<'_, Arc<TerminalManager>>,
) -> Result<(), String> {
    workspace_close_impl(guard.inner(), Some(terminal_manager.inner().as_ref())).map_err(Into::into)
}

pub fn workspace_add_root_impl(
    guard: &WorkspaceGuard,
    root_path: String,
) -> Result<WorkspaceAuthInfo, FsSecurityError> {
    guard.add_root(&root_path)
}

#[tauri::command]
pub fn workspace_add_root(
    guard: State<'_, Arc<WorkspaceGuard>>,
    root_path: String,
) -> Result<WorkspaceAuthInfo, String> {
    workspace_add_root_impl(guard.inner(), root_path).map_err(Into::into)
}

pub fn workspace_remove_root_impl(
    guard: &WorkspaceGuard,
    root_path: String,
) -> Result<WorkspaceAuthInfo, FsSecurityError> {
    guard.remove_root(&root_path)
}

#[tauri::command]
pub fn workspace_remove_root(
    guard: State<'_, Arc<WorkspaceGuard>>,
    root_path: String,
) -> Result<WorkspaceAuthInfo, String> {
    workspace_remove_root_impl(guard.inner(), root_path).map_err(Into::into)
}

#[tauri::command]
pub fn workspace_pick_folder() -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new().pick_folder();
    Ok(folder.map(|p| WorkspaceGuard::display_path(&p)))
}

#[tauri::command]
pub fn workspace_pick_file(
    guard: State<'_, Arc<WorkspaceGuard>>,
) -> Result<Option<String>, String> {
    let Some(file) = rfd::FileDialog::new().pick_file() else {
        return Ok(None);
    };
    let raw = WorkspaceGuard::display_path(&file);
    let granted = guard.grant_picked_file(&raw).map_err(String::from)?;
    Ok(Some(WorkspaceGuard::display_path(&granted)))
}

#[tauri::command]
pub fn workspace_save_file_as(
    guard: State<'_, Arc<WorkspaceGuard>>,
    default_path: Option<String>,
) -> Result<Option<String>, String> {
    let mut dialog = rfd::FileDialog::new();
    if let Some(dp) = default_path {
        if let Ok(parsed) = WorkspaceGuard::lexical_check(&dp) {
            if let Some(parent) = parsed.parent() {
                if parent.is_dir()
                    && !WorkspaceGuard::is_symlink_or_junction(parent).unwrap_or(true)
                {
                    dialog = dialog.set_directory(parent);
                }
            }
            if let Some(file_name) = parsed.file_name() {
                dialog = dialog.set_file_name(file_name.to_string_lossy());
            }
        }
    }
    let Some(file) = dialog.save_file() else {
        return Ok(None);
    };
    let raw = WorkspaceGuard::display_path(&file);
    let granted = guard.grant_save_as_target(&raw).map_err(String::from)?;
    Ok(Some(WorkspaceGuard::display_path(&granted)))
}

pub fn workspace_validate_path_impl(path: String) -> Result<bool, FsSecurityError> {
    Ok(WorkspaceGuard::validate_workspace_root_candidate(&path).is_ok())
}

#[tauri::command]
pub fn workspace_validate_path(path: String) -> Result<bool, String> {
    workspace_validate_path_impl(path).map_err(Into::into)
}

pub fn workspace_detect_project_impl(
    guard: &WorkspaceGuard,
    root_path: String,
) -> Result<Vec<String>, FsSecurityError> {
    let (p, gen) = guard.validate_workspace_dir_arg(&root_path)?;
    guard.ensure_generation(gen)?;

    let mut characteristics = Vec::new();

    let has_safe_entry = |name: &str| -> bool {
        let candidate = p.join(name);
        std::fs::symlink_metadata(&candidate).is_ok()
            && !WorkspaceGuard::is_symlink_or_junction(&candidate).unwrap_or(true)
    };

    if has_safe_entry("package.json") {
        characteristics.push("Node.js".to_string());
    }
    if has_safe_entry("tsconfig.json") {
        characteristics.push("TypeScript".to_string());
    }
    if has_safe_entry("Cargo.toml") {
        characteristics.push("Rust".to_string());
    }
    if has_safe_entry("pyproject.toml")
        || has_safe_entry("requirements.txt")
        || has_safe_entry("setup.py")
    {
        characteristics.push("Python".to_string());
    }
    if has_safe_entry("pom.xml")
        || has_safe_entry("build.gradle")
        || has_safe_entry("build.gradle.kts")
    {
        characteristics.push("Java".to_string());
    }
    if has_safe_entry("CMakeLists.txt") || has_safe_entry("Makefile") {
        characteristics.push("C/C++".to_string());
    }
    if has_safe_entry("go.mod") {
        characteristics.push("Go".to_string());
    }
    if has_safe_entry("src-tauri") {
        characteristics.push("Tauri".to_string());
    }
    if has_safe_entry("next.config.ts")
        || has_safe_entry("next.config.js")
        || has_safe_entry("next.config.mjs")
    {
        characteristics.push("Next.js".to_string());
    }

    guard.ensure_generation(gen)?;
    Ok(characteristics)
}

#[tauri::command]
pub fn workspace_detect_project(
    guard: State<'_, Arc<WorkspaceGuard>>,
    root_path: String,
) -> Result<Vec<String>, String> {
    workspace_detect_project_impl(guard.inner(), root_path).map_err(Into::into)
}

#[tauri::command]
pub fn app_open_url(url: String) -> Result<(), String> {
    let lower = url.to_lowercase();
    if !lower.starts_with("http://")
        && !lower.starts_with("https://")
        && !lower.starts_with("mailto:")
    {
        return Err("Unsupported URL protocol".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        let mut cmd = std::process::Command::new("rundll32.exe");
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd.args(["url.dll,FileProtocolHandler", &url]);
        cmd.spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
        Ok(())
    }

    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {}", e))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_validate_path_existing_dir() {
        let temp_dir = std::env::temp_dir().join("kairo_test_workspace");
        let _ = fs::create_dir_all(&temp_dir);
        let result = workspace_validate_path(temp_dir.to_string_lossy().to_string());
        assert_eq!(result, Ok(true));
        let _ = fs::remove_dir(&temp_dir);
    }

    #[test]
    fn test_validate_path_nonexistent() {
        let nonexistent = std::env::temp_dir().join("kairo_nonexistent_workspace_123456");
        let result = workspace_validate_path(nonexistent.to_string_lossy().to_string());
        assert_eq!(result, Ok(false));
    }

    #[test]
    fn test_workspace_open_switch_close_and_detect() {
        let dir_a = std::env::temp_dir().join("kairo_ws_test_a");
        let dir_b = std::env::temp_dir().join("kairo_ws_test_b");
        let _ = fs::remove_dir_all(&dir_a);
        let _ = fs::remove_dir_all(&dir_b);
        fs::create_dir_all(&dir_a).unwrap();
        fs::create_dir_all(&dir_b).unwrap();
        fs::write(dir_a.join("Cargo.toml"), "[package]\nname = \"a\"").unwrap();

        let guard = WorkspaceGuard::new();
        let tm = TerminalManager::new();

        // Closed state rejects project detection
        assert!(
            workspace_detect_project_impl(&guard, dir_a.to_string_lossy().to_string()).is_err()
        );

        // Open A
        let info_a = workspace_open_impl(
            &guard,
            Some(&tm),
            dir_a.to_string_lossy().to_string(),
            Some("ws-a".to_string()),
        )
        .unwrap();
        assert!(tm.get_workspace_root().is_some());
        let types = workspace_detect_project_impl(&guard, info_a.root_path.clone()).unwrap();
        assert!(types.contains(&"Rust".to_string()));

        // Switch to B
        let info_b = workspace_open_impl(
            &guard,
            Some(&tm),
            dir_b.to_string_lossy().to_string(),
            Some("ws-b".to_string()),
        )
        .unwrap();
        assert!(info_b.generation > info_a.generation);
        // Old workspace A is no longer authorized
        assert!(workspace_detect_project_impl(&guard, info_a.root_path).is_err());

        // Close
        workspace_close_impl(&guard, Some(&tm)).unwrap();
        assert!(tm.get_workspace_root().is_none());
        assert!(workspace_detect_project_impl(&guard, info_b.root_path).is_err());

        let _ = fs::remove_dir_all(&dir_a);
        let _ = fs::remove_dir_all(&dir_b);
    }
}
