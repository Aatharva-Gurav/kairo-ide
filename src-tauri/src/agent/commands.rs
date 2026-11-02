use std::sync::Arc;
use tauri::State;

use super::sidecar::{
    ensure_desktop_backend_started, wait_for_desktop_backend_endpoint, DesktopBackendEndpoint,
    DesktopBackendState, ENDPOINT_RESPAWN_BACKOFF, ENDPOINT_WAIT_POLL_INTERVAL,
    ENDPOINT_WAIT_TIMEOUT,
};

#[tauri::command]
pub async fn get_desktop_backend_endpoint(
    backend_state: State<'_, Arc<DesktopBackendState>>,
) -> Result<DesktopBackendEndpoint, String> {
    let backend_state = backend_state.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        ensure_desktop_backend_started(&backend_state)?;
        wait_for_desktop_backend_endpoint(
            &backend_state,
            ENDPOINT_WAIT_TIMEOUT,
            ENDPOINT_WAIT_POLL_INTERVAL,
            ENDPOINT_RESPAWN_BACKOFF,
        )
    })
    .await
    .map_err(|e| format!("Desktop backend startup task failed: {e}"))?
}

#[tauri::command]
pub async fn restart_desktop_backend(
    backend_state: State<'_, Arc<DesktopBackendState>>,
) -> Result<DesktopBackendEndpoint, String> {
    let backend_state = backend_state.inner().clone();

    tauri::async_runtime::spawn_blocking(move || {
        backend_state.restart()?;
        ensure_desktop_backend_started(&backend_state)?;
        wait_for_desktop_backend_endpoint(
            &backend_state,
            ENDPOINT_WAIT_TIMEOUT,
            ENDPOINT_WAIT_POLL_INTERVAL,
            ENDPOINT_RESPAWN_BACKOFF,
        )
    })
    .await
    .map_err(|e| format!("Desktop backend restart task failed: {e}"))?
}
