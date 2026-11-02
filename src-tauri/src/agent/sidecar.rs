use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering as AtomicOrdering};
use std::sync::{Arc, Mutex, MutexGuard};
use std::thread;
use std::time::{Duration, Instant};

pub const ENDPOINT_WAIT_TIMEOUT: Duration = Duration::from_secs(30);
pub const ENDPOINT_WAIT_POLL_INTERVAL: Duration = Duration::from_millis(50);
pub const ENDPOINT_RESPAWN_BACKOFF: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopBackendEndpoint {
    pub http_url: String,
    pub ws_url: String,
    pub port: u16,
    pub token: String,
    pub pid: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopBackendReadyLine {
    #[serde(rename = "type")]
    pub line_type: String,
    pub endpoint: Option<String>,
    pub ws_endpoint: Option<String>,
    pub port: Option<u16>,
    pub pid: Option<u64>,
}

pub struct DesktopBackendState {
    pub endpoint: Mutex<Option<DesktopBackendEndpoint>>,
    pub process: Mutex<Option<Child>>,
    pub shutting_down: AtomicBool,
    pub workspace_root: PathBuf,
}

impl DesktopBackendState {
    pub fn new(workspace_root: PathBuf) -> Self {
        Self {
            endpoint: Mutex::new(None),
            process: Mutex::new(None),
            shutting_down: AtomicBool::new(false),
            workspace_root,
        }
    }

    pub fn is_shutting_down(&self) -> bool {
        self.shutting_down.load(AtomicOrdering::Acquire)
    }

    pub fn stop(&self) {
        self.shutting_down.store(true, AtomicOrdering::Release);

        if let Ok(mut process_guard) = self.process.lock() {
            if let Some(child) = process_guard.as_mut() {
                terminate_process_tree(child);
            }
            *process_guard = None;
        }

        if let Ok(mut endpoint_guard) = self.endpoint.lock() {
            *endpoint_guard = None;
        }
    }

    pub fn restart(&self) -> Result<(), String> {
        self.shutting_down.store(false, AtomicOrdering::Release);

        if let Ok(mut process_guard) = self.process.lock() {
            if let Some(child) = process_guard.as_mut() {
                terminate_process_tree(child);
            }
            *process_guard = None;
        }

        if let Ok(mut endpoint_guard) = self.endpoint.lock() {
            *endpoint_guard = None;
        }

        Ok(())
    }
}

impl Drop for DesktopBackendState {
    fn drop(&mut self) {
        self.stop();
    }
}

pub fn generate_secure_token() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    let mut hex = String::with_capacity(64);
    for b in bytes {
        use std::fmt::Write;
        let _ = write!(hex, "{:02x}", b);
    }
    hex
}

#[cfg(windows)]
pub fn hide_console_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
pub fn hide_console_window(_command: &mut Command) {}

pub fn terminate_process_tree(child: &mut Child) {
    let pid = child.id();
    #[cfg(windows)]
    {
        let mut kill_cmd = Command::new("taskkill");
        kill_cmd.args(["/pid", &pid.to_string(), "/T", "/F"]);
        hide_console_window(&mut kill_cmd);
        let _ = kill_cmd.status();
        let _ = child.wait();
    }
    #[cfg(not(windows))]
    {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn resolve_sidecar_script_path(workspace_root: &Path) -> Option<PathBuf> {
    let candidates = [
        workspace_root.join("sidecar").join("index.ts"),
        workspace_root.join("..").join("sidecar").join("index.ts"),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

pub fn spawn_sidecar_process(
    workspace_root: &Path,
    token: &str,
) -> Result<Child, String> {
    let script_path = resolve_sidecar_script_path(workspace_root).ok_or_else(|| {
        format!(
            "Sidecar script not found in workspace: {}",
            workspace_root.display()
        )
    })?;

    let is_windows = cfg!(windows);
    let mut command = if is_windows {
        let mut cmd = Command::new("cmd");
        cmd.args([
            "/c",
            "bun",
            "run",
            &script_path.to_string_lossy(),
            "--port",
            "0",
            "--approval-token",
            token,
            "--workspace",
            &workspace_root.to_string_lossy(),
        ]);
        cmd
    } else {
        let mut cmd = Command::new("bun");
        cmd.args([
            "run",
            &script_path.to_string_lossy(),
            "--port",
            "0",
            "--approval-token",
            token,
            "--workspace",
            &workspace_root.to_string_lossy(),
        ]);
        cmd
    };

    command.current_dir(workspace_root);
    command.stdin(Stdio::null());
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    hide_console_window(&mut command);

    command
        .spawn()
        .map_err(|e| format!("Failed to spawn sidecar process: {e}"))
}

pub fn ensure_desktop_backend_started(state: &Arc<DesktopBackendState>) -> Result<(), String> {
    if state.is_shutting_down() {
        return Ok(());
    }

    let process_guard = state
        .process
        .lock()
        .map_err(|_| "Failed to acquire desktop backend process lock".to_string())?;

    ensure_desktop_backend_started_locked(state, process_guard)
}

fn ensure_desktop_backend_started_locked(
    state: &Arc<DesktopBackendState>,
    mut process_guard: MutexGuard<'_, Option<Child>>,
) -> Result<(), String> {
    if state.is_shutting_down() {
        return Ok(());
    }

    if let Some(existing) = process_guard.as_mut() {
        match existing.try_wait() {
            Ok(None) => return Ok(()), // Live child running
            Ok(Some(_)) | Err(_) => {
                *process_guard = None;
                if let Ok(mut endpoint_guard) = state.endpoint.lock() {
                    *endpoint_guard = None;
                }
            }
        }
    }

    let token = generate_secure_token();
    let mut child = spawn_sidecar_process(&state.workspace_root, &token)?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture desktop backend stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Failed to capture desktop backend stderr".to_string())?;

    let child_pid = child.id();
    let token_clone = token.clone();
    let state_for_stdout = Arc::clone(state);

    thread::spawn(move || {
        let mut reader = BufReader::new(stdout);
        let mut line = String::new();
        loop {
            line.clear();
            let Ok(bytes) = reader.read_line(&mut line) else {
                break;
            };
            if bytes == 0 {
                break;
            }
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            if let Ok(parsed) = serde_json::from_str::<DesktopBackendReadyLine>(trimmed) {
                if parsed.line_type == "ready" {
                    if let (Some(endpoint), Some(ws_endpoint)) = (parsed.endpoint, parsed.ws_endpoint) {
                        let actual_port = parsed.port.unwrap_or(0);
                        let endpoint_record = DesktopBackendEndpoint {
                            http_url: endpoint,
                            ws_url: ws_endpoint,
                            port: actual_port,
                            token: token_clone.clone(),
                            pid: child_pid,
                        };

                        if let Ok(mut endpoint_guard) = state_for_stdout.endpoint.lock() {
                            *endpoint_guard = Some(endpoint_record);
                        }
                    }
                    continue;
                }
            }
            eprintln!("[desktop-backend] {trimmed}");
        }

        let owns_tracked_child = state_for_stdout
            .process
            .lock()
            .ok()
            .map(|guard| guard.as_ref().map(|child| child.id()) == Some(child_pid))
            .unwrap_or(false);

        if owns_tracked_child {
            if let Ok(mut endpoint_guard) = state_for_stdout.endpoint.lock() {
                *endpoint_guard = None;
            }
        }
    });

    thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(text) = line {
                if !text.trim().is_empty() {
                    eprintln!("[desktop-backend:err] {}", text.trim());
                }
            }
        }
    });

    *process_guard = Some(child);
    Ok(())
}

pub fn wait_for_desktop_backend_endpoint(
    state: &Arc<DesktopBackendState>,
    total_wait: Duration,
    poll_interval: Duration,
    respawn_backoff: Duration,
) -> Result<DesktopBackendEndpoint, String> {
    let deadline = Instant::now() + total_wait;
    let mut last_respawn: Option<Instant> = None;

    loop {
        if state.is_shutting_down() {
            return Err("Desktop backend is shutting down".to_string());
        }

        if let Some(endpoint) = state
            .endpoint
            .lock()
            .ok()
            .and_then(|value| value.as_ref().cloned())
        {
            return Ok(endpoint);
        }

        let child_exited = state
            .process
            .lock()
            .ok()
            .map(|mut guard| match guard.as_mut() {
                Some(child) => !matches!(child.try_wait(), Ok(None)),
                None => true,
            })
            .unwrap_or(false);

        if child_exited
            && last_respawn
                .map(|at| at.elapsed() >= respawn_backoff)
                .unwrap_or(true)
        {
            last_respawn = Some(Instant::now());
            ensure_desktop_backend_started(state)?;
        }

        if Instant::now() >= deadline {
            return Err("Timed out waiting for desktop backend endpoint".to_string());
        }

        thread::sleep(poll_interval);
    }
}
