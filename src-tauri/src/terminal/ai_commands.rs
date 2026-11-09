use super::ai_executor::AiCommandExecutor;
use super::types::{AiBackgroundProcess, AiCommandResult, AiProcessOutput};
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn ai_terminal_run_command(
    executor: State<'_, Arc<AiCommandExecutor>>,
    command: String,
    cwd: Option<String>,
    timeout_ms: Option<u64>,
    max_output_bytes: Option<usize>,
) -> Result<AiCommandResult, String> {
    let exec = executor.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        exec.execute_command(&command, cwd.as_deref(), timeout_ms, max_output_bytes)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub async fn ai_terminal_run_background(
    executor: State<'_, Arc<AiCommandExecutor>>,
    command: String,
    cwd: Option<String>,
    max_output_bytes: Option<usize>,
) -> Result<AiBackgroundProcess, String> {
    let exec = executor.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        exec.start_background_process(&command, cwd.as_deref(), max_output_bytes)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

#[tauri::command]
pub fn ai_terminal_get_output(
    executor: State<'_, Arc<AiCommandExecutor>>,
    execution_id: String,
) -> Result<AiProcessOutput, String> {
    executor
        .get_process_output(&execution_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_terminal_list_processes(
    executor: State<'_, Arc<AiCommandExecutor>>,
    only_active: Option<bool>,
) -> Result<Vec<AiBackgroundProcess>, String> {
    Ok(executor.list_tracked_processes(only_active.unwrap_or(false)))
}

#[tauri::command]
pub fn ai_terminal_stop_process(
    executor: State<'_, Arc<AiCommandExecutor>>,
    execution_id: String,
) -> Result<(), String> {
    executor
        .stop_tracked_process(&execution_id)
        .map_err(|e| e.to_string())
}
