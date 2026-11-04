pub mod commands;
pub mod error;
pub mod manager;
pub mod session;
pub mod shells;
pub mod types;

#[cfg(test)]
mod tests;

pub use commands::*;
pub use error::TerminalError;
pub use manager::TerminalManager;
pub use session::TerminalSession;
pub use shells::{detect_shells, resolve_shell, resolve_working_directory};
pub use types::*;

/// Architectural interface reserved for future Cline AI execution integration.
/// Separates controlled AI tool execution from interactive user terminal PTY sessions.
pub trait NonInteractiveCommandExecutor: Send + Sync {
    fn execute_sandboxed_command(
        &self,
        command: &str,
        cwd: Option<&std::path::Path>,
        timeout_ms: Option<u64>,
    ) -> Result<(i32, String, String), TerminalError>;
}
