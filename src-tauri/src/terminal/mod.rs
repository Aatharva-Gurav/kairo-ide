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
pub use shells::{detect_shells, resolve_shell, resolve_working_directory, validate_executable};
pub use types::*;
