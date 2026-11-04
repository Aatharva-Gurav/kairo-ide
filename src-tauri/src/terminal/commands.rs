use super::manager::TerminalManager;
use super::shells::detect_shells;
use super::types::{ShellProfile, TerminalCreateConfig, TerminalSessionInfo};
use std::sync::Arc;
use tauri::{AppHandle, Runtime, State};

#[tauri::command]
pub fn terminal_detect_shells() -> Result<Vec<ShellProfile>, String> {
    Ok(detect_shells())
}

#[tauri::command]
pub async fn terminal_create<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, Arc<TerminalManager>>,
    config: Option<TerminalCreateConfig>,
) -> Result<TerminalSessionInfo, String> {
    let manager = state.inner().clone();
    let cfg = config.unwrap_or_default();

    tauri::async_runtime::spawn_blocking(move || {
        manager.create_session(&app, cfg).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Failed to execute terminal_create task: {}", e))?
}

#[tauri::command]
pub async fn terminal_write(
    state: State<'_, Arc<TerminalManager>>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let manager = state.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        manager
            .write_session(&session_id, data.as_bytes())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Failed to execute terminal_write task: {}", e))?
}

#[tauri::command]
pub fn terminal_resize(
    state: State<'_, Arc<TerminalManager>>,
    session_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state
        .resize_session(&session_id, cols, rows)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn terminal_kill(
    state: State<'_, Arc<TerminalManager>>,
    session_id: String,
) -> Result<(), String> {
    let manager = state.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        manager.kill_session(&session_id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Failed to execute terminal_kill task: {}", e))?
}

#[tauri::command]
pub fn terminal_list_sessions(
    state: State<'_, Arc<TerminalManager>>,
) -> Result<Vec<TerminalSessionInfo>, String> {
    Ok(state.list_sessions())
}

#[tauri::command]
pub fn terminal_get_session(
    state: State<'_, Arc<TerminalManager>>,
    session_id: String,
) -> Result<TerminalSessionInfo, String> {
    state.get_session(&session_id).map_err(|e| e.to_string())
}
