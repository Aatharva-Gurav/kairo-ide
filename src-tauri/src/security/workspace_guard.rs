use super::error::FsSecurityError;
use super::sensitive::SensitivePathPolicy;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceAuthInfo {
    pub root_path: String,
    pub roots: Vec<String>,
    pub workspace_id: Option<String>,
    pub generation: u64,
}

#[derive(Debug, Clone)]
pub struct WorkspaceSnapshot {
    pub authorized_roots: Vec<PathBuf>,
    pub single_file_grants: HashSet<PathBuf>,
    pub workspace_id: Option<String>,
    pub generation: u64,
}

#[derive(Debug, Default)]
struct WorkspaceState {
    authorized_roots: Vec<PathBuf>,
    single_file_grants: HashSet<PathBuf>,
    workspace_id: Option<String>,
    generation: u64,
}

/// Centralized native workspace boundary and security guard.
/// Tracks authorized workspace roots in Rust memory and validates every
/// filesystem operation against traversal, symlink/junction escapes,
/// sensitive files, and stale workspace generations.
#[derive(Debug, Default)]
pub struct WorkspaceGuard {
    state: RwLock<WorkspaceState>,
}

impl WorkspaceGuard {
    pub fn new() -> Self {
        Self {
            state: RwLock::new(WorkspaceState::default()),
        }
    }

    /// Strips Windows `\\?\` verbatim prefix for clean comparison and UI display.
    pub fn strip_verbatim_prefix(p: &Path) -> PathBuf {
        let s = p.to_string_lossy();
        if let Some(stripped) = s.strip_prefix(r"\\?\") {
            PathBuf::from(stripped)
        } else {
            p.to_path_buf()
        }
    }

    /// Normalizes path display string (removes `\\?\` prefix).
    pub fn display_path(p: &Path) -> String {
        Self::strip_verbatim_prefix(p).to_string_lossy().to_string()
    }

    /// Compares two paths component-by-component (case-insensitive on Windows).
    pub fn paths_equal(a: &Path, b: &Path) -> bool {
        let a_clean = Self::strip_verbatim_prefix(a);
        let b_clean = Self::strip_verbatim_prefix(b);
        let mut ac = a_clean.components();
        let mut bc = b_clean.components();
        loop {
            match (ac.next(), bc.next()) {
                (None, None) => return true,
                (Some(ca), Some(cb)) => {
                    if !Self::components_equal(&ca, &cb) {
                        return false;
                    }
                }
                _ => return false,
            }
        }
    }

    /// Checks whether `child` is equal to or a strict descendant of `parent`
    /// using path components (case-insensitive on Windows).
    pub fn is_path_within(parent: &Path, child: &Path) -> bool {
        let parent_clean = Self::strip_verbatim_prefix(parent);
        let child_clean = Self::strip_verbatim_prefix(child);

        let mut pc = parent_clean.components();
        let mut cc = child_clean.components();
        loop {
            match pc.next() {
                None => return true,
                Some(p_comp) => match cc.next() {
                    None => return false,
                    Some(c_comp) => {
                        if !Self::components_equal(&p_comp, &c_comp) {
                            return false;
                        }
                    }
                },
            }
        }
    }

    fn components_equal(a: &Component<'_>, b: &Component<'_>) -> bool {
        #[cfg(windows)]
        {
            a.as_os_str()
                .to_string_lossy()
                .eq_ignore_ascii_case(&b.as_os_str().to_string_lossy())
        }
        #[cfg(not(windows))]
        {
            a == b
        }
    }

    /// Performs strict lexical checks on raw user/IPC-supplied path strings before
    /// touching the filesystem.
    pub fn lexical_check(raw: &str) -> Result<PathBuf, FsSecurityError> {
        if raw.trim().is_empty() {
            return Err(FsSecurityError::UnsupportedPathFormat(
                "Path cannot be empty.".to_string(),
            ));
        }
        if raw.contains('\0') {
            return Err(FsSecurityError::UnsupportedPathFormat(
                "Path contains null byte.".to_string(),
            ));
        }
        if raw.chars().any(|c| c.is_control()) {
            return Err(FsSecurityError::UnsupportedPathFormat(
                "Path contains control characters.".to_string(),
            ));
        }

        // Reject Windows UNC paths, verbatim prefixes, device namespace, and NT paths
        if raw.starts_with(r"\\") || raw.starts_with("//") || raw.starts_with(r"\??\") {
            return Err(FsSecurityError::UnsupportedPathFormat(format!(
                "UNC and device namespace paths are not permitted: {}",
                raw
            )));
        }

        // Reject explicit traversal segments regardless of OS separator
        for seg in raw.split(['/', '\\']) {
            if seg == ".." {
                return Err(FsSecurityError::TraversalDetected(raw.to_string()));
            }
        }

        let path = Path::new(raw);

        if !path.is_absolute() {
            return Err(FsSecurityError::UnsupportedPathFormat(format!(
                "Relative paths are not permitted: {}",
                raw
            )));
        }

        #[cfg(windows)]
        {
            let mut comps = path.components();
            match (comps.next(), comps.next()) {
                (Some(Component::Prefix(_)), Some(Component::RootDir)) => {}
                _ => {
                    return Err(FsSecurityError::UnsupportedPathFormat(format!(
                        "Windows path must include a drive letter and root separator: {}",
                        raw
                    )));
                }
            }
        }

        let mut seen_prefix_or_root = false;
        for comp in path.components() {
            match comp {
                Component::Prefix(_) | Component::RootDir => {
                    seen_prefix_or_root = true;
                }
                Component::ParentDir => {
                    return Err(FsSecurityError::TraversalDetected(raw.to_string()));
                }
                Component::CurDir => {
                    return Err(FsSecurityError::TraversalDetected(raw.to_string()));
                }
                Component::Normal(os) => {
                    let s = os.to_string_lossy();
                    #[cfg(windows)]
                    {
                        if seen_prefix_or_root && s.contains(':') {
                            return Err(FsSecurityError::UnsupportedPathFormat(format!(
                                "Alternate data streams or embedded colons are not permitted: {}",
                                raw
                            )));
                        }
                        if s.ends_with('.') || s.ends_with(' ') {
                            return Err(FsSecurityError::UnsupportedPathFormat(format!(
                                "Trailing dots or spaces in path segments are not permitted: {}",
                                raw
                            )));
                        }
                    }
                    let _ = seen_prefix_or_root;
                }
            }
        }

        Ok(path.to_path_buf())
    }

    /// Returns `true` if the path entry itself is a symlink or Windows junction/reparse link.
    pub fn is_symlink_or_junction(path: &Path) -> Result<bool, FsSecurityError> {
        let meta = fs::symlink_metadata(path)?;
        if meta.file_type().is_symlink() {
            return Ok(true);
        }

        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
            if (meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT) != 0 {
                // Verify whether it resolves as a link/junction
                if fs::read_link(path).is_ok() {
                    return Ok(true);
                }
                // Treat directory reparse points as blocked junctions
                if meta.is_dir() {
                    return Ok(true);
                }
            }
        }

        Ok(false)
    }

    /// Walks from the authorized `root` down through `existing_path`, verifying that
    /// no segment at or below `root` is a symlink or junction, and confirms
    /// `fs::canonicalize(existing_path)` stays within `root`.
    /// Handles Windows 8.3 short paths (e.g. `AATHAR~1`) and OS-level parent aliases.
    fn verify_no_symlinks_between(
        root: &Path,
        existing_path: &Path,
    ) -> Result<PathBuf, FsSecurityError> {
        let root_clean = Self::strip_verbatim_prefix(root);
        let existing_clean = Self::strip_verbatim_prefix(existing_path);

        let mut cursor = PathBuf::new();
        let mut reached_root = false;

        for comp in existing_clean.components() {
            cursor.push(comp);
            if !matches!(comp, Component::Normal(_)) {
                continue;
            }

            if !reached_root {
                if let Ok(canon_cursor) = fs::canonicalize(&cursor) {
                    let canon_clean = Self::strip_verbatim_prefix(&canon_cursor);
                    if Self::paths_equal(&canon_clean, &root_clean) {
                        if Self::is_symlink_or_junction(&cursor)? {
                            return Err(FsSecurityError::SymlinkOrJunctionBlocked(
                                cursor.to_string_lossy().to_string(),
                            ));
                        }
                        reached_root = true;
                    }
                }
            } else if Self::is_symlink_or_junction(&cursor)? {
                return Err(FsSecurityError::SymlinkOrJunctionBlocked(
                    cursor.to_string_lossy().to_string(),
                ));
            }
        }

        if !reached_root {
            return Err(FsSecurityError::PathOutsideWorkspace(
                existing_clean.to_string_lossy().to_string(),
            ));
        }

        let canonical = Self::strip_verbatim_prefix(&fs::canonicalize(&existing_clean)?);
        if !Self::is_path_within(&root_clean, &canonical) {
            return Err(FsSecurityError::PathOutsideWorkspace(
                canonical.to_string_lossy().to_string(),
            ));
        }

        Ok(canonical)
    }

    /// Checks whether a candidate workspace root is a dangerous OS/system directory
    /// or a protected credential container.
    fn is_forbidden_workspace_root(canonical_root: &Path) -> bool {
        let clean = Self::strip_verbatim_prefix(canonical_root);
        let comps: Vec<Component<'_>> = clean.components().collect();

        // Reject filesystem root (`/` or `C:\`)
        let non_prefix_count = comps
            .iter()
            .filter(|c| !matches!(c, Component::Prefix(_) | Component::RootDir))
            .count();
        if non_prefix_count == 0 {
            return true;
        }

        if SensitivePathPolicy::is_sensitive(&clean) {
            return true;
        }

        let lower = clean.to_string_lossy().replace('\\', "/").to_lowercase();

        #[cfg(windows)]
        {
            let trimmed = lower.trim_end_matches('/');
            // Block Windows OS and program directories
            if trimmed.len() >= 3 && trimmed.as_bytes()[1] == b':' {
                let after_drive = &trimmed[2..];
                if matches!(
                    after_drive,
                    "/windows" | "/program files" | "/program files (x86)" | "/programdata"
                ) || after_drive.starts_with("/windows/")
                {
                    return true;
                }
            }
        }

        #[cfg(not(windows))]
        {
            let trimmed = lower.trim_end_matches('/');
            if matches!(
                trimmed,
                "/bin"
                    | "/boot"
                    | "/dev"
                    | "/etc"
                    | "/lib"
                    | "/lib64"
                    | "/proc"
                    | "/root"
                    | "/run"
                    | "/sbin"
                    | "/sys"
                    | "/usr"
                    | "/var"
                    | "/system"
            ) || trimmed.starts_with("/etc/")
                || trimmed.starts_with("/proc/")
                || trimmed.starts_with("/sys/")
                || trimmed.starts_with("/dev/")
                || trimmed.starts_with("/system/")
            {
                return true;
            }
        }

        false
    }

    /// Validates a candidate workspace root directory before authorizing it.
    pub fn validate_workspace_root_candidate(raw: &str) -> Result<PathBuf, FsSecurityError> {
        let path = Self::lexical_check(raw)?;

        let meta = fs::symlink_metadata(&path).map_err(|_| {
            FsSecurityError::InvalidWorkspaceRoot(format!("Directory does not exist: {}", raw))
        })?;

        if Self::is_symlink_or_junction(&path)? {
            return Err(FsSecurityError::SymlinkOrJunctionBlocked(raw.to_string()));
        }

        if !meta.is_dir() {
            return Err(FsSecurityError::InvalidWorkspaceRoot(format!(
                "Path is not a directory: {}",
                raw
            )));
        }

        let canonical = Self::strip_verbatim_prefix(&fs::canonicalize(&path)?);
        if Self::is_forbidden_workspace_root(&canonical) {
            return Err(FsSecurityError::InvalidWorkspaceRoot(format!(
                "System or protected directories cannot be opened as a workspace: {}",
                raw
            )));
        }

        Ok(canonical)
    }

    /// Opens or switches the active workspace root in Rust.
    /// If validation fails, clears any prior authorization so no partial or stale state remains.
    pub fn open_workspace(
        &self,
        root_path: &str,
        workspace_id: Option<String>,
    ) -> Result<WorkspaceAuthInfo, FsSecurityError> {
        let canonical = match Self::validate_workspace_root_candidate(root_path) {
            Ok(c) => c,
            Err(e) => {
                self.close_workspace();
                return Err(e);
            }
        };

        let mut guard = self
            .state
            .write()
            .map_err(|_| FsSecurityError::Io("Workspace guard lock poisoned.".to_string()))?;

        guard.authorized_roots = vec![canonical.clone()];
        guard.single_file_grants.clear();
        guard.workspace_id = workspace_id.clone();
        guard.generation = guard.generation.saturating_add(1);

        Ok(WorkspaceAuthInfo {
            root_path: Self::display_path(&canonical),
            roots: vec![Self::display_path(&canonical)],
            workspace_id,
            generation: guard.generation,
        })
    }

    /// Adds an additional authorized root folder to an open multi-root workspace.
    pub fn add_root(&self, root_path: &str) -> Result<WorkspaceAuthInfo, FsSecurityError> {
        let canonical = Self::validate_workspace_root_candidate(root_path)?;

        let mut guard = self
            .state
            .write()
            .map_err(|_| FsSecurityError::Io("Workspace guard lock poisoned.".to_string()))?;

        if guard.authorized_roots.is_empty() {
            return Err(FsSecurityError::NoActiveWorkspace);
        }

        if !guard
            .authorized_roots
            .iter()
            .any(|r| Self::paths_equal(r, &canonical))
        {
            guard.authorized_roots.push(canonical);
            guard.generation = guard.generation.saturating_add(1);
        }

        let primary = guard
            .authorized_roots
            .first()
            .map(|p| Self::display_path(p))
            .unwrap_or_default();
        let roots = guard
            .authorized_roots
            .iter()
            .map(|p| Self::display_path(p))
            .collect();

        Ok(WorkspaceAuthInfo {
            root_path: primary,
            roots,
            workspace_id: guard.workspace_id.clone(),
            generation: guard.generation,
        })
    }

    /// Removes an authorized root folder from a multi-root workspace (retains at least 1 root).
    pub fn remove_root(&self, root_path: &str) -> Result<WorkspaceAuthInfo, FsSecurityError> {
        let parsed = Self::lexical_check(root_path)?;
        let target_cmp = fs::canonicalize(&parsed)
            .map(|c| Self::strip_verbatim_prefix(&c))
            .unwrap_or(parsed);

        let mut guard = self
            .state
            .write()
            .map_err(|_| FsSecurityError::Io("Workspace guard lock poisoned.".to_string()))?;

        if guard.authorized_roots.is_empty() {
            return Err(FsSecurityError::NoActiveWorkspace);
        }

        if guard.authorized_roots.len() <= 1 {
            return Err(FsSecurityError::InvalidOperation(
                "Cannot remove the last remaining workspace root.".to_string(),
            ));
        }

        let before = guard.authorized_roots.len();
        guard
            .authorized_roots
            .retain(|r| !Self::paths_equal(r, &target_cmp));

        if guard.authorized_roots.len() != before {
            guard.generation = guard.generation.saturating_add(1);
        }

        let primary = guard
            .authorized_roots
            .first()
            .map(|p| Self::display_path(p))
            .unwrap_or_default();
        let roots = guard
            .authorized_roots
            .iter()
            .map(|p| Self::display_path(p))
            .collect();

        Ok(WorkspaceAuthInfo {
            root_path: primary,
            roots,
            workspace_id: guard.workspace_id.clone(),
            generation: guard.generation,
        })
    }

    /// Clears all workspace and single-file authorizations, cancelling any in-flight operations.
    pub fn close_workspace(&self) -> u64 {
        if let Ok(mut guard) = self.state.write() {
            guard.authorized_roots.clear();
            guard.single_file_grants.clear();
            guard.workspace_id = None;
            guard.generation = guard.generation.saturating_add(1);
            guard.generation
        } else {
            0
        }
    }

    /// Registers a single non-sensitive, non-symlink file explicitly picked via native OS dialog.
    pub fn grant_picked_file(&self, raw: &str) -> Result<PathBuf, FsSecurityError> {
        let path = Self::lexical_check(raw)?;
        let meta = fs::symlink_metadata(&path)?;
        if Self::is_symlink_or_junction(&path)? {
            return Err(FsSecurityError::SymlinkOrJunctionBlocked(raw.to_string()));
        }
        if !meta.is_file() {
            return Err(FsSecurityError::InvalidOperation(format!(
                "Selected path is not a regular file: {}",
                raw
            )));
        }

        Self::verify_no_symlinks_on_ancestors(&path)?;
        let canonical = Self::strip_verbatim_prefix(&fs::canonicalize(&path)?);
        Self::verify_no_symlinks_on_ancestors(&canonical)?;
        if SensitivePathPolicy::is_sensitive(&canonical) || SensitivePathPolicy::is_sensitive(&path)
        {
            return Err(FsSecurityError::SensitivePathBlocked(raw.to_string()));
        }

        let mut guard = self
            .state
            .write()
            .map_err(|_| FsSecurityError::Io("Workspace guard lock poisoned.".to_string()))?;
        guard.single_file_grants.insert(canonical.clone());
        Ok(canonical)
    }

    /// Registers a single non-sensitive target file chosen via native OS "Save As" dialog.
    pub fn grant_save_as_target(&self, raw: &str) -> Result<PathBuf, FsSecurityError> {
        let path = Self::lexical_check(raw)?;
        if SensitivePathPolicy::is_sensitive(&path) {
            return Err(FsSecurityError::SensitivePathBlocked(raw.to_string()));
        }

        let target = Self::resolve_non_existing_target_without_root(&path)?;
        if SensitivePathPolicy::is_sensitive(&target) {
            return Err(FsSecurityError::SensitivePathBlocked(raw.to_string()));
        }

        let mut guard = self
            .state
            .write()
            .map_err(|_| FsSecurityError::Io("Workspace guard lock poisoned.".to_string()))?;
        guard.single_file_grants.insert(target.clone());
        Ok(target)
    }

    fn verify_no_symlinks_on_ancestors(canonical: &Path) -> Result<(), FsSecurityError> {
        let mut cursor = PathBuf::new();
        for comp in canonical.components() {
            cursor.push(comp);
            if matches!(comp, Component::Normal(_)) && Self::is_symlink_or_junction(&cursor)? {
                return Err(FsSecurityError::SymlinkOrJunctionBlocked(
                    cursor.to_string_lossy().to_string(),
                ));
            }
        }
        Ok(())
    }

    fn resolve_non_existing_target_without_root(path: &Path) -> Result<PathBuf, FsSecurityError> {
        let mut missing_rev: Vec<Component<'_>> = Vec::new();
        let mut curr = path;
        loop {
            match fs::symlink_metadata(curr) {
                Ok(_) => {
                    if Self::is_symlink_or_junction(curr)? {
                        return Err(FsSecurityError::SymlinkOrJunctionBlocked(
                            curr.to_string_lossy().to_string(),
                        ));
                    }
                    let canonical_ancestor = Self::strip_verbatim_prefix(&fs::canonicalize(curr)?);
                    if Self::is_forbidden_workspace_root(&canonical_ancestor) {
                        return Err(FsSecurityError::PathOutsideWorkspace(
                            path.to_string_lossy().to_string(),
                        ));
                    }
                    Self::verify_no_symlinks_on_ancestors(&canonical_ancestor)?;
                    let mut final_path = canonical_ancestor;
                    for comp in missing_rev.into_iter().rev() {
                        final_path.push(comp);
                    }
                    return Ok(final_path);
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    let parent = curr.parent().ok_or_else(|| {
                        FsSecurityError::UnsupportedPathFormat(path.to_string_lossy().to_string())
                    })?;
                    let leaf = curr.components().next_back().ok_or_else(|| {
                        FsSecurityError::UnsupportedPathFormat(path.to_string_lossy().to_string())
                    })?;
                    if !matches!(leaf, Component::Normal(_)) {
                        return Err(FsSecurityError::TraversalDetected(
                            path.to_string_lossy().to_string(),
                        ));
                    }
                    missing_rev.push(leaf);
                    curr = parent;
                }
                Err(e) => return Err(e.into()),
            }
        }
    }

    /// Captures a consistent snapshot of the current workspace authorization state.
    pub fn snapshot(&self) -> Result<WorkspaceSnapshot, FsSecurityError> {
        let guard = self
            .state
            .read()
            .map_err(|_| FsSecurityError::Io("Workspace guard lock poisoned.".to_string()))?;

        Ok(WorkspaceSnapshot {
            authorized_roots: guard.authorized_roots.clone(),
            single_file_grants: guard.single_file_grants.clone(),
            workspace_id: guard.workspace_id.clone(),
            generation: guard.generation,
        })
    }

    /// Verifies that the workspace generation has not changed since an operation started.
    pub fn ensure_generation(&self, expected_gen: u64) -> Result<(), FsSecurityError> {
        let guard = self
            .state
            .read()
            .map_err(|_| FsSecurityError::Io("Workspace guard lock poisoned.".to_string()))?;

        if guard.generation != expected_gen {
            return Err(FsSecurityError::StaleWorkspaceToken);
        }
        Ok(())
    }

    fn find_matching_root<'a>(roots: &'a [PathBuf], path: &Path) -> Option<&'a PathBuf> {
        roots.iter().find(|root| Self::is_path_within(root, path))
    }

    fn find_root_by_ancestor_canonical<'a>(
        roots: &'a [PathBuf],
        path: &Path,
    ) -> Option<&'a PathBuf> {
        let mut curr = Some(path);
        while let Some(p) = curr {
            if let Ok(canon) = fs::canonicalize(p) {
                let canon_clean = Self::strip_verbatim_prefix(&canon);
                if let Some(root) = roots.iter().find(|r| Self::paths_equal(r, &canon_clean)) {
                    return Some(root);
                }
            }
            curr = p.parent();
        }
        None
    }

    fn is_single_file_granted(&self, snap: &WorkspaceSnapshot, candidate: &Path) -> bool {
        snap.single_file_grants
            .iter()
            .any(|g| Self::paths_equal(g, candidate))
    }

    /// Validates an existing path within an authorized workspace root (or an explicit
    /// single-file OS dialog grant when `allow_single_file_grant` is true).
    pub fn validate_existing_path(
        &self,
        raw: &str,
        allow_single_file_grant: bool,
    ) -> Result<(PathBuf, u64), FsSecurityError> {
        let parsed = Self::lexical_check(raw)?;
        let snap = self.snapshot()?;

        if snap.authorized_roots.is_empty()
            && (!allow_single_file_grant || snap.single_file_grants.is_empty())
        {
            return Err(FsSecurityError::NoActiveWorkspace);
        }

        // Check symlink/junction BEFORE canonicalizing so we reject direct link targets cleanly
        match fs::symlink_metadata(&parsed) {
            Ok(_) => {
                if Self::is_symlink_or_junction(&parsed)? {
                    return Err(FsSecurityError::SymlinkOrJunctionBlocked(raw.to_string()));
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                return Err(FsSecurityError::NotFound(format!(
                    "Path does not exist: {}",
                    raw
                )));
            }
            Err(e) => return Err(e.into()),
        }

        let canonical = Self::strip_verbatim_prefix(&fs::canonicalize(&parsed)?);

        if let Some(root) = Self::find_matching_root(&snap.authorized_roots, &parsed)
            .or_else(|| Self::find_matching_root(&snap.authorized_roots, &canonical))
            .or_else(|| Self::find_root_by_ancestor_canonical(&snap.authorized_roots, &parsed))
        {
            let verified = Self::verify_no_symlinks_between(root, &parsed)?;
            if SensitivePathPolicy::is_sensitive(&verified)
                || SensitivePathPolicy::is_sensitive(&parsed)
            {
                return Err(FsSecurityError::SensitivePathBlocked(raw.to_string()));
            }
            return Ok((verified, snap.generation));
        }

        if allow_single_file_grant && self.is_single_file_granted(&snap, &canonical) {
            Self::verify_no_symlinks_on_ancestors(&parsed)?;
            Self::verify_no_symlinks_on_ancestors(&canonical)?;
            if SensitivePathPolicy::is_sensitive(&canonical)
                || SensitivePathPolicy::is_sensitive(&parsed)
            {
                return Err(FsSecurityError::SensitivePathBlocked(raw.to_string()));
            }
            return Ok((canonical, snap.generation));
        }

        if snap.authorized_roots.is_empty() {
            Err(FsSecurityError::NoActiveWorkspace)
        } else {
            Err(FsSecurityError::PathOutsideWorkspace(raw.to_string()))
        }
    }

    /// Validates an existing file for reading or replacement.
    pub fn validate_existing_file(
        &self,
        raw: &str,
        allow_single_file_grant: bool,
    ) -> Result<(PathBuf, u64), FsSecurityError> {
        let (canonical, gen) = self.validate_existing_path(raw, allow_single_file_grant)?;
        let meta = fs::symlink_metadata(&canonical)?;
        if Self::is_symlink_or_junction(&canonical)? {
            return Err(FsSecurityError::SymlinkOrJunctionBlocked(raw.to_string()));
        }
        if !meta.is_file() {
            return Err(FsSecurityError::InvalidOperation(format!(
                "Path is not a file: {}",
                raw
            )));
        }
        Ok((canonical, gen))
    }

    /// Validates an existing directory inside an authorized workspace root.
    pub fn validate_existing_dir(&self, raw: &str) -> Result<(PathBuf, u64), FsSecurityError> {
        let (canonical, gen) = self.validate_existing_path(raw, false)?;
        let meta = fs::symlink_metadata(&canonical)?;
        if Self::is_symlink_or_junction(&canonical)? {
            return Err(FsSecurityError::SymlinkOrJunctionBlocked(raw.to_string()));
        }
        if !meta.is_dir() {
            return Err(FsSecurityError::InvalidOperation(format!(
                "Path is not a directory: {}",
                raw
            )));
        }
        Ok((canonical, gen))
    }

    /// Validates an existing path that will be mutated (deleted, renamed, moved, duplicated).
    /// Rejects mutating any authorized workspace root itself.
    pub fn validate_existing_mutable_path(
        &self,
        raw: &str,
    ) -> Result<(PathBuf, u64), FsSecurityError> {
        let (canonical, gen) = self.validate_existing_path(raw, false)?;
        let snap = self.snapshot()?;
        if snap.generation != gen {
            return Err(FsSecurityError::StaleWorkspaceToken);
        }
        if snap
            .authorized_roots
            .iter()
            .any(|root| Self::paths_equal(root, &canonical))
        {
            return Err(FsSecurityError::WorkspaceRootMutationBlocked(
                raw.to_string(),
            ));
        }
        Ok((canonical, gen))
    }

    /// Validates a target path (existing or non-existing) for create, copy-dest, move-dest,
    /// rename-dest, or write operations.
    pub fn validate_target_path(
        &self,
        raw: &str,
        allow_single_file_grant: bool,
    ) -> Result<(PathBuf, u64), FsSecurityError> {
        let parsed = Self::lexical_check(raw)?;
        let snap = self.snapshot()?;

        if SensitivePathPolicy::is_sensitive(&parsed) {
            return Err(FsSecurityError::SensitivePathBlocked(raw.to_string()));
        }

        if snap.authorized_roots.is_empty()
            && (!allow_single_file_grant || snap.single_file_grants.is_empty())
        {
            return Err(FsSecurityError::NoActiveWorkspace);
        }

        // Walk up until we find the deepest existing ancestor
        let mut missing_rev: Vec<Component<'_>> = Vec::new();
        let mut curr: &Path = &parsed;

        let (canonical_ancestor, existing_ancestor_raw) = loop {
            match fs::symlink_metadata(curr) {
                Ok(_) => {
                    if Self::is_symlink_or_junction(curr)? {
                        return Err(FsSecurityError::SymlinkOrJunctionBlocked(
                            curr.to_string_lossy().to_string(),
                        ));
                    }
                    let canon = Self::strip_verbatim_prefix(&fs::canonicalize(curr)?);
                    break (canon, curr.to_path_buf());
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                    let parent = curr
                        .parent()
                        .ok_or_else(|| FsSecurityError::PathOutsideWorkspace(raw.to_string()))?;
                    let leaf = curr
                        .components()
                        .next_back()
                        .ok_or_else(|| FsSecurityError::UnsupportedPathFormat(raw.to_string()))?;
                    if !matches!(leaf, Component::Normal(_)) {
                        return Err(FsSecurityError::TraversalDetected(raw.to_string()));
                    }
                    missing_rev.push(leaf);
                    curr = parent;
                }
                Err(e) => return Err(e.into()),
            }
        };

        if let Some(root) = Self::find_matching_root(&snap.authorized_roots, &canonical_ancestor)
            .or_else(|| {
                Self::find_root_by_ancestor_canonical(
                    &snap.authorized_roots,
                    &existing_ancestor_raw,
                )
            })
        {
            let verified_ancestor = Self::verify_no_symlinks_between(root, &existing_ancestor_raw)?;
            let mut resolved = verified_ancestor;
            for comp in missing_rev.into_iter().rev() {
                resolved.push(comp);
            }
            if !Self::is_path_within(root, &resolved) {
                return Err(FsSecurityError::PathOutsideWorkspace(raw.to_string()));
            }
            if SensitivePathPolicy::is_sensitive(&resolved) {
                return Err(FsSecurityError::SensitivePathBlocked(raw.to_string()));
            }
            return Ok((resolved, snap.generation));
        }

        if allow_single_file_grant {
            if Self::is_forbidden_workspace_root(&canonical_ancestor) {
                return Err(FsSecurityError::PathOutsideWorkspace(raw.to_string()));
            }
            Self::verify_no_symlinks_on_ancestors(&existing_ancestor_raw)?;
            Self::verify_no_symlinks_on_ancestors(&canonical_ancestor)?;
            let mut resolved = canonical_ancestor;
            for comp in missing_rev.into_iter().rev() {
                resolved.push(comp);
            }
            if self.is_single_file_granted(&snap, &resolved) {
                if SensitivePathPolicy::is_sensitive(&resolved) {
                    return Err(FsSecurityError::SensitivePathBlocked(raw.to_string()));
                }
                return Ok((resolved, snap.generation));
            }
        }

        if snap.authorized_roots.is_empty() {
            Err(FsSecurityError::NoActiveWorkspace)
        } else {
            Err(FsSecurityError::PathOutsideWorkspace(raw.to_string()))
        }
    }

    /// Validates an `fs_exists` query. Rejects outside-workspace, traversal, UNC,
    /// symlink/junction, and sensitive paths with an error so `fs_exists` cannot act
    /// as a filesystem existence oracle.
    pub fn validate_path_for_exists(
        &self,
        raw: &str,
        allow_single_file_grant: bool,
    ) -> Result<(PathBuf, u64), FsSecurityError> {
        self.validate_target_path(raw, allow_single_file_grant)
    }

    /// Validates a workspace root or subdirectory argument for workspace-level operations
    /// (`fs_search_workspace`, `fs_list_workspace_files`, `workspace_detect_project`).
    pub fn validate_workspace_dir_arg(&self, raw: &str) -> Result<(PathBuf, u64), FsSecurityError> {
        self.validate_existing_dir(raw)
    }

    /// Revalidates an already-resolved path and workspace generation immediately before
    /// executing a sensitive filesystem operation (TOCTOU mitigation).
    pub fn revalidate_before_op(
        &self,
        resolved_path: &Path,
        expected_gen: u64,
        allow_single_file_grant: bool,
    ) -> Result<(), FsSecurityError> {
        let snap = self.snapshot()?;
        if snap.generation != expected_gen {
            return Err(FsSecurityError::StaleWorkspaceToken);
        }

        if SensitivePathPolicy::is_sensitive(resolved_path) {
            return Err(FsSecurityError::SensitivePathBlocked(Self::display_path(
                resolved_path,
            )));
        }

        // Check if target or any existing ancestor is a symlink/junction right now
        if let Some(root) = Self::find_matching_root(&snap.authorized_roots, resolved_path) {
            if fs::symlink_metadata(resolved_path).is_ok() {
                Self::verify_no_symlinks_between(root, resolved_path)?;
            } else if let Some(parent) = resolved_path.parent() {
                if fs::symlink_metadata(parent).is_ok() && Self::is_path_within(root, parent) {
                    Self::verify_no_symlinks_between(root, parent)?;
                }
            }
            return Ok(());
        }

        if allow_single_file_grant && self.is_single_file_granted(&snap, resolved_path) {
            if fs::symlink_metadata(resolved_path).is_ok()
                && Self::is_symlink_or_junction(resolved_path)?
            {
                return Err(FsSecurityError::SymlinkOrJunctionBlocked(
                    Self::display_path(resolved_path),
                ));
            }
            return Ok(());
        }

        Err(FsSecurityError::PathOutsideWorkspace(Self::display_path(
            resolved_path,
        )))
    }
}
