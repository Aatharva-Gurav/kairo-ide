use std::fmt;

/// Structured error type for native filesystem security and workspace boundary enforcement.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FsSecurityError {
    NoActiveWorkspace,
    StaleWorkspaceToken,
    PathOutsideWorkspace(String),
    TraversalDetected(String),
    UnsupportedPathFormat(String),
    SymlinkOrJunctionBlocked(String),
    SensitivePathBlocked(String),
    WorkspaceRootMutationBlocked(String),
    InvalidWorkspaceRoot(String),
    NotFound(String),
    AlreadyExists(String),
    InvalidOperation(String),
    Io(String),
}

impl fmt::Display for FsSecurityError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoActiveWorkspace => write!(
                f,
                "Access denied: no active workspace is open. Open a workspace folder first."
            ),
            Self::StaleWorkspaceToken => write!(
                f,
                "Operation cancelled: active workspace changed or was closed."
            ),
            Self::PathOutsideWorkspace(path) => write!(
                f,
                "Access denied: path is outside the authorized workspace boundary ({}).",
                path
            ),
            Self::TraversalDetected(path) => write!(
                f,
                "Invalid path: directory traversal ('..') is not permitted ({}).",
                path
            ),
            Self::UnsupportedPathFormat(reason) => {
                write!(f, "Invalid path format: {}", reason)
            }
            Self::SymlinkOrJunctionBlocked(path) => write!(
                f,
                "Access denied: symlinks and junctions are not permitted ({}).",
                path
            ),
            Self::SensitivePathBlocked(path) => write!(
                f,
                "Access denied: '{}' is a protected sensitive file or credential path.",
                path
            ),
            Self::WorkspaceRootMutationBlocked(path) => write!(
                f,
                "Operation denied: cannot rename, move, or delete the active workspace root ({}).",
                path
            ),
            Self::InvalidWorkspaceRoot(reason) => {
                write!(f, "Invalid workspace root: {}", reason)
            }
            Self::NotFound(msg) => write!(f, "{}", msg),
            Self::AlreadyExists(msg) => write!(f, "{}", msg),
            Self::InvalidOperation(msg) => write!(f, "{}", msg),
            Self::Io(msg) => write!(f, "{}", msg),
        }
    }
}

impl std::error::Error for FsSecurityError {}

impl From<FsSecurityError> for String {
    fn from(err: FsSecurityError) -> Self {
        err.to_string()
    }
}

impl From<std::io::Error> for FsSecurityError {
    fn from(err: std::io::Error) -> Self {
        match err.kind() {
            std::io::ErrorKind::NotFound => Self::NotFound(format!("Path does not exist: {}", err)),
            std::io::ErrorKind::AlreadyExists => {
                Self::AlreadyExists(format!("A file or directory already exists: {}", err))
            }
            std::io::ErrorKind::PermissionDenied => Self::Io(format!("Permission denied: {}", err)),
            _ => Self::Io(err.to_string()),
        }
    }
}
