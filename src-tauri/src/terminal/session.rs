use super::error::TerminalError;
use super::shells::{resolve_shell, resolve_working_directory, validate_executable};
use super::types::{SessionStatus, TerminalCreateConfig, TerminalExitPayload, TerminalSessionInfo};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Runtime};
use uuid::Uuid;

pub const DEFAULT_TERMINAL_COLS: u16 = 80;
pub const DEFAULT_TERMINAL_ROWS: u16 = 24;
pub const BUFFER_READ_SIZE: usize = 4096;

pub struct TerminalSession {
    pub session_id: String,
    pub pid: Option<u32>,
    pub shell: String,
    pub args: Vec<String>,
    pub cwd: String,
    pub master: Mutex<Box<dyn MasterPty + Send>>,
    pub writer: Mutex<Box<dyn Write + Send>>,
    pub child: Mutex<Box<dyn Child + Send + Sync>>,
    pub status: Mutex<SessionStatus>,
    pub exit_code: Mutex<Option<i32>>,
    pub cols: AtomicU16,
    pub rows: AtomicU16,
    pub created_at: u64,
    pub is_shutting_down: Arc<AtomicBool>,
}

impl TerminalSession {
    /// Creates and spawns a new PTY terminal session.
    pub fn new<R: Runtime>(
        app: &AppHandle<R>,
        config: TerminalCreateConfig,
        workspace_root: Option<&Path>,
    ) -> Result<Arc<Self>, TerminalError> {
        let session_id = Uuid::new_v4().to_string();

        // 1. Resolve executable and arguments
        let (shell_exec, shell_args) = if let Some(exec) = &config.executable {
            let valid_path = validate_executable(exec)?;
            let args = config.args.unwrap_or_default();
            (valid_path.to_string_lossy().to_string(), args)
        } else {
            let (exec, default_args) = resolve_shell(config.shell_id.as_deref())?;
            let args = config.args.unwrap_or(default_args);
            (exec, args)
        };

        // 2. Resolve working directory
        let cwd_path = resolve_working_directory(config.cwd.as_deref(), workspace_root)?;
        let cwd_str = cwd_path.to_string_lossy().to_string();

        let initial_cols = config.cols.unwrap_or(DEFAULT_TERMINAL_COLS);
        let initial_rows = config.rows.unwrap_or(DEFAULT_TERMINAL_ROWS);

        // 3. Initialize PTY system
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: initial_rows,
                cols: initial_cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| TerminalError::PtySpawnFailed(format!("Failed to open PTY pair: {}", e)))?;

        // 4. Configure command builder
        let mut cmd = CommandBuilder::new(&shell_exec);
        cmd.args(&shell_args);
        cmd.cwd(&cwd_path);

        if let Some(env_vars) = config.env {
            for (key, val) in env_vars {
                cmd.env(key, val);
            }
        }

        // Standard terminal environment hints
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        // 5. Spawn child process into slave PTY
        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| TerminalError::PtySpawnFailed(format!("Failed to spawn child process: {}", e)))?;

        let pid = child.process_id();

        let writer = pair
            .master
            .take_writer()
            .map_err(|e| TerminalError::PtySpawnFailed(format!("Failed to take master PTY writer: {}", e)))?;

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| TerminalError::PtySpawnFailed(format!("Failed to clone master PTY reader: {}", e)))?;

        let created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        let is_shutting_down = Arc::new(AtomicBool::new(false));

        let session = Arc::new(Self {
            session_id: session_id.clone(),
            pid,
            shell: shell_exec,
            args: shell_args,
            cwd: cwd_str,
            master: Mutex::new(pair.master),
            writer: Mutex::new(writer),
            child: Mutex::new(child),
            status: Mutex::new(SessionStatus::Running),
            exit_code: Mutex::new(None),
            cols: AtomicU16::new(initial_cols),
            rows: AtomicU16::new(initial_rows),
            created_at,
            is_shutting_down: Arc::clone(&is_shutting_down),
        });

        // 6. Spawn continuous background reader thread
        let app_handle = app.clone();
        let session_weak = Arc::downgrade(&session);
        let event_data_name = format!("terminal:data:{}", session_id);
        let event_exit_name = format!("terminal:exit:{}", session_id);
        let shutdown_flag = Arc::clone(&is_shutting_down);

        thread::Builder::new()
            .name(format!("kairo-term-reader-{}", &session_id[..8]))
            .spawn(move || {
                let mut buffer = [0u8; BUFFER_READ_SIZE];

                loop {
                    if shutdown_flag.load(Ordering::Acquire) {
                        break;
                    }

                    match reader.read(&mut buffer) {
                        Ok(0) => {
                            // EOF received from PTY master
                            break;
                        }
                        Ok(n) => {
                            let text = String::from_utf8_lossy(&buffer[..n]).to_string();
                            let _ = app_handle.emit(&event_data_name, text);
                        }
                        Err(err) => {
                            if !shutdown_flag.load(Ordering::Acquire) {
                                log::debug!(
                                    "[TerminalSession] PTY reader exited for session {}: {}",
                                    session_id,
                                    err
                                );
                            }
                            break;
                        }
                    }
                }

                // Retrieve exit code if session still exists and not forcefully murdered
                if let Some(session_arc) = session_weak.upgrade() {
                    let mut child_guard = session_arc.child.lock().unwrap();
                    let code = match child_guard.wait() {
                        Ok(status) => status.exit_code() as i32,
                        Err(_) => -1,
                    };

                    *session_arc.status.lock().unwrap() = SessionStatus::Exited;
                    *session_arc.exit_code.lock().unwrap() = Some(code);

                    let exit_payload = TerminalExitPayload {
                        session_id: session_id.clone(),
                        code: Some(code),
                    };

                    let _ = app_handle.emit(&event_exit_name, exit_payload);
                }
            })
            .map_err(|e| TerminalError::PtySpawnFailed(format!("Failed to spawn reader thread: {}", e)))?;

        Ok(session)
    }

    /// Writes raw input data (keystrokes, pastes, control signals) to the PTY master.
    pub fn write(&self, data: &[u8]) -> Result<(), TerminalError> {
        if self.is_shutting_down.load(Ordering::Acquire) {
            return Ok(());
        }

        let mut writer_guard = self
            .writer
            .lock()
            .map_err(|_| TerminalError::PtyWriteFailed("Failed to acquire PTY writer lock".to_string()))?;

        writer_guard
            .write_all(data)
            .map_err(|e| TerminalError::PtyWriteFailed(format!("Failed to write to master PTY: {}", e)))?;

        writer_guard
            .flush()
            .map_err(|e| TerminalError::PtyWriteFailed(format!("Failed to flush master PTY: {}", e)))?;

        Ok(())
    }

    /// Resizes the physical dimensions (cols & rows) of the PTY session.
    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), TerminalError> {
        if cols == 0 || rows == 0 {
            return Ok(());
        }

        let master_guard = self
            .master
            .lock()
            .map_err(|_| TerminalError::PtyResizeFailed("Failed to acquire PTY master lock".to_string()))?;

        master_guard
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| TerminalError::PtyResizeFailed(format!("PTY resize failed: {}", e)))?;

        self.cols.store(cols, Ordering::Release);
        self.rows.store(rows, Ordering::Release);

        Ok(())
    }

    /// Forcefully terminates the process tree and signals shutdown.
    pub fn kill(&self) -> Result<(), TerminalError> {
        self.is_shutting_down.store(true, Ordering::Release);

        let mut child_guard = self
            .child
            .lock()
            .map_err(|_| TerminalError::ProcessKillFailed("Failed to acquire child lock".to_string()))?;

        if let Some(pid) = self.pid {
            #[cfg(windows)]
            {
                let mut kill_cmd = std::process::Command::new("taskkill");
                kill_cmd.args(["/pid", &pid.to_string(), "/T", "/F"]);
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                kill_cmd.creation_flags(CREATE_NO_WINDOW);
                let _ = kill_cmd.status();
            }

            #[cfg(not(windows))]
            {
                let _ = child_guard.kill();
            }
        } else {
            let _ = child_guard.kill();
        }

        *self.status.lock().unwrap() = SessionStatus::Exited;

        Ok(())
    }

    /// Returns a serializable snapshot of the terminal session information.
    pub fn get_info(&self) -> TerminalSessionInfo {
        let status = self.status.lock().unwrap().clone();
        let exit_code = *self.exit_code.lock().unwrap();

        TerminalSessionInfo {
            session_id: self.session_id.clone(),
            pid: self.pid,
            shell: self.shell.clone(),
            args: self.args.clone(),
            cwd: self.cwd.clone(),
            cols: self.cols.load(Ordering::Acquire),
            rows: self.rows.load(Ordering::Acquire),
            status,
            created_at: self.created_at,
            exit_code,
        }
    }
}

impl Drop for TerminalSession {
    fn drop(&mut self) {
        let _ = self.kill();
    }
}
