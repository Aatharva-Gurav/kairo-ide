use super::error::TerminalError;
use super::types::{AiBackgroundProcess, AiCommandResult, AiProcessOutput, AiProcessStatus};
use std::collections::HashMap;
use std::io::Read;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use uuid::Uuid;

const DEFAULT_TIMEOUT_MS: u64 = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES: usize = 1_048_576; // 1 MB

struct BackgroundProcessEntry {
    execution_id: String,
    process_id: u32,
    command: String,
    cwd: String,
    started_at: u64,
    finished_at: Option<u64>,
    child: Arc<Mutex<Option<Child>>>,
    stdout_buf: Arc<Mutex<Vec<u8>>>,
    stderr_buf: Arc<Mutex<Vec<u8>>>,
    status: Arc<Mutex<AiProcessStatus>>,
    exit_code: Arc<Mutex<Option<i32>>>,
    is_cancelled: Arc<AtomicBool>,
}

#[derive(Clone)]
pub struct AiCommandExecutor {
    processes: Arc<RwLock<HashMap<String, Arc<BackgroundProcessEntry>>>>,
    default_workspace_root: Arc<RwLock<Option<PathBuf>>>,
}

impl AiCommandExecutor {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(RwLock::new(HashMap::new())),
            default_workspace_root: Arc::new(RwLock::new(None)),
        }
    }

    pub fn set_workspace_root(&self, path: PathBuf) {
        if let Ok(mut lock) = self.default_workspace_root.write() {
            *lock = Some(path);
        }
    }

    fn resolve_cwd<'a>(&'a self, cwd: Option<&'a str>) -> Result<PathBuf, TerminalError> {
        if let Some(c) = cwd {
            let p = PathBuf::from(c);
            if p.exists() && p.is_dir() {
                return Ok(p);
            }
        }

        if let Ok(lock) = self.default_workspace_root.read() {
            if let Some(ws) = &*lock {
                if ws.exists() && ws.is_dir() {
                    return Ok(ws.clone());
                }
            }
        }

        std::env::current_dir().map_err(TerminalError::Io)
    }

    /// Executes a non-interactive shell command synchronously with timeout and output bounds.
    pub fn execute_command(
        &self,
        cmd_str: &str,
        cwd: Option<&str>,
        timeout_ms: Option<u64>,
        max_output_bytes: Option<usize>,
    ) -> Result<AiCommandResult, TerminalError> {
        let work_dir = self.resolve_cwd(cwd)?;
        let timeout = Duration::from_millis(timeout_ms.unwrap_or(DEFAULT_TIMEOUT_MS));
        let max_bytes = max_output_bytes.unwrap_or(DEFAULT_MAX_OUTPUT_BYTES);

        let start_instant = Instant::now();

        #[cfg(windows)]
        let mut command = {
            let mut c = Command::new("cmd.exe");
            c.args(["/d", "/s", "/c", cmd_str]);
            c
        };

        #[cfg(not(windows))]
        let mut command = {
            let mut c = Command::new("sh");
            c.args(["-c", cmd_str]);
            c
        };

        command.current_dir(&work_dir);
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = command
            .spawn()
            .map_err(|e| TerminalError::PtySpawnFailed(format!("Failed to spawn command: {}", e)))?;

        let child_pid = child.id();
        let mut stdout_handle = child.stdout.take();
        let mut stderr_handle = child.stderr.take();

        let stdout_data = Arc::new(Mutex::new(Vec::new()));
        let stderr_data = Arc::new(Mutex::new(Vec::new()));

        let stdout_data_clone = stdout_data.clone();
        let t_stdout = thread::spawn(move || {
            if let Some(mut stream) = stdout_handle.take() {
                let mut chunk = [0u8; 4096];
                while let Ok(n) = stream.read(&mut chunk) {
                    if n == 0 {
                        break;
                    }
                    let mut lock = stdout_data_clone.lock().unwrap();
                    if lock.len() < max_bytes {
                        let take = usize::min(n, max_bytes - lock.len());
                        lock.extend_from_slice(&chunk[..take]);
                    }
                }
            }
        });

        let stderr_data_clone = stderr_data.clone();
        let t_stderr = thread::spawn(move || {
            if let Some(mut stream) = stderr_handle.take() {
                let mut chunk = [0u8; 4096];
                while let Ok(n) = stream.read(&mut chunk) {
                    if n == 0 {
                        break;
                    }
                    let mut lock = stderr_data_clone.lock().unwrap();
                    if lock.len() < max_bytes {
                        let take = usize::min(n, max_bytes - lock.len());
                        lock.extend_from_slice(&chunk[..take]);
                    }
                }
            }
        });

        // Wait with timeout
        let poll_interval = Duration::from_millis(50);
        let mut timed_out = false;
        let mut exit_status = None;

        while start_instant.elapsed() < timeout {
            match child.try_wait() {
                Ok(Some(status)) => {
                    exit_status = Some(status);
                    break;
                }
                Ok(None) => {
                    thread::sleep(poll_interval);
                }
                Err(err) => {
                    return Err(TerminalError::ProcessKillFailed(format!("Error polling child: {}", err)));
                }
            }
        }

        if exit_status.is_none() {
            timed_out = true;
            // Kill timed out child process tree
            Self::kill_process_by_pid(child_pid);
            let _ = child.kill();
        }

        let _ = t_stdout.join();
        let _ = t_stderr.join();

        let execution_time_ms = start_instant.elapsed().as_millis() as u64;

        let stdout_bytes = stdout_data.lock().unwrap().clone();
        let stderr_bytes = stderr_data.lock().unwrap().clone();

        let truncated = stdout_bytes.len() >= max_bytes || stderr_bytes.len() >= max_bytes;

        let exit_code = if timed_out {
            -1
        } else {
            exit_status.and_then(|s| s.code()).unwrap_or(-1)
        };

        let stdout_str = String::from_utf8_lossy(&stdout_bytes).to_string();
        let mut stderr_str = String::from_utf8_lossy(&stderr_bytes).to_string();

        if timed_out {
            if !stderr_str.is_empty() {
                stderr_str.push('\n');
            }
            stderr_str.push_str(&format!(
                "[Kairo AI Security] Command timed out after {}ms and was terminated.",
                timeout.as_millis()
            ));
        }

        Ok(AiCommandResult {
            exit_code,
            stdout: stdout_str,
            stderr: stderr_str,
            execution_time_ms,
            truncated,
        })
    }

    /// Spawns a background command and tracks it.
    pub fn start_background_process(
        &self,
        cmd_str: &str,
        cwd: Option<&str>,
        max_output_bytes: Option<usize>,
    ) -> Result<AiBackgroundProcess, TerminalError> {
        let work_dir = self.resolve_cwd(cwd)?;
        let max_bytes = max_output_bytes.unwrap_or(DEFAULT_MAX_OUTPUT_BYTES);
        let execution_id = format!("ai_proc_{}", Uuid::new_v4().to_string().replace('-', ""));

        #[cfg(windows)]
        let mut command = {
            let mut c = Command::new("cmd.exe");
            c.args(["/d", "/s", "/c", cmd_str]);
            c
        };

        #[cfg(not(windows))]
        let mut command = {
            let mut c = Command::new("sh");
            c.args(["-c", cmd_str]);
            c
        };

        command.current_dir(&work_dir);
        command.stdout(Stdio::piped());
        command.stderr(Stdio::piped());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            command.creation_flags(CREATE_NO_WINDOW);
        }

        let mut child = command
            .spawn()
            .map_err(|e| TerminalError::PtySpawnFailed(format!("Failed to spawn background process: {}", e)))?;

        let pid = child.id();
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let mut stdout_handle = child.stdout.take();
        let mut stderr_handle = child.stderr.take();

        let stdout_buf = Arc::new(Mutex::new(Vec::new()));
        let stderr_buf = Arc::new(Mutex::new(Vec::new()));
        let status = Arc::new(Mutex::new(AiProcessStatus::Running));
        let exit_code = Arc::new(Mutex::new(None));
        let is_cancelled = Arc::new(AtomicBool::new(false));

        let stdout_clone = stdout_buf.clone();
        let is_cancelled_stdout = is_cancelled.clone();
        thread::spawn(move || {
            if let Some(mut stream) = stdout_handle.take() {
                let mut chunk = [0u8; 4096];
                while let Ok(n) = stream.read(&mut chunk) {
                    if n == 0 || is_cancelled_stdout.load(Ordering::Acquire) {
                        break;
                    }
                    let mut lock = stdout_clone.lock().unwrap();
                    if lock.len() < max_bytes {
                        let take = usize::min(n, max_bytes - lock.len());
                        lock.extend_from_slice(&chunk[..take]);
                    }
                }
            }
        });

        let stderr_clone = stderr_buf.clone();
        let is_cancelled_stderr = is_cancelled.clone();
        thread::spawn(move || {
            if let Some(mut stream) = stderr_handle.take() {
                let mut chunk = [0u8; 4096];
                while let Ok(n) = stream.read(&mut chunk) {
                    if n == 0 || is_cancelled_stderr.load(Ordering::Acquire) {
                        break;
                    }
                    let mut lock = stderr_clone.lock().unwrap();
                    if lock.len() < max_bytes {
                        let take = usize::min(n, max_bytes - lock.len());
                        lock.extend_from_slice(&chunk[..take]);
                    }
                }
            }
        });

        let child_arc = Arc::new(Mutex::new(Some(child)));
        let child_wait_clone = child_arc.clone();
        let status_wait_clone = status.clone();
        let exit_code_wait_clone = exit_code.clone();

        thread::spawn(move || {
            loop {
                thread::sleep(Duration::from_millis(100));
                let mut child_guard = child_wait_clone.lock().unwrap();
                if let Some(c) = child_guard.as_mut() {
                    match c.try_wait() {
                        Ok(Some(st)) => {
                            let mut s_lock = status_wait_clone.lock().unwrap();
                            if *s_lock == AiProcessStatus::Running {
                                *s_lock = AiProcessStatus::Completed;
                            }
                            *exit_code_wait_clone.lock().unwrap() = st.code();
                            break;
                        }
                        Ok(None) => {}
                        Err(_) => {
                            let mut s_lock = status_wait_clone.lock().unwrap();
                            if *s_lock == AiProcessStatus::Running {
                                *s_lock = AiProcessStatus::Failed;
                            }
                            break;
                        }
                    }
                } else {
                    break;
                }
            }
        });

        let entry = Arc::new(BackgroundProcessEntry {
            execution_id: execution_id.clone(),
            process_id: pid,
            command: cmd_str.to_string(),
            cwd: work_dir.to_string_lossy().to_string(),
            started_at: now,
            finished_at: None,
            child: child_arc,
            stdout_buf,
            stderr_buf,
            status,
            exit_code,
            is_cancelled,
        });

        if let Ok(mut lock) = self.processes.write() {
            lock.insert(execution_id.clone(), entry);
        }

        Ok(AiBackgroundProcess {
            process_id: pid,
            execution_id,
            command: cmd_str.to_string(),
            cwd: work_dir.to_string_lossy().to_string(),
            status: AiProcessStatus::Running,
            started_at: now,
            finished_at: None,
            exit_code: None,
        })
    }

    /// Gets current buffered output and status for a background process.
    pub fn get_process_output(&self, execution_id: &str) -> Result<AiProcessOutput, TerminalError> {
        let lock = self.processes.read().unwrap();
        let entry = lock
            .get(execution_id)
            .ok_or_else(|| TerminalError::SessionNotFound(format!("Process {} not found", execution_id)))?;

        let status = entry.status.lock().unwrap().clone();
        let exit_code = *entry.exit_code.lock().unwrap();
        let stdout = String::from_utf8_lossy(&entry.stdout_buf.lock().unwrap()).to_string();
        let stderr = String::from_utf8_lossy(&entry.stderr_buf.lock().unwrap()).to_string();

        Ok(AiProcessOutput {
            execution_id: execution_id.to_string(),
            status,
            exit_code,
            stdout,
            stderr,
        })
    }

    /// Lists all tracked background processes.
    pub fn list_tracked_processes(&self, only_active: bool) -> Vec<AiBackgroundProcess> {
        let lock = self.processes.read().unwrap();
        let mut list = Vec::new();

        for entry in lock.values() {
            let status = entry.status.lock().unwrap().clone();
            if only_active && status != AiProcessStatus::Running {
                continue;
            }

            list.push(AiBackgroundProcess {
                process_id: entry.process_id,
                execution_id: entry.execution_id.clone(),
                command: entry.command.clone(),
                cwd: entry.cwd.clone(),
                status,
                started_at: entry.started_at,
                finished_at: entry.finished_at,
                exit_code: *entry.exit_code.lock().unwrap(),
            });
        }

        list
    }

    /// Terminates a tracked process tree.
    pub fn stop_tracked_process(&self, execution_id: &str) -> Result<(), TerminalError> {
        let entry = {
            let lock = self.processes.read().unwrap();
            lock.get(execution_id)
                .cloned()
                .ok_or_else(|| TerminalError::SessionNotFound(format!("Process {} not found", execution_id)))?
        };

        entry.is_cancelled.store(true, Ordering::Release);
        *entry.status.lock().unwrap() = AiProcessStatus::Killed;

        Self::kill_process_by_pid(entry.process_id);

        if let Ok(mut child_guard) = entry.child.lock() {
            if let Some(mut child) = child_guard.take() {
                let _ = child.kill();
            }
        }

        Ok(())
    }

    /// Terminates all tracked background processes.
    pub fn stop_all(&self) -> Result<(), TerminalError> {
        let ids: Vec<String> = {
            let lock = self.processes.read().unwrap();
            lock.keys().cloned().collect()
        };

        for id in ids {
            let _ = self.stop_tracked_process(&id);
        }

        Ok(())
    }

    fn kill_process_by_pid(pid: u32) {
        #[cfg(windows)]
        {
            let mut kill_cmd = Command::new("taskkill");
            kill_cmd.args(["/pid", &pid.to_string(), "/T", "/F"]);
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            kill_cmd.creation_flags(CREATE_NO_WINDOW);
            let _ = kill_cmd.status();
        }

        #[cfg(not(windows))]
        {
            let mut kill_cmd = Command::new("kill");
            kill_cmd.args(["-9", &pid.to_string()]);
            let _ = kill_cmd.status();
        }
    }
}

impl Default for AiCommandExecutor {
    fn default() -> Self {
        Self::new()
    }
}
