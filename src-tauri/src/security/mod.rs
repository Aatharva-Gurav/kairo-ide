pub mod asset_protocol;
pub mod error;
pub mod sensitive;
pub mod workspace_guard;

#[cfg(test)]
mod tests;

pub use error::FsSecurityError;
pub use sensitive::SensitivePathPolicy;
pub use workspace_guard::{WorkspaceAuthInfo, WorkspaceGuard, WorkspaceSnapshot};
