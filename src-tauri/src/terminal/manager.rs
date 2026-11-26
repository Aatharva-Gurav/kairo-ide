use super::error::TerminalError;
use super::session::TerminalSession;
use super::shells::{
    resolve_working_directory_with_guard, sanitize_env_vars, validate_shell_args,
    validate_shell_executable,
};
use super::types::{ShellProfile, TerminalCreateConfig, TerminalSessionInfo};
use crate::security::WorkspaceGuard;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Runtime};

pub struct TerminalManager {
    sessions: Arc<RwLock<HashMap<String, Arc<TerminalSession>>>>,
    custom_profiles: RwLock<HashMap<String, ShellProfile>>,
    workspace_root: Mutex<Option<PathBuf>>,
}

impl TerminalManager {
    /// Initializes a new thread-safe TerminalManager.
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            custom_profiles: RwLock::new(HashMap::new()),
            workspace_root: Mutex::new(None),
        }
    }

    /// Sets the default workspace root directory for new terminal sessions.
    pub fn set_workspace_root(&self, path: PathBuf) {
        if let Ok(mut lock) = self.workspace_root.lock() {
            *lock = Some(path);
        }
    }

    /// Clears the workspace root directory when a workspace is closed.
    pub fn clear_workspace_root(&self) {
        if let Ok(mut lock) = self.workspace_root.lock() {
            *lock = None;
        }
    }

    /// Gets the current workspace root directory.
    pub fn get_workspace_root(&self) -> Option<PathBuf> {
        self.workspace_root
            .lock()
            .ok()
            .and_then(|guard| guard.clone())
    }

    /// Validates and registers user-saved custom shell profiles in Rust memory.
    /// Invalid profiles are rejected cleanly with a structured error.
    pub fn sync_custom_profiles(
        &self,
        profiles: Vec<ShellProfile>,
        workspace_guard: Option<&WorkspaceGuard>,
    ) -> Result<Vec<ShellProfile>, TerminalError> {
        if profiles.len() > 32 {
            return Err(TerminalError::InvalidProfile(
                "Too many custom shell profiles (maximum 32).".to_string(),
            ));
        }

        let mut validated_map = HashMap::with_capacity(profiles.len());
        let mut validated_list = Vec::with_capacity(profiles.len());

        for mut profile in profiles {
            let id = profile.id.trim().to_string();
            if id.is_empty()
                || id.len() > 64
                || !id
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            {
                return Err(TerminalError::InvalidProfile(format!(
                    "Invalid custom shell profile id: '{}'",
                    profile.id
                )));
            }
            if profile.name.trim().is_empty() || profile.name.len() > 64 {
                return Err(TerminalError::InvalidProfile(
                    "Custom shell profile name cannot be empty or exceed 64 characters."
                        .to_string(),
                ));
            }

            let valid_exec = validate_shell_executable(&profile.executable, workspace_guard)?;
            profile.executable = WorkspaceGuard::display_path(&valid_exec);

            if let Some(ref args) = profile.args {
                let valid_args = validate_shell_args(args)?;
                profile.args = Some(valid_args);
            }

            if let Some(ref env_map) = profile.env {
                let _ = sanitize_env_vars(env_map)?;
            }

            if let Some(ref cwd) = profile.cwd {
                if !cwd.trim().is_empty() {
                    let _ = resolve_working_directory_with_guard(Some(cwd), None, workspace_guard)?;
                }
            }

            profile.id = id.clone();
            profile.is_custom = Some(true);
            validated_list.push(profile.clone());
            validated_map.insert(id, profile);
        }

        let mut lock = self.custom_profiles.write().map_err(|_| {
            TerminalError::InvalidProfile(
                "Failed to acquire custom profiles write lock".to_string(),
            )
        })?;
        *lock = validated_map;

        Ok(validated_list)
    }

    /// Looks up a previously validated custom shell profile by ID.
    pub fn get_custom_profile(&self, id: &str) -> Option<ShellProfile> {
        self.custom_profiles
            .read()
            .ok()
            .and_then(|lock| lock.get(id).cloned())
    }

    /// Creates and registers a new terminal session using discovered or registered profiles.
    pub fn create_session<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        config: TerminalCreateConfig,
        workspace_guard: Option<&WorkspaceGuard>,
    ) -> Result<TerminalSessionInfo, TerminalError> {
        let ws_root = self
            .workspace_root
            .lock()
            .ok()
            .and_then(|guard| guard.clone());

        let custom_profile = config
            .shell_id
            .as_deref()
            .and_then(|id| self.get_custom_profile(id));

        let session = TerminalSession::new(
            app,
            config,
            ws_root.as_deref(),
            workspace_guard,
            custom_profile.as_ref(),
        )?;
        let info = session.get_info()?;

        let mut lock = self.sessions.write().map_err(|_| {
            TerminalError::LockPoisoned("Failed to acquire sessions write lock".to_string())
        })?;

        lock.insert(session.session_id.clone(), session);

        Ok(info)
    }

    /// Sends input data to an active terminal session.
    pub fn write_session(&self, session_id: &str, data: &[u8]) -> Result<(), TerminalError> {
        let session = {
            let lock = self
                .sessions
                .read()
                .map_err(|_| TerminalError::SessionNotFound(session_id.to_string()))?;

            lock.get(session_id)
                .cloned()
                .ok_or_else(|| TerminalError::SessionNotFound(session_id.to_string()))?
        };

        session.write(data)
    }

    /// Resizes the physical dimensions of a terminal session.
    pub fn resize_session(
        &self,
        session_id: &str,
        cols: u16,
        rows: u16,
    ) -> Result<(), TerminalError> {
        let session = {
            let lock = self
                .sessions
                .read()
                .map_err(|_| TerminalError::SessionNotFound(session_id.to_string()))?;

            lock.get(session_id)
                .cloned()
                .ok_or_else(|| TerminalError::SessionNotFound(session_id.to_string()))?
        };

        session.resize(cols, rows)
    }

    /// Terminates a specific terminal session and removes it from the manager.
    pub fn kill_session(&self, session_id: &str) -> Result<(), TerminalError> {
        let session = {
            let mut lock = self
                .sessions
                .write()
                .map_err(|_| TerminalError::SessionNotFound(session_id.to_string()))?;

            lock.remove(session_id)
                .ok_or_else(|| TerminalError::SessionNotFound(session_id.to_string()))?
        };

        session.kill()
    }

    /// Returns a list of all currently tracked terminal sessions, propagating any poisoned lock errors.
    pub fn try_list_sessions(&self) -> Result<Vec<TerminalSessionInfo>, TerminalError> {
        let lock = self.sessions.read().map_err(|_| {
            TerminalError::LockPoisoned("Failed to acquire sessions read lock".to_string())
        })?;
        let mut results = Vec::with_capacity(lock.len());
        for session in lock.values() {
            results.push(session.get_info()?);
        }
        Ok(results)
    }

    /// Returns a list of all currently tracked terminal sessions, skipping any corrupted entries cleanly.
    pub fn list_sessions(&self) -> Vec<TerminalSessionInfo> {
        if let Ok(lock) = self.sessions.read() {
            lock.values()
                .filter_map(|s| match s.get_info() {
                    Ok(info) => Some(info),
                    Err(err) => {
                        log::warn!("[TerminalManager] Skipping corrupted session info: {}", err);
                        None
                    }
                })
                .collect()
        } else {
            Vec::new()
        }
    }

    /// Retrieves session information for a specific session ID.
    pub fn get_session(&self, session_id: &str) -> Result<TerminalSessionInfo, TerminalError> {
        let lock = self.sessions.read().map_err(|_| {
            TerminalError::LockPoisoned("Failed to acquire sessions read lock".to_string())
        })?;

        let session = lock
            .get(session_id)
            .ok_or_else(|| TerminalError::SessionNotFound(session_id.to_string()))?;

        session.get_info()
    }

    /// Kills all active terminal sessions associated with a specific workspace ID,
    /// or all sessions if workspace_id is None.
    pub fn kill_workspace_sessions(
        &self,
        workspace_id: Option<&str>,
    ) -> Result<usize, TerminalError> {
        let targets: Vec<Arc<TerminalSession>> = {
            if let Ok(mut lock) = self.sessions.write() {
                let to_remove: Vec<String> = lock
                    .iter()
                    .filter(|(_, session)| match workspace_id {
                        Some(ws_id) => session.workspace_id.as_deref() == Some(ws_id),
                        None => true,
                    })
                    .map(|(id, _)| id.clone())
                    .collect();

                to_remove
                    .into_iter()
                    .filter_map(|id| lock.remove(&id))
                    .collect()
            } else {
                Vec::new()
            }
        };

        let count = targets.len();
        for session in targets {
            let _ = session.kill();
        }

        Ok(count)
    }

    /// Kills all active terminal sessions on application or window shutdown.
    pub fn kill_all(&self) -> Result<(), TerminalError> {
        let sessions: Vec<Arc<TerminalSession>> = {
            if let Ok(mut lock) = self.sessions.write() {
                lock.drain().map(|(_, session)| session).collect()
            } else {
                Vec::new()
            }
        };

        for session in sessions {
            let _ = session.kill();
        }

        Ok(())
    }

    #[cfg(test)]
    pub(crate) fn insert_session_for_test(&self, session: Arc<TerminalSession>) {
        if let Ok(mut lock) = self.sessions.write() {
            lock.insert(session.session_id.clone(), session);
        }
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}
