use super::error::TerminalError;
use super::session::TerminalSession;
use super::types::{TerminalCreateConfig, TerminalSessionInfo};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use tauri::{AppHandle, Runtime};

pub struct TerminalManager {
    sessions: Arc<RwLock<HashMap<String, Arc<TerminalSession>>>>,
    workspace_root: Mutex<Option<PathBuf>>,
}

impl TerminalManager {
    /// Initializes a new thread-safe TerminalManager.
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            workspace_root: Mutex::new(None),
        }
    }

    /// Sets the default workspace root directory for new terminal sessions.
    pub fn set_workspace_root(&self, path: PathBuf) {
        if let Ok(mut lock) = self.workspace_root.lock() {
            *lock = Some(path);
        }
    }

    /// Gets the current workspace root directory.
    pub fn get_workspace_root(&self) -> Option<PathBuf> {
        self.workspace_root.lock().ok().and_then(|guard| guard.clone())
    }

    /// Creates and registers a new terminal session.
    pub fn create_session<R: Runtime>(
        &self,
        app: &AppHandle<R>,
        config: TerminalCreateConfig,
    ) -> Result<TerminalSessionInfo, TerminalError> {
        let ws_root = self.workspace_root.lock().ok().and_then(|guard| guard.clone());

        let session = TerminalSession::new(app, config, ws_root.as_deref())?;
        let info = session.get_info();

        let mut lock = self
            .sessions
            .write()
            .map_err(|_| TerminalError::PtySpawnFailed("Failed to acquire sessions write lock".to_string()))?;

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
    pub fn resize_session(&self, session_id: &str, cols: u16, rows: u16) -> Result<(), TerminalError> {
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

    /// Returns a list of all currently tracked terminal sessions.
    pub fn list_sessions(&self) -> Vec<TerminalSessionInfo> {
        if let Ok(lock) = self.sessions.read() {
            lock.values().map(|s| s.get_info()).collect()
        } else {
            Vec::new()
        }
    }

    /// Retrieves session information for a specific session ID.
    pub fn get_session(&self, session_id: &str) -> Result<TerminalSessionInfo, TerminalError> {
        let lock = self
            .sessions
            .read()
            .map_err(|_| TerminalError::SessionNotFound(session_id.to_string()))?;

        let session = lock
            .get(session_id)
            .ok_or_else(|| TerminalError::SessionNotFound(session_id.to_string()))?;

        Ok(session.get_info())
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
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}
