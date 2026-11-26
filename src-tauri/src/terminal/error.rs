use std::fmt;

#[derive(Debug)]
pub enum TerminalError {
    SessionNotFound(String),
    ShellNotFound(String),
    UnauthorizedExecutable(String),
    InvalidArguments(String),
    BlockedEnvironmentVariable(String),
    InvalidProfile(String),
    InvalidWorkingDirectory(String),
    PtySpawnFailed(String),
    PtyWriteFailed(String),
    PtyResizeFailed(String),
    ProcessKillFailed(String),
    LockPoisoned(String),
    Io(std::io::Error),
}

impl fmt::Display for TerminalError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::SessionNotFound(id) => write!(f, "Terminal session not found: {}", id),
            Self::ShellNotFound(shell) => write!(f, "Shell executable not found: {}", shell),
            Self::UnauthorizedExecutable(reason) => {
                write!(f, "Unauthorized terminal executable: {}", reason)
            }
            Self::InvalidArguments(reason) => {
                write!(f, "Invalid terminal shell arguments: {}", reason)
            }
            Self::BlockedEnvironmentVariable(key) => {
                write!(
                    f,
                    "Blocked or invalid terminal environment variable: {}",
                    key
                )
            }
            Self::InvalidProfile(reason) => write!(f, "Invalid terminal profile: {}", reason),
            Self::InvalidWorkingDirectory(path) => {
                write!(f, "Invalid or non-existent working directory: {}", path)
            }
            Self::PtySpawnFailed(err) => write!(f, "Failed to spawn PTY session: {}", err),
            Self::PtyWriteFailed(err) => write!(f, "Failed to write to PTY: {}", err),
            Self::PtyResizeFailed(err) => write!(f, "Failed to resize PTY: {}", err),
            Self::ProcessKillFailed(err) => write!(f, "Failed to terminate process: {}", err),
            Self::LockPoisoned(reason) => {
                write!(f, "Terminal internal state lock poisoned: {}", reason)
            }
            Self::Io(err) => write!(f, "Terminal I/O error: {}", err),
        }
    }
}

impl std::error::Error for TerminalError {}

impl From<std::io::Error> for TerminalError {
    fn from(err: std::io::Error) -> Self {
        Self::Io(err)
    }
}

impl From<TerminalError> for String {
    fn from(err: TerminalError) -> Self {
        err.to_string()
    }
}
