use crate::security::{FsSecurityError, SensitivePathPolicy, WorkspaceGuard};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::UNIX_EPOCH;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: Option<u64>,
    pub modified_at: Option<u64>,
}

fn get_modified_time(metadata: &fs::Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
}

fn get_created_time(metadata: &fs::Metadata) -> Option<u64> {
    metadata
        .created()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
}

/// Safely creates missing directories up to `target_dir` without following symlinks or junctions,
/// verifying generation and reparse points at each step.
fn safe_create_dir_all(
    guard: &WorkspaceGuard,
    expected_gen: u64,
    target_dir: &Path,
) -> Result<(), FsSecurityError> {
    guard.ensure_generation(expected_gen)?;

    if fs::symlink_metadata(target_dir).is_ok() {
        if WorkspaceGuard::is_symlink_or_junction(target_dir)? {
            return Err(FsSecurityError::SymlinkOrJunctionBlocked(
                WorkspaceGuard::display_path(target_dir),
            ));
        }
        let meta = fs::symlink_metadata(target_dir)?;
        if !meta.is_dir() {
            return Err(FsSecurityError::InvalidOperation(format!(
                "Parent path exists and is not a directory: {}",
                WorkspaceGuard::display_path(target_dir)
            )));
        }
        return Ok(());
    }

    let mut missing = Vec::new();
    let mut curr = target_dir;
    while fs::symlink_metadata(curr).is_err() {
        missing.push(curr.to_path_buf());
        curr = curr.parent().ok_or_else(|| {
            FsSecurityError::UnsupportedPathFormat(WorkspaceGuard::display_path(target_dir))
        })?;
    }

    guard.revalidate_before_op(curr, expected_gen, false)?;

    for dir in missing.into_iter().rev() {
        guard.ensure_generation(expected_gen)?;
        if SensitivePathPolicy::is_sensitive(&dir) {
            return Err(FsSecurityError::SensitivePathBlocked(
                WorkspaceGuard::display_path(&dir),
            ));
        }
        match fs::create_dir(&dir) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                if WorkspaceGuard::is_symlink_or_junction(&dir)? {
                    return Err(FsSecurityError::SymlinkOrJunctionBlocked(
                        WorkspaceGuard::display_path(&dir),
                    ));
                }
            }
            Err(e) => return Err(e.into()),
        }
    }

    Ok(())
}

/// Recursively deletes a directory without following symlinks or junctions and checking
/// workspace generation and sensitive-path policy on every entry.
fn safe_remove_dir_all(
    guard: &WorkspaceGuard,
    expected_gen: u64,
    dir: &Path,
    depth: usize,
) -> Result<(), FsSecurityError> {
    if depth > 64 {
        return Err(FsSecurityError::InvalidOperation(
            "Maximum directory recursion depth exceeded during delete.".to_string(),
        ));
    }
    guard.ensure_generation(expected_gen)?;
    guard.revalidate_before_op(dir, expected_gen, false)?;

    for entry_res in fs::read_dir(dir)? {
        guard.ensure_generation(expected_gen)?;
        let entry = entry_res?;
        let entry_path = entry.path();
        let file_type = entry.file_type()?;

        if file_type.is_symlink() || WorkspaceGuard::is_symlink_or_junction(&entry_path)? {
            return Err(FsSecurityError::SymlinkOrJunctionBlocked(
                WorkspaceGuard::display_path(&entry_path),
            ));
        }
        if SensitivePathPolicy::is_sensitive(&entry_path) {
            return Err(FsSecurityError::SensitivePathBlocked(
                WorkspaceGuard::display_path(&entry_path),
            ));
        }

        if file_type.is_dir() {
            safe_remove_dir_all(guard, expected_gen, &entry_path, depth + 1)?;
        } else {
            fs::remove_file(&entry_path)?;
        }
    }

    guard.ensure_generation(expected_gen)?;
    fs::remove_dir(dir)?;
    Ok(())
}

/// Recursively copies a directory without following symlinks or junctions.
fn safe_copy_dir_all(
    guard: &WorkspaceGuard,
    expected_gen: u64,
    src: &Path,
    dst: &Path,
    depth: usize,
) -> Result<(), FsSecurityError> {
    if depth > 32 {
        return Err(FsSecurityError::InvalidOperation(
            "Maximum directory recursion depth exceeded.".to_string(),
        ));
    }
    guard.ensure_generation(expected_gen)?;
    guard.revalidate_before_op(src, expected_gen, false)?;
    guard.revalidate_before_op(dst, expected_gen, false)?;

    safe_create_dir_all(guard, expected_gen, dst)?;

    for entry_res in fs::read_dir(src)? {
        guard.ensure_generation(expected_gen)?;
        let entry = entry_res?;
        let file_type = entry.file_type()?;
        let entry_path = entry.path();
        let dest_path = dst.join(entry.file_name());

        // Never follow or copy symlinks/junctions
        if file_type.is_symlink() || WorkspaceGuard::is_symlink_or_junction(&entry_path)? {
            continue;
        }
        if SensitivePathPolicy::is_sensitive(&entry_path)
            || SensitivePathPolicy::is_sensitive(&dest_path)
        {
            return Err(FsSecurityError::SensitivePathBlocked(
                WorkspaceGuard::display_path(&entry_path),
            ));
        }
        if WorkspaceGuard::is_path_within(&entry_path, &dest_path) {
            continue;
        }

        if file_type.is_dir() {
            safe_copy_dir_all(guard, expected_gen, &entry_path, &dest_path, depth + 1)?;
        } else if file_type.is_file() {
            fs::copy(&entry_path, &dest_path)?;
        }
    }
    Ok(())
}

pub fn fs_read_directory_impl(
    guard: &WorkspaceGuard,
    path: String,
    show_hidden: Option<bool>,
) -> Result<Vec<FileEntry>, FsSecurityError> {
    let (canonical_dir, gen) = guard.validate_existing_dir(&path)?;
    let include_hidden = show_hidden.unwrap_or(false);
    let mut entries = Vec::new();

    let read_dir = fs::read_dir(&canonical_dir)
        .map_err(|e| FsSecurityError::Io(format!("Unable to read directory: {}", e)))?;

    for item in read_dir {
        guard.ensure_generation(gen)?;
        let entry = match item {
            Ok(e) => e,
            Err(_) => continue,
        };

        let file_name = entry.file_name().to_string_lossy().to_string();
        if !include_hidden && file_name.starts_with('.') {
            continue;
        }

        let entry_path = entry.path();
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };

        // Never expose symlinks or NTFS junctions in directory listings
        if file_type.is_symlink()
            || WorkspaceGuard::is_symlink_or_junction(&entry_path).unwrap_or(true)
        {
            continue;
        }

        let metadata = fs::symlink_metadata(&entry_path).ok();
        let is_dir = file_type.is_dir();
        let size = if !is_dir {
            metadata.as_ref().map(|m| m.len())
        } else {
            None
        };
        let modified_at = metadata.as_ref().and_then(get_modified_time);

        entries.push(FileEntry {
            name: file_name,
            path: WorkspaceGuard::display_path(&entry_path),
            is_directory: is_dir,
            size,
            modified_at,
        });
    }

    entries.sort_by(|a, b| {
        if a.is_directory != b.is_directory {
            b.is_directory.cmp(&a.is_directory)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    Ok(entries)
}

#[tauri::command]
pub fn fs_read_directory(
    guard: State<'_, Arc<WorkspaceGuard>>,
    path: String,
    show_hidden: Option<bool>,
) -> Result<Vec<FileEntry>, String> {
    fs_read_directory_impl(guard.inner(), path, show_hidden).map_err(Into::into)
}

pub fn fs_create_file_impl(guard: &WorkspaceGuard, path: String) -> Result<(), FsSecurityError> {
    let (target, gen) = guard.validate_target_path(&path, false)?;
    if fs::symlink_metadata(&target).is_ok() {
        return Err(FsSecurityError::AlreadyExists(
            "A file or directory already exists at this path.".to_string(),
        ));
    }

    if let Some(parent) = target.parent() {
        safe_create_dir_all(guard, gen, parent)?;
    }

    guard.revalidate_before_op(&target, gen, false)?;
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                FsSecurityError::AlreadyExists(
                    "A file or directory already exists at this path.".to_string(),
                )
            } else {
                FsSecurityError::Io(format!("Unable to create file: {}", e))
            }
        })?;

    Ok(())
}

#[tauri::command]
pub fn fs_create_file(guard: State<'_, Arc<WorkspaceGuard>>, path: String) -> Result<(), String> {
    fs_create_file_impl(guard.inner(), path).map_err(Into::into)
}

pub fn fs_create_directory_impl(
    guard: &WorkspaceGuard,
    path: String,
) -> Result<(), FsSecurityError> {
    let (target, gen) = guard.validate_target_path(&path, false)?;
    if fs::symlink_metadata(&target).is_ok() {
        return Err(FsSecurityError::AlreadyExists(
            "A file or directory already exists at this path.".to_string(),
        ));
    }

    safe_create_dir_all(guard, gen, &target)
}

#[tauri::command]
pub fn fs_create_directory(
    guard: State<'_, Arc<WorkspaceGuard>>,
    path: String,
) -> Result<(), String> {
    fs_create_directory_impl(guard.inner(), path).map_err(Into::into)
}

pub fn fs_rename_impl(
    guard: &WorkspaceGuard,
    old_path: String,
    new_path: String,
) -> Result<(), FsSecurityError> {
    let (src, gen) = guard.validate_existing_mutable_path(&old_path)?;
    let (dest, gen2) = guard.validate_target_path(&new_path, false)?;
    if gen != gen2 {
        return Err(FsSecurityError::StaleWorkspaceToken);
    }

    let is_case_only_rename = WorkspaceGuard::paths_equal(&src, &dest);

    if fs::symlink_metadata(&dest).is_ok() && !is_case_only_rename {
        return Err(FsSecurityError::AlreadyExists(
            "An item with the destination name already exists.".to_string(),
        ));
    }

    if is_case_only_rename && src != dest {
        let temp_str = format!("{}.kairo_rename_tmp", WorkspaceGuard::display_path(&src));
        let (temp_path, temp_gen) = guard.validate_target_path(&temp_str, false)?;
        if temp_gen != gen {
            return Err(FsSecurityError::StaleWorkspaceToken);
        }
        if fs::symlink_metadata(&temp_path).is_ok() {
            return Err(FsSecurityError::AlreadyExists(
                "Temporary rename target already exists.".to_string(),
            ));
        }

        guard.revalidate_before_op(&src, gen, false)?;
        guard.revalidate_before_op(&temp_path, gen, false)?;
        fs::rename(&src, &temp_path)
            .map_err(|e| FsSecurityError::Io(format!("Unable to rename item: {}", e)))?;

        guard.revalidate_before_op(&dest, gen, false)?;
        if let Err(e) = fs::rename(&temp_path, &dest) {
            let _ = fs::rename(&temp_path, &src);
            return Err(FsSecurityError::Io(format!("Unable to rename item: {}", e)));
        }
        return Ok(());
    }

    guard.revalidate_before_op(&src, gen, false)?;
    guard.revalidate_before_op(&dest, gen, false)?;
    fs::rename(&src, &dest)
        .map_err(|e| FsSecurityError::Io(format!("Unable to rename item: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub fn fs_rename(
    guard: State<'_, Arc<WorkspaceGuard>>,
    old_path: String,
    new_path: String,
) -> Result<(), String> {
    fs_rename_impl(guard.inner(), old_path, new_path).map_err(Into::into)
}

pub fn fs_delete_impl(
    guard: &WorkspaceGuard,
    path: String,
    is_dir: bool,
) -> Result<(), FsSecurityError> {
    let (target, gen) = guard.validate_existing_mutable_path(&path)?;
    guard.revalidate_before_op(&target, gen, false)?;

    let meta = fs::symlink_metadata(&target)?;
    if is_dir {
        if !meta.is_dir() {
            return Err(FsSecurityError::InvalidOperation(
                "Target is not a directory.".to_string(),
            ));
        }
        safe_remove_dir_all(guard, gen, &target, 0)?;
    } else {
        if meta.is_dir() {
            return Err(FsSecurityError::InvalidOperation(
                "Target is a directory, not a file.".to_string(),
            ));
        }
        fs::remove_file(&target)
            .map_err(|e| FsSecurityError::Io(format!("Unable to delete file: {}", e)))?;
    }

    Ok(())
}

#[tauri::command]
pub fn fs_delete(
    guard: State<'_, Arc<WorkspaceGuard>>,
    path: String,
    is_dir: bool,
) -> Result<(), String> {
    fs_delete_impl(guard.inner(), path, is_dir).map_err(Into::into)
}

pub fn fs_copy_impl(
    guard: &WorkspaceGuard,
    src_path: String,
    dest_path: String,
) -> Result<(), FsSecurityError> {
    let (src, gen) = guard.validate_existing_path(&src_path, false)?;
    let (dest, gen2) = guard.validate_target_path(&dest_path, false)?;
    if gen != gen2 {
        return Err(FsSecurityError::StaleWorkspaceToken);
    }

    let src_meta = fs::symlink_metadata(&src)?;
    if src_meta.is_dir() {
        if WorkspaceGuard::is_path_within(&src, &dest) {
            return Err(FsSecurityError::InvalidOperation(
                "Cannot copy a directory into itself or one of its subdirectories.".to_string(),
            ));
        }
        safe_copy_dir_all(guard, gen, &src, &dest, 0)?;
    } else {
        if let Some(parent) = dest.parent() {
            safe_create_dir_all(guard, gen, parent)?;
        }
        guard.revalidate_before_op(&src, gen, false)?;
        guard.revalidate_before_op(&dest, gen, false)?;
        fs::copy(&src, &dest)
            .map_err(|e| FsSecurityError::Io(format!("Unable to copy file: {}", e)))?;
    }

    Ok(())
}

#[tauri::command]
pub fn fs_copy(
    guard: State<'_, Arc<WorkspaceGuard>>,
    src_path: String,
    dest_path: String,
) -> Result<(), String> {
    fs_copy_impl(guard.inner(), src_path, dest_path).map_err(Into::into)
}

pub fn fs_move_impl(
    guard: &WorkspaceGuard,
    src_path: String,
    dest_path: String,
) -> Result<(), FsSecurityError> {
    let (src, gen) = guard.validate_existing_mutable_path(&src_path)?;
    let (dest, gen2) = guard.validate_target_path(&dest_path, false)?;
    if gen != gen2 {
        return Err(FsSecurityError::StaleWorkspaceToken);
    }

    if WorkspaceGuard::paths_equal(&src, &dest) {
        return Ok(());
    }

    let src_meta = fs::symlink_metadata(&src)?;
    if src_meta.is_dir() && WorkspaceGuard::is_path_within(&src, &dest) {
        return Err(FsSecurityError::InvalidOperation(
            "Cannot move a directory into itself or one of its subdirectories.".to_string(),
        ));
    }

    if fs::symlink_metadata(&dest).is_ok() {
        let name = dest
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        return Err(FsSecurityError::AlreadyExists(format!(
            "An item named '{}' already exists at the destination.",
            name
        )));
    }

    if let Some(parent) = dest.parent() {
        safe_create_dir_all(guard, gen, parent)?;
    }

    guard.revalidate_before_op(&src, gen, false)?;
    guard.revalidate_before_op(&dest, gen, false)?;

    if fs::rename(&src, &dest).is_err() {
        if src_meta.is_dir() {
            safe_copy_dir_all(guard, gen, &src, &dest, 0)?;
            safe_remove_dir_all(guard, gen, &src, 0)?;
        } else {
            guard.revalidate_before_op(&src, gen, false)?;
            guard.revalidate_before_op(&dest, gen, false)?;
            fs::copy(&src, &dest)
                .map_err(|e| FsSecurityError::Io(format!("Unable to move file: {}", e)))?;
            guard.ensure_generation(gen)?;
            fs::remove_file(&src)
                .map_err(|e| FsSecurityError::Io(format!("Failed to remove source file: {}", e)))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn fs_move(
    guard: State<'_, Arc<WorkspaceGuard>>,
    src_path: String,
    dest_path: String,
) -> Result<(), String> {
    fs_move_impl(guard.inner(), src_path, dest_path).map_err(Into::into)
}

pub fn fs_duplicate_impl(
    guard: &WorkspaceGuard,
    src_path: String,
) -> Result<String, FsSecurityError> {
    let (src, gen) = guard.validate_existing_mutable_path(&src_path)?;
    let src_meta = fs::symlink_metadata(&src)?;

    let parent = src.parent().ok_or_else(|| {
        FsSecurityError::InvalidOperation("Cannot duplicate root path".to_string())
    })?;
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = src.extension().and_then(|e| e.to_str());

    let mut counter = 1;
    loop {
        guard.ensure_generation(gen)?;
        let new_name = if counter == 1 {
            match ext {
                Some(e) => format!("{} copy.{}", stem, e),
                None => format!("{} copy", stem),
            }
        } else {
            match ext {
                Some(e) => format!("{} copy {}.{}", stem, counter, e),
                None => format!("{} copy {}", stem, counter),
            }
        };

        let candidate_raw: PathBuf = parent.join(&new_name);
        if fs::symlink_metadata(&candidate_raw).is_err() {
            let candidate_str = WorkspaceGuard::display_path(&candidate_raw);
            let (candidate, cand_gen) = guard.validate_target_path(&candidate_str, false)?;
            if cand_gen != gen {
                return Err(FsSecurityError::StaleWorkspaceToken);
            }

            guard.revalidate_before_op(&src, gen, false)?;
            guard.revalidate_before_op(&candidate, gen, false)?;

            if src_meta.is_dir() {
                safe_copy_dir_all(guard, gen, &src, &candidate, 0)?;
            } else {
                fs::copy(&src, &candidate)
                    .map_err(|e| FsSecurityError::Io(format!("Unable to duplicate file: {}", e)))?;
            }
            return Ok(WorkspaceGuard::display_path(&candidate));
        }

        counter += 1;
        if counter > 100 {
            return Err(FsSecurityError::InvalidOperation(
                "Failed to find available duplicate filename.".to_string(),
            ));
        }
    }
}

#[tauri::command]
pub fn fs_duplicate(
    guard: State<'_, Arc<WorkspaceGuard>>,
    src_path: String,
) -> Result<String, String> {
    fs_duplicate_impl(guard.inner(), src_path).map_err(Into::into)
}

pub fn fs_reveal_impl(guard: &WorkspaceGuard, path: String) -> Result<(), FsSecurityError> {
    let (target, gen) = guard.validate_existing_path(&path, true)?;
    guard.revalidate_before_op(&target, gen, true)?;

    let meta = fs::symlink_metadata(&target)?;
    let display = WorkspaceGuard::display_path(&target);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let formatted = display.replace('/', "\\");
        if formatted.contains('"') || formatted.chars().any(|c| c.is_control()) {
            return Err(FsSecurityError::UnsupportedPathFormat(
                "Path contains invalid characters.".to_string(),
            ));
        }

        let mut cmd = std::process::Command::new("explorer");
        if meta.is_dir() {
            cmd.raw_arg(format!("\"{}\"", formatted));
        } else {
            cmd.raw_arg(format!("/select,\"{}\"", formatted));
        }
        cmd.spawn().map_err(|e| {
            FsSecurityError::Io(format!("Failed to reveal item in file manager: {}", e))
        })?;
    }

    #[cfg(target_os = "macos")]
    {
        let mut cmd = std::process::Command::new("open");
        if !meta.is_dir() {
            cmd.arg("-R");
        }
        cmd.arg(&display).spawn().map_err(|e| {
            FsSecurityError::Io(format!("Failed to reveal item in file manager: {}", e))
        })?;
    }

    #[cfg(target_os = "linux")]
    {
        let reveal_target = if meta.is_dir() {
            target.as_path()
        } else {
            target.parent().unwrap_or(target.as_path())
        };
        std::process::Command::new("xdg-open")
            .arg(reveal_target)
            .spawn()
            .map_err(|e| {
                FsSecurityError::Io(format!("Failed to reveal item in file manager: {}", e))
            })?;
    }

    Ok(())
}

#[tauri::command]
pub fn fs_reveal(guard: State<'_, Arc<WorkspaceGuard>>, path: String) -> Result<(), String> {
    fs_reveal_impl(guard.inner(), path).map_err(Into::into)
}

pub fn fs_exists_impl(guard: &WorkspaceGuard, path: String) -> Result<bool, FsSecurityError> {
    let (target, gen) = guard.validate_path_for_exists(&path, true)?;
    guard.ensure_generation(gen)?;
    Ok(fs::symlink_metadata(&target).is_ok())
}

#[tauri::command]
pub fn fs_exists(guard: State<'_, Arc<WorkspaceGuard>>, path: String) -> Result<bool, String> {
    fs_exists_impl(guard.inner(), path).map_err(Into::into)
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DetailedMetadata {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub size: u64,
    pub file_count: usize,
    pub folder_count: usize,
    pub is_readonly: bool,
    pub created_at: Option<u64>,
    pub modified_at: Option<u64>,
}

pub fn fs_get_metadata_impl(
    guard: &WorkspaceGuard,
    path: String,
) -> Result<DetailedMetadata, FsSecurityError> {
    let (target, gen) = guard.validate_existing_path(&path, true)?;
    guard.revalidate_before_op(&target, gen, true)?;

    let metadata = fs::symlink_metadata(&target)
        .map_err(|e| FsSecurityError::Io(format!("Unable to read metadata: {}", e)))?;
    let is_dir = metadata.is_dir();
    let is_readonly = metadata.permissions().readonly();
    let modified_at = get_modified_time(&metadata);
    let created_at = get_created_time(&metadata);
    let display = WorkspaceGuard::display_path(&target);
    let name = target
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| display.clone());

    if !is_dir {
        return Ok(DetailedMetadata {
            name,
            path: display,
            is_directory: false,
            size: metadata.len(),
            file_count: 1,
            folder_count: 0,
            is_readonly,
            created_at,
            modified_at,
        });
    }

    let mut total_size: u64 = 0;
    let mut file_count: usize = 0;
    let mut folder_count: usize = 0;

    fn count_dir_contents(
        guard: &WorkspaceGuard,
        expected_gen: u64,
        dir: &Path,
        total_size: &mut u64,
        file_count: &mut usize,
        folder_count: &mut usize,
        depth_limit: usize,
    ) -> Result<(), FsSecurityError> {
        if depth_limit == 0 {
            return Ok(());
        }
        guard.ensure_generation(expected_gen)?;

        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                guard.ensure_generation(expected_gen)?;
                let entry_path = entry.path();
                let Ok(file_type) = entry.file_type() else {
                    continue;
                };
                if file_type.is_symlink()
                    || WorkspaceGuard::is_symlink_or_junction(&entry_path).unwrap_or(true)
                {
                    continue;
                }
                if SensitivePathPolicy::is_sensitive(&entry_path) {
                    continue;
                }
                if let Ok(meta) = fs::symlink_metadata(&entry_path) {
                    if meta.is_dir() {
                        *folder_count += 1;
                        count_dir_contents(
                            guard,
                            expected_gen,
                            &entry_path,
                            total_size,
                            file_count,
                            folder_count,
                            depth_limit - 1,
                        )?;
                    } else {
                        *file_count += 1;
                        *total_size += meta.len();
                    }
                }
            }
        }
        Ok(())
    }

    count_dir_contents(
        guard,
        gen,
        &target,
        &mut total_size,
        &mut file_count,
        &mut folder_count,
        30,
    )?;

    Ok(DetailedMetadata {
        name,
        path: display,
        is_directory: true,
        size: total_size,
        file_count,
        folder_count,
        is_readonly,
        created_at,
        modified_at,
    })
}

#[tauri::command]
pub async fn fs_get_metadata(
    guard: State<'_, Arc<WorkspaceGuard>>,
    path: String,
) -> Result<DetailedMetadata, String> {
    let guard = guard.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        fs_get_metadata_impl(&guard, path).map_err(Into::into)
    })
    .await
    .map_err(|e| format!("Failed to execute fs_get_metadata task: {}", e))?
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FileContentResult {
    pub content: String,
    pub is_binary: bool,
    pub size: u64,
    pub readonly: bool,
}

fn is_binary_extension(ext: &str) -> bool {
    let lower = ext.to_lowercase();
    matches!(
        lower.as_str(),
        "png"
            | "jpg"
            | "jpeg"
            | "gif"
            | "webp"
            | "bmp"
            | "ico"
            | "tiff"
            | "pdf"
            | "zip"
            | "tar"
            | "gz"
            | "7z"
            | "rar"
            | "bz2"
            | "xz"
            | "exe"
            | "dll"
            | "so"
            | "dylib"
            | "bin"
            | "iso"
            | "dmg"
            | "woff"
            | "woff2"
            | "ttf"
            | "otf"
            | "eot"
            | "mp3"
            | "mp4"
            | "wav"
            | "flac"
            | "ogg"
            | "avi"
            | "mov"
            | "webm"
            | "mkv"
            | "wasm"
            | "class"
            | "pyc"
            | "o"
            | "obj"
            | "lib"
            | "a"
            | "pdb"
    )
}

fn detect_binary(bytes: &[u8]) -> bool {
    let check_len = std::cmp::min(bytes.len(), 8192);
    if check_len == 0 {
        return false;
    }
    let mut non_text_count = 0usize;
    for &b in &bytes[..check_len] {
        if b == 0 {
            return true;
        }
        // Control characters other than tab (0x09), LF (0x0A), FF (0x0C), CR (0x0D), ESC (0x1B)
        if b < 0x20 && !matches!(b, b'\t' | b'\n' | b'\r' | 0x0C | 0x1B) {
            non_text_count += 1;
        }
    }
    // If > 30% of sampled bytes are non-printable control characters, treat as binary
    non_text_count * 10 > check_len * 3
}

const MAX_BINARY_CHUNK_SIZE: usize = 1_048_576; // 1 MiB cap per IPC chunk read
const MAX_BINARY_SEARCH_RESULTS: usize = 500;

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BinaryChunkResult {
    pub bytes: Vec<u8>,
    pub offset: u64,
    pub total_size: u64,
    pub readonly: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BinarySearchResult {
    pub offsets: Vec<u64>,
    pub truncated: bool,
}

pub fn fs_read_file_impl(
    guard: &WorkspaceGuard,
    path: String,
) -> Result<FileContentResult, FsSecurityError> {
    let (target, gen) = guard.validate_existing_file(&path, true)?;
    guard.revalidate_before_op(&target, gen, true)?;

    let metadata = fs::symlink_metadata(&target)
        .map_err(|e| FsSecurityError::Io(format!("Unable to read file metadata: {}", e)))?;
    let size = metadata.len();
    let readonly = metadata.permissions().readonly();

    if let Some(ext) = target.extension().and_then(|e| e.to_str()) {
        if is_binary_extension(ext) {
            return Ok(FileContentResult {
                content: String::new(),
                is_binary: true,
                size,
                readonly,
            });
        }
    }

    // 20 MB safeguard for text files; sample first 8 KiB for large files to route binaries to hex viewer
    if size > 20 * 1024 * 1024 {
        use std::io::Read;
        guard.revalidate_before_op(&target, gen, true)?;
        let mut file = fs::File::open(&target)
            .map_err(|e| FsSecurityError::Io(format!("Unable to open file: {}", e)))?;
        let mut sample = vec![0u8; 8192];
        let n = file
            .read(&mut sample)
            .map_err(|e| FsSecurityError::Io(format!("Unable to sample file: {}", e)))?;
        if detect_binary(&sample[..n]) {
            return Ok(FileContentResult {
                content: String::new(),
                is_binary: true,
                size,
                readonly,
            });
        }
        return Err(FsSecurityError::InvalidOperation(
            "File is too large (>20 MB) to open in text editor.".to_string(),
        ));
    }

    guard.revalidate_before_op(&target, gen, true)?;
    let bytes = fs::read(&target)
        .map_err(|e| FsSecurityError::Io(format!("Unable to read file: {}", e)))?;

    if detect_binary(&bytes) {
        return Ok(FileContentResult {
            content: String::new(),
            is_binary: true,
            size,
            readonly,
        });
    }

    match String::from_utf8(bytes) {
        Ok(content) => Ok(FileContentResult {
            content,
            is_binary: false,
            size,
            readonly,
        }),
        Err(_) => Ok(FileContentResult {
            content: String::new(),
            is_binary: true,
            size,
            readonly,
        }),
    }
}

#[tauri::command]
pub fn fs_read_file(
    guard: State<'_, Arc<WorkspaceGuard>>,
    path: String,
) -> Result<FileContentResult, String> {
    fs_read_file_impl(guard.inner(), path).map_err(Into::into)
}

pub fn fs_read_binary_chunk_impl(
    guard: &WorkspaceGuard,
    path: String,
    offset: u64,
    length: usize,
) -> Result<BinaryChunkResult, FsSecurityError> {
    use std::io::{Read, Seek, SeekFrom};

    let (target, gen) = guard.validate_existing_file(&path, true)?;
    guard.revalidate_before_op(&target, gen, true)?;

    let metadata = fs::symlink_metadata(&target)
        .map_err(|e| FsSecurityError::Io(format!("Unable to read file metadata: {}", e)))?;
    let total_size = metadata.len();
    let readonly = metadata.permissions().readonly();

    if offset >= total_size || length == 0 {
        return Ok(BinaryChunkResult {
            bytes: Vec::new(),
            offset: offset.min(total_size),
            total_size,
            readonly,
        });
    }

    let capped_len = length.min(MAX_BINARY_CHUNK_SIZE);
    let remaining = total_size.saturating_sub(offset);
    let to_read = (capped_len as u64).min(remaining) as usize;

    // Checked arithmetic to guard against overflow when computing end offset
    offset
        .checked_add(to_read as u64)
        .ok_or_else(|| FsSecurityError::InvalidOperation("Requested byte range overflows u64.".to_string()))?;

    guard.revalidate_before_op(&target, gen, true)?;
    let mut file = fs::File::open(&target)
        .map_err(|e| FsSecurityError::Io(format!("Unable to open binary file: {}", e)))?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| FsSecurityError::Io(format!("Unable to seek binary file: {}", e)))?;

    let mut buffer = vec![0u8; to_read];
    let mut read_total = 0usize;
    while read_total < to_read {
        let n = file
            .read(&mut buffer[read_total..])
            .map_err(|e| FsSecurityError::Io(format!("Unable to read binary chunk: {}", e)))?;
        if n == 0 {
            break;
        }
        read_total += n;
    }
    buffer.truncate(read_total);

    Ok(BinaryChunkResult {
        bytes: buffer,
        offset,
        total_size,
        readonly,
    })
}

#[tauri::command]
pub async fn fs_read_binary_chunk(
    guard: State<'_, Arc<WorkspaceGuard>>,
    path: String,
    offset: u64,
    length: usize,
) -> Result<BinaryChunkResult, String> {
    let guard_arc = Arc::clone(guard.inner());
    tauri::async_runtime::spawn_blocking(move || {
        fs_read_binary_chunk_impl(&guard_arc, path, offset, length)
    })
    .await
    .map_err(|e| format!("Binary read task failed: {}", e))?
    .map_err(Into::into)
}

pub fn fs_search_binary_impl(
    guard: &WorkspaceGuard,
    path: String,
    query: Vec<u8>,
    max_results: Option<usize>,
) -> Result<BinarySearchResult, FsSecurityError> {
    use std::io::Read;

    if query.is_empty() {
        return Ok(BinarySearchResult {
            offsets: Vec::new(),
            truncated: false,
        });
    }
    if query.len() > 1024 {
        return Err(FsSecurityError::InvalidOperation(
            "Binary search query exceeds maximum length of 1024 bytes.".to_string(),
        ));
    }

    let (target, gen) = guard.validate_existing_file(&path, true)?;
    guard.revalidate_before_op(&target, gen, true)?;

    let limit = max_results
        .unwrap_or(MAX_BINARY_SEARCH_RESULTS)
        .clamp(1, MAX_BINARY_SEARCH_RESULTS);

    let mut file = fs::File::open(&target)
        .map_err(|e| FsSecurityError::Io(format!("Unable to open binary file: {}", e)))?;

    const WINDOW_SIZE: usize = 65_536;
    let overlap = query.len().saturating_sub(1);
    let mut buffer = vec![0u8; WINDOW_SIZE + overlap];
    let mut carry = 0usize;
    let mut file_offset = 0u64;
    let mut offsets = Vec::new();
    let mut truncated = false;

    loop {
        guard.ensure_generation(gen)?;
        let n = file
            .read(&mut buffer[carry..carry + WINDOW_SIZE])
            .map_err(|e| FsSecurityError::Io(format!("Unable to search binary file: {}", e)))?;
        if n == 0 {
            break;
        }
        let valid_len = carry + n;
        let slice = &buffer[..valid_len];

        if valid_len >= query.len() {
            let search_end = valid_len - query.len();
            let mut idx = 0usize;
            while idx <= search_end {
                if &slice[idx..idx + query.len()] == query.as_slice() {
                    let abs_offset = file_offset
                        .saturating_add(idx as u64)
                        .saturating_sub(carry as u64);
                    offsets.push(abs_offset);
                    if offsets.len() >= limit {
                        truncated = true;
                        return Ok(BinarySearchResult { offsets, truncated });
                    }
                    idx += 1;
                } else {
                    idx += 1;
                }
            }
        }

        file_offset = file_offset.saturating_add(n as u64);
        if overlap > 0 && valid_len >= overlap {
            buffer.copy_within(valid_len - overlap..valid_len, 0);
            carry = overlap;
        } else {
            carry = 0;
        }
    }

    Ok(BinarySearchResult { offsets, truncated })
}

#[tauri::command]
pub async fn fs_search_binary(
    guard: State<'_, Arc<WorkspaceGuard>>,
    path: String,
    query: Vec<u8>,
    max_results: Option<usize>,
) -> Result<BinarySearchResult, String> {
    let guard_arc = Arc::clone(guard.inner());
    tauri::async_runtime::spawn_blocking(move || {
        fs_search_binary_impl(&guard_arc, path, query, max_results)
    })
    .await
    .map_err(|e| format!("Binary search task failed: {}", e))?
    .map_err(Into::into)
}

pub fn fs_write_file_impl(
    guard: &WorkspaceGuard,
    path: String,
    content: String,
) -> Result<(), FsSecurityError> {
    let (target, gen) = guard.validate_target_path(&path, true)?;
    let snap = guard.snapshot()?;
    if snap.generation != gen {
        return Err(FsSecurityError::StaleWorkspaceToken);
    }

    if let Some(parent) = target.parent() {
        let inside_workspace = snap
            .authorized_roots
            .iter()
            .any(|root| WorkspaceGuard::is_path_within(root, parent));
        if inside_workspace {
            safe_create_dir_all(guard, gen, parent)?;
        }
    }

    guard.revalidate_before_op(&target, gen, true)?;
    if let Ok(meta) = fs::symlink_metadata(&target) {
        if meta.is_dir() {
            return Err(FsSecurityError::InvalidOperation(
                "Target path is a directory.".to_string(),
            ));
        }
    }

    fs::write(&target, content.as_bytes())
        .map_err(|e| FsSecurityError::Io(format!("Unable to write file: {}", e)))?;

    Ok(())
}

#[tauri::command]
pub fn fs_write_file(
    guard: State<'_, Arc<WorkspaceGuard>>,
    path: String,
    content: String,
) -> Result<(), String> {
    fs_write_file_impl(guard.inner(), path, content).map_err(Into::into)
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchQueryOptions {
    pub is_case_sensitive: bool,
    pub is_whole_word: bool,
    pub is_regex: bool,
    pub include_patterns: Vec<String>,
    pub exclude_patterns: Vec<String>,
    pub max_results: Option<usize>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceSearchMatch {
    pub file_path: String,
    pub line_number: u32,
    pub column: u32,
    pub match_length: u32,
    pub line_content: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileReplacementPayload {
    pub file_path: String,
    pub line_number: u32,
    pub column: u32,
    pub match_length: u32,
    pub replacement: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceSummary {
    pub files_modified: usize,
    pub occurrences_replaced: usize,
}

fn should_ignore_entry(name: &str) -> bool {
    matches!(
        name,
        "node_modules"
            | ".git"
            | ".next"
            | "target"
            | "dist"
            | "build"
            | ".turbo"
            | ".idea"
            | ".vscode"
            | ".cargo"
    )
}

fn matches_pattern(path: &str, pattern: &str) -> bool {
    let norm_path = path.replace('\\', "/");
    let norm_pat = pattern.replace('\\', "/");
    let clean_pat = norm_pat.trim_start_matches("./");

    if clean_pat.is_empty() {
        return true;
    }

    if clean_pat.starts_with("*.") {
        let ext = &clean_pat[1..];
        return norm_path.ends_with(ext);
    }

    if let Some(prefix) = clean_pat.strip_suffix("/**") {
        return norm_path.starts_with(prefix) || norm_path.contains(&format!("/{}", prefix));
    }

    norm_path.contains(clean_pat)
}

const MAX_SEARCH_FILES: usize = 20_000;
const MAX_LIST_FILES: usize = 50_000;
const MAX_SEARCH_RESULTS: usize = 20_000;
const MAX_WALK_DIRS: usize = 25_000;
const MAX_WALK_DEPTH: usize = 32;

fn is_word_boundary(c: char) -> bool {
    !c.is_alphanumeric() && c != '_'
}

fn check_whole_word_boundaries(line: &str, orig_start: usize, orig_end: usize) -> bool {
    if orig_start > 0 {
        if let Some(prev_char) = line[..orig_start].chars().next_back() {
            if !is_word_boundary(prev_char) {
                return false;
            }
        }
    }
    if orig_end < line.len() {
        if let Some(next_char) = line[orig_end..].chars().next() {
            if !is_word_boundary(next_char) {
                return false;
            }
        }
    }
    true
}

fn find_matches_in_line(
    line: &str,
    query: &str,
    case_sensitive: bool,
    whole_word: bool,
) -> Vec<(usize, usize)> {
    let mut matches = Vec::new();
    if query.is_empty() || line.is_empty() {
        return matches;
    }

    if case_sensitive {
        let query_len = query.len();
        let mut start = 0;

        while start < line.len() {
            let Some(idx) = line[start..].find(query) else {
                break;
            };
            let abs_start = start + idx;
            let abs_end = abs_start + query_len;

            if !whole_word || check_whole_word_boundaries(line, abs_start, abs_end) {
                matches.push((abs_start, query_len));
            }

            let advance = line[abs_start..]
                .chars()
                .next()
                .map(|c| c.len_utf8())
                .unwrap_or(1);
            start = abs_start + advance;
        }

        return matches;
    }

    let search_query = query.to_lowercase();
    if search_query.is_empty() {
        return matches;
    }

    // Map lowercase byte offsets back to guaranteed UTF-8 character boundaries in `line`.
    let mut search_line = String::with_capacity(line.len());
    let mut lower_start_to_orig: Vec<Option<usize>> = Vec::with_capacity(line.len() + 1);
    let mut lower_end_to_orig: Vec<Option<usize>> = Vec::with_capacity(line.len() + 1);
    lower_start_to_orig.push(None);
    lower_end_to_orig.push(Some(0));

    for (orig_start, ch) in line.char_indices() {
        let orig_end = orig_start + ch.len_utf8();
        let lower_start = search_line.len();
        for lower_ch in ch.to_lowercase() {
            search_line.push(lower_ch);
        }
        let lower_end = search_line.len();

        lower_start_to_orig[lower_start] = Some(orig_start);
        lower_start_to_orig.resize(lower_end + 1, None);
        lower_end_to_orig.resize(lower_end + 1, None);
        lower_end_to_orig[lower_end] = Some(orig_end);
    }

    let query_len = search_query.len();
    let mut start = 0;

    while start < search_line.len() {
        let Some(idx) = search_line[start..].find(&search_query) else {
            break;
        };
        let abs_start = start + idx;
        let abs_end = abs_start + query_len;

        if let (Some(orig_start), Some(orig_end)) = (
            lower_start_to_orig.get(abs_start).copied().flatten(),
            lower_end_to_orig.get(abs_end).copied().flatten(),
        ) {
            if orig_start < orig_end
                && (!whole_word || check_whole_word_boundaries(line, orig_start, orig_end))
            {
                matches.push((orig_start, orig_end - orig_start));
            }
        }

        let advance = search_line[abs_start..]
            .chars()
            .next()
            .map(|c| c.len_utf8())
            .unwrap_or(1);
        start = abs_start + advance;
    }

    matches
}

fn should_prune_excluded_dir(dir_path: &Path, exclude_patterns: &[String]) -> bool {
    if exclude_patterns.is_empty() {
        return false;
    }
    let dir_str = WorkspaceGuard::display_path(dir_path);
    exclude_patterns.iter().any(|pat| {
        let clean = pat.trim_start_matches("./");
        !clean.starts_with("*.") && matches_pattern(&dir_str, pat)
    })
}

struct WalkContext<'a> {
    guard: &'a WorkspaceGuard,
    expected_gen: u64,
    cancel: &'a AtomicBool,
    max_files: usize,
    max_dirs: usize,
    dirs_visited: usize,
    exclude_patterns: &'a [String],
}

fn walk_workspace_files_ctx(
    ctx: &mut WalkContext<'_>,
    dir: &Path,
    files: &mut Vec<PathBuf>,
    depth: usize,
) -> Result<(), FsSecurityError> {
    if files.len() >= ctx.max_files || ctx.dirs_visited >= ctx.max_dirs || depth > MAX_WALK_DEPTH {
        return Ok(());
    }
    if ctx.cancel.load(Ordering::Relaxed) {
        return Err(FsSecurityError::InvalidOperation(
            "Operation cancelled.".to_string(),
        ));
    }
    ctx.guard.ensure_generation(ctx.expected_gen)?;
    ctx.dirs_visited += 1;

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(e) if depth == 0 => {
            return Err(FsSecurityError::Io(format!(
                "Unable to traverse directory '{}': {}",
                WorkspaceGuard::display_path(dir),
                e
            )))
        }
        Err(_) => return Ok(()),
    };

    for entry in entries.flatten() {
        if ctx.cancel.load(Ordering::Relaxed) {
            return Err(FsSecurityError::InvalidOperation(
                "Operation cancelled.".to_string(),
            ));
        }
        ctx.guard.ensure_generation(ctx.expected_gen)?;
        if files.len() >= ctx.max_files || ctx.dirs_visited >= ctx.max_dirs {
            return Ok(());
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        if should_ignore_entry(&file_name) || file_name.starts_with('.') {
            continue;
        }

        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };

        // Never traverse or collect symlinks or junctions
        if file_type.is_symlink() || WorkspaceGuard::is_symlink_or_junction(&path).unwrap_or(true) {
            continue;
        }

        // Never traverse or collect sensitive files/directories
        if SensitivePathPolicy::is_sensitive(&path) {
            continue;
        }

        if file_type.is_dir() {
            if should_prune_excluded_dir(&path, ctx.exclude_patterns) {
                continue;
            }
            walk_workspace_files_ctx(ctx, &path, files, depth + 1)?;
        } else if file_type.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if is_binary_extension(ext) {
                    continue;
                }
            }
            files.push(path);
        }
    }
    Ok(())
}

pub fn fs_search_workspace_with_cancel_impl(
    guard: &WorkspaceGuard,
    root_path: String,
    query: String,
    options: SearchQueryOptions,
    cancel: &AtomicBool,
) -> Result<Vec<WorkspaceSearchMatch>, FsSecurityError> {
    let (root, gen) = guard.validate_workspace_dir_arg(&root_path)?;

    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let regex_matcher = if options.is_regex {
        let mut builder = regex::RegexBuilder::new(&query);
        builder
            .case_insensitive(!options.is_case_sensitive)
            .size_limit(10 * 1024 * 1024);
        match builder.build() {
            Ok(r) => Some(r),
            Err(e) => {
                return Err(FsSecurityError::InvalidOperation(format!(
                    "Invalid regular expression: {}",
                    e
                )))
            }
        }
    } else {
        None
    };

    let max_results = options.max_results.unwrap_or(5000).min(MAX_SEARCH_RESULTS);
    if max_results == 0 {
        return Ok(Vec::new());
    }

    let mut files = Vec::new();
    let mut walk_ctx = WalkContext {
        guard,
        expected_gen: gen,
        cancel,
        max_files: MAX_SEARCH_FILES,
        max_dirs: MAX_WALK_DIRS,
        dirs_visited: 0,
        exclude_patterns: &options.exclude_patterns,
    };
    walk_workspace_files_ctx(&mut walk_ctx, &root, &mut files, 0)?;

    let mut results = Vec::new();

    for file in files {
        if cancel.load(Ordering::Relaxed) {
            return Err(FsSecurityError::InvalidOperation(
                "Operation cancelled.".to_string(),
            ));
        }
        guard.ensure_generation(gen)?;
        if results.len() >= max_results {
            break;
        }

        let file_str = WorkspaceGuard::display_path(&file);

        if !options.include_patterns.is_empty() {
            let matches_any_include = options
                .include_patterns
                .iter()
                .any(|pat| matches_pattern(&file_str, pat));
            if !matches_any_include {
                continue;
            }
        }

        if !options.exclude_patterns.is_empty() {
            let matches_any_exclude = options
                .exclude_patterns
                .iter()
                .any(|pat| matches_pattern(&file_str, pat));
            if matches_any_exclude {
                continue;
            }
        }

        if guard.revalidate_before_op(&file, gen, false).is_err() {
            guard.ensure_generation(gen)?;
            continue;
        }

        let Ok(meta) = fs::symlink_metadata(&file) else {
            continue;
        };
        if !meta.is_file() || meta.len() > 20 * 1024 * 1024 {
            continue;
        }

        let content = match fs::read_to_string(&file) {
            Ok(c) => c,
            Err(_) => continue,
        };
        if detect_binary(content.as_bytes()) {
            continue;
        }

        for (line_idx, line) in content.lines().enumerate() {
            if line_idx % 256 == 0 {
                if cancel.load(Ordering::Relaxed) {
                    return Err(FsSecurityError::InvalidOperation(
                        "Operation cancelled.".to_string(),
                    ));
                }
                guard.ensure_generation(gen)?;
            }
            if results.len() >= max_results {
                break;
            }

            let matches: Vec<(usize, usize)> = if let Some(ref re) = regex_matcher {
                re.find_iter(line)
                    .filter(|m| !m.as_str().is_empty())
                    .map(|m| (m.start(), m.as_str().len()))
                    .collect()
            } else {
                find_matches_in_line(
                    line,
                    &query,
                    options.is_case_sensitive,
                    options.is_whole_word,
                )
            };

            for (col, len) in matches {
                results.push(WorkspaceSearchMatch {
                    file_path: file_str.clone(),
                    line_number: (line_idx + 1) as u32,
                    column: (col + 1) as u32,
                    match_length: len as u32,
                    line_content: line.to_string(),
                });

                if results.len() >= max_results {
                    break;
                }
            }
        }
    }

    Ok(results)
}

pub fn fs_search_workspace_impl(
    guard: &WorkspaceGuard,
    root_path: String,
    query: String,
    options: SearchQueryOptions,
) -> Result<Vec<WorkspaceSearchMatch>, FsSecurityError> {
    let cancel = AtomicBool::new(false);
    fs_search_workspace_with_cancel_impl(guard, root_path, query, options, &cancel)
}

#[tauri::command]
pub async fn fs_search_workspace(
    guard: State<'_, Arc<WorkspaceGuard>>,
    root_path: String,
    query: String,
    options: SearchQueryOptions,
) -> Result<Vec<WorkspaceSearchMatch>, String> {
    let guard = guard.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        fs_search_workspace_impl(&guard, root_path, query, options).map_err(Into::into)
    })
    .await
    .map_err(|e| format!("Failed to execute fs_search_workspace task: {}", e))?
}

fn compute_line_byte_ranges(content: &str) -> Vec<(usize, usize)> {
    let mut ranges = Vec::new();
    let mut offset = 0;
    for raw_line in content.split_inclusive('\n') {
        let stripped = raw_line
            .strip_suffix("\r\n")
            .or_else(|| raw_line.strip_suffix('\n'))
            .unwrap_or(raw_line);
        ranges.push((offset, offset + stripped.len()));
        offset += raw_line.len();
    }
    ranges
}

pub fn fs_replace_in_files_impl(
    guard: &WorkspaceGuard,
    replacements: Vec<FileReplacementPayload>,
) -> Result<ReplaceSummary, FsSecurityError> {
    use std::collections::HashMap;

    let snap = guard.snapshot()?;
    if snap.authorized_roots.is_empty() {
        return Err(FsSecurityError::NoActiveWorkspace);
    }
    let gen = snap.generation;

    if replacements.is_empty() {
        return Ok(ReplaceSummary {
            files_modified: 0,
            occurrences_replaced: 0,
        });
    }

    // Group replacements by raw path first for efficient Phase 1 path validation
    let mut raw_grouped: HashMap<String, Vec<FileReplacementPayload>> = HashMap::new();
    for rep in replacements {
        raw_grouped
            .entry(rep.file_path.clone())
            .or_default()
            .push(rep);
    }

    // Phase 1: Validate EVERY path in the batch independently before modifying ANY file,
    // collapsing equivalent path strings onto the same canonical file target.
    let mut validated_batches: BTreeMap<PathBuf, Vec<FileReplacementPayload>> = BTreeMap::new();
    for (file_path, reps) in raw_grouped {
        let (canonical, file_gen) = guard.validate_existing_file(&file_path, false)?;
        if file_gen != gen {
            return Err(FsSecurityError::StaleWorkspaceToken);
        }
        validated_batches.entry(canonical).or_default().extend(reps);
    }

    // Phase 2: Execute validated replacements with TOCTOU revalidation and byte-span preservation.
    let mut files_modified = 0;
    let mut occurrences_replaced = 0;

    for (canonical_path, mut reps) in validated_batches {
        guard.revalidate_before_op(&canonical_path, gen, false)?;

        let display = WorkspaceGuard::display_path(&canonical_path);
        let content = fs::read_to_string(&canonical_path).map_err(|e| {
            FsSecurityError::Io(format!(
                "Unable to read file for replacement {}: {}",
                display, e
            ))
        })?;

        let line_ranges = compute_line_byte_ranges(&content);

        // Sort replacements bottom-to-top (descending line), then right-to-left (descending column)
        reps.sort_by(|a, b| {
            if a.line_number != b.line_number {
                b.line_number.cmp(&a.line_number)
            } else {
                b.column.cmp(&a.column)
            }
        });

        let mut planned_edits: Vec<(usize, usize, String)> = Vec::new();
        let mut min_edit_start = content.len();

        for rep in reps {
            if rep.line_number == 0 || rep.column == 0 {
                continue;
            }
            let line_idx = (rep.line_number - 1) as usize;
            let Some(&(line_start, line_end)) = line_ranges.get(line_idx) else {
                continue;
            };
            let line = &content[line_start..line_end];
            let col_idx = (rep.column - 1) as usize;
            let match_len = rep.match_length as usize;

            let Some(rel_end) = col_idx.checked_add(match_len) else {
                continue;
            };
            if rel_end > line.len()
                || !line.is_char_boundary(col_idx)
                || !line.is_char_boundary(rel_end)
            {
                continue;
            }

            let abs_start = line_start + col_idx;
            let abs_end = line_start + rel_end;
            if abs_end > min_edit_start {
                continue;
            }

            min_edit_start = abs_start;
            planned_edits.push((abs_start, abs_end, rep.replacement));
        }

        if planned_edits.is_empty() {
            continue;
        }

        let matched_count = planned_edits.len();
        planned_edits.reverse();

        let mut new_content = String::with_capacity(content.len());
        let mut cursor = 0;
        for (abs_start, abs_end, rep_text) in planned_edits {
            new_content.push_str(&content[cursor..abs_start]);
            new_content.push_str(&rep_text);
            cursor = abs_end;
        }
        new_content.push_str(&content[cursor..]);

        if new_content == content {
            continue;
        }

        guard.revalidate_before_op(&canonical_path, gen, false)?;
        fs::write(&canonical_path, new_content.as_bytes()).map_err(|e| {
            FsSecurityError::Io(format!("Unable to save replacement to {}: {}", display, e))
        })?;

        files_modified += 1;
        occurrences_replaced += matched_count;
    }

    Ok(ReplaceSummary {
        files_modified,
        occurrences_replaced,
    })
}

#[tauri::command]
pub async fn fs_replace_in_files(
    guard: State<'_, Arc<WorkspaceGuard>>,
    replacements: Vec<FileReplacementPayload>,
) -> Result<ReplaceSummary, String> {
    let guard = guard.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        fs_replace_in_files_impl(&guard, replacements).map_err(Into::into)
    })
    .await
    .map_err(|e| format!("Failed to execute fs_replace_in_files task: {}", e))?
}

pub fn fs_list_workspace_files_impl(
    guard: &WorkspaceGuard,
    root_path: String,
    max_files: Option<usize>,
) -> Result<Vec<String>, FsSecurityError> {
    let (root, gen) = guard.validate_workspace_dir_arg(&root_path)?;
    let limit = max_files.unwrap_or(15_000).min(MAX_LIST_FILES);
    if limit == 0 {
        return Ok(Vec::new());
    }
    let cancel = AtomicBool::new(false);
    let empty_excludes: Vec<String> = Vec::new();
    let mut files = Vec::new();
    let mut walk_ctx = WalkContext {
        guard,
        expected_gen: gen,
        cancel: &cancel,
        max_files: limit,
        max_dirs: MAX_WALK_DIRS,
        dirs_visited: 0,
        exclude_patterns: &empty_excludes,
    };
    walk_workspace_files_ctx(&mut walk_ctx, &root, &mut files, 0)?;

    let result = files
        .into_iter()
        .map(|f| WorkspaceGuard::display_path(&f))
        .collect();

    Ok(result)
}

#[tauri::command]
pub async fn fs_list_workspace_files(
    guard: State<'_, Arc<WorkspaceGuard>>,
    root_path: String,
    max_files: Option<usize>,
) -> Result<Vec<String>, String> {
    let guard = guard.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        fs_list_workspace_files_impl(&guard, root_path, max_files).map_err(Into::into)
    })
    .await
    .map_err(|e| format!("Failed to execute fs_list_workspace_files task: {}", e))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_guard_with_dir(name: &str) -> (WorkspaceGuard, PathBuf) {
        let temp_dir = std::env::temp_dir().join(name);
        let _ = fs::remove_dir_all(&temp_dir);
        fs::create_dir_all(&temp_dir).unwrap();
        let guard = WorkspaceGuard::new();
        let info = guard
            .open_workspace(&temp_dir.to_string_lossy(), Some("test-ws".to_string()))
            .unwrap();
        (guard, PathBuf::from(info.root_path))
    }

    #[test]
    fn test_create_read_and_delete_file() {
        let (guard, temp_dir) = setup_guard_with_dir("kairo_fs_test_1");
        let test_file = temp_dir.join("test.txt");

        let res = fs_create_file_impl(&guard, test_file.to_string_lossy().to_string());
        assert!(res.is_ok());

        // Attempt duplicate creation should fail
        let res_dup = fs_create_file_impl(&guard, test_file.to_string_lossy().to_string());
        assert!(res_dup.is_err());

        // Read directory
        let entries =
            fs_read_directory_impl(&guard, temp_dir.to_string_lossy().to_string(), Some(false))
                .unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "test.txt");
        assert!(!entries[0].is_directory);

        // Delete
        let del = fs_delete_impl(&guard, test_file.to_string_lossy().to_string(), false);
        assert!(del.is_ok());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_duplicate_file() {
        let (guard, temp_dir) = setup_guard_with_dir("kairo_fs_test_dup");
        let original = temp_dir.join("main.rs");
        fs::write(&original, "fn main() {}").unwrap();

        let dup1 = fs_duplicate_impl(&guard, original.to_string_lossy().to_string()).unwrap();
        assert!(dup1.ends_with("main copy.rs"));

        let dup2 = fs_duplicate_impl(&guard, original.to_string_lossy().to_string()).unwrap();
        assert!(dup2.ends_with("main copy 2.rs"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_prevent_copy_into_descendant() {
        let (guard, temp_dir) = setup_guard_with_dir("kairo_fs_test_descendant");
        let parent = temp_dir.join("parent");
        let child = parent.join("child");
        fs::create_dir_all(&child).unwrap();

        let res = fs_copy_impl(
            &guard,
            parent.to_string_lossy().to_string(),
            child.join("sub").to_string_lossy().to_string(),
        );
        assert!(res.is_err());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_read_and_write_file() {
        let (guard, temp_dir) = setup_guard_with_dir("kairo_fs_test_read_write");
        let test_file = temp_dir.join("hello.ts");

        let write_res = fs_write_file_impl(
            &guard,
            test_file.to_string_lossy().to_string(),
            "export const msg = 'Hello Kairo';".to_string(),
        );
        assert!(write_res.is_ok());

        let read_res = fs_read_file_impl(&guard, test_file.to_string_lossy().to_string()).unwrap();
        assert_eq!(read_res.content, "export const msg = 'Hello Kairo';");
        assert!(!read_res.is_binary);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_binary_detection() {
        let (guard, temp_dir) = setup_guard_with_dir("kairo_fs_test_bin");
        let bin_file = temp_dir.join("image.png");
        fs::write(&bin_file, [0x89, 0x50, 0x4E, 0x47, 0x00, 0x00]).unwrap();

        let read_res = fs_read_file_impl(&guard, bin_file.to_string_lossy().to_string()).unwrap();
        assert!(read_res.is_binary);
        assert_eq!(read_res.content, "");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_search_and_replace_workspace() {
        let (guard, temp_dir) = setup_guard_with_dir("kairo_fs_test_search_rep");
        let src_dir = temp_dir.join("src");
        fs::create_dir_all(&src_dir).unwrap();
        let file1 = src_dir.join("app.ts");
        let file2 = src_dir.join("util.ts");

        fs::write(
            &file1,
            "const message = 'apple pie';\nconsole.log(message);",
        )
        .unwrap();
        fs::write(&file2, "export const appleCount = 10;").unwrap();

        let options = SearchQueryOptions {
            is_case_sensitive: false,
            is_whole_word: false,
            is_regex: false,
            include_patterns: vec![],
            exclude_patterns: vec![],
            max_results: Some(100),
        };

        let matches = fs_search_workspace_impl(
            &guard,
            temp_dir.to_string_lossy().to_string(),
            "apple".to_string(),
            options,
        )
        .unwrap();

        assert_eq!(matches.len(), 2);

        let replacements = vec![FileReplacementPayload {
            file_path: file1.to_string_lossy().to_string(),
            line_number: 1,
            column: 18,
            match_length: 5,
            replacement: "cherry".to_string(),
        }];

        let rep_summary = fs_replace_in_files_impl(&guard, replacements).unwrap();
        assert_eq!(rep_summary.files_modified, 1);
        assert_eq!(rep_summary.occurrences_replaced, 1);

        let updated = fs::read_to_string(&file1).unwrap();
        assert!(updated.contains("cherry pie"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_list_workspace_files() {
        let (guard, temp_dir) = setup_guard_with_dir("kairo_fs_test_list");
        let sub = temp_dir.join("sub");
        fs::create_dir_all(&sub).unwrap();

        fs::write(temp_dir.join("a.txt"), "a").unwrap();
        fs::write(sub.join("b.ts"), "b").unwrap();

        let files =
            fs_list_workspace_files_impl(&guard, temp_dir.to_string_lossy().to_string(), None)
                .unwrap();
        assert_eq!(files.len(), 2);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_get_metadata_and_move_conflict() {
        let (guard, temp_dir) = setup_guard_with_dir("kairo_fs_test_meta");

        let file1 = temp_dir.join("hello.txt");
        fs::write(&file1, "Hello World!").unwrap();

        let meta = fs_get_metadata_impl(&guard, file1.to_string_lossy().to_string()).unwrap();
        assert_eq!(meta.name, "hello.txt");
        assert!(!meta.is_directory);
        assert_eq!(meta.size, 12);
        assert_eq!(meta.file_count, 1);

        let dir_meta =
            fs_get_metadata_impl(&guard, temp_dir.to_string_lossy().to_string()).unwrap();
        assert!(dir_meta.is_directory);
        assert_eq!(dir_meta.file_count, 1);
        assert_eq!(dir_meta.size, 12);

        // Test destination conflict
        let file2 = temp_dir.join("existing.txt");
        fs::write(&file2, "I am already here").unwrap();

        let move_err = fs_move_impl(
            &guard,
            file1.to_string_lossy().to_string(),
            file2.to_string_lossy().to_string(),
        );
        assert!(move_err.is_err());
        assert!(move_err.unwrap_err().to_string().contains("already exists"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_find_matches_unicode_and_emojis() {
        let line = "const 🚀 = 'apple'; const 🍎 = 'apple';";
        let matches = find_matches_in_line(line, "apple", true, false);
        assert_eq!(matches.len(), 2);
    }

    #[test]
    fn test_replace_char_boundary_safety() {
        let (guard, temp_dir) = setup_guard_with_dir("kairo_fs_test_unicode_rep");
        let test_file = temp_dir.join("unicode.txt");
        fs::write(&test_file, "Hello 🌍 world! 🚀").unwrap();

        let replacements = vec![FileReplacementPayload {
            file_path: test_file.to_string_lossy().to_string(),
            line_number: 1,
            column: 1,
            match_length: 5,
            replacement: "Greetings".to_string(),
        }];

        let summary = fs_replace_in_files_impl(&guard, replacements).unwrap();
        assert_eq!(summary.files_modified, 1);
        assert_eq!(summary.occurrences_replaced, 1);

        let content = fs::read_to_string(&test_file).unwrap();
        assert!(content.starts_with("Greetings 🌍 world!"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_search_workspace_regex() {
        let (guard, temp_dir) = setup_guard_with_dir("kairo_fs_test_regex");
        let test_file = temp_dir.join("regex_test.txt");
        fs::write(
            &test_file,
            "fn handle_event_1() {}\nfn handle_event_2() {}\nfn ignore_this() {}",
        )
        .unwrap();

        let options = SearchQueryOptions {
            is_case_sensitive: true,
            is_whole_word: false,
            is_regex: true,
            include_patterns: vec![],
            exclude_patterns: vec![],
            max_results: None,
        };

        let matches = fs_search_workspace_impl(
            &guard,
            temp_dir.to_string_lossy().to_string(),
            r"handle_event_\d+".to_string(),
            options,
        )
        .unwrap();

        assert_eq!(matches.len(), 2);
        assert_eq!(matches[0].match_length, 14);
        assert_eq!(matches[1].match_length, 14);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_find_matches_unicode_dotted_i_and_byte_length_changes() {
        // Capital dotted I ('İ', 2 UTF-8 bytes) lowercases to "i\u{307}" (3 UTF-8 bytes).
        // Previously slicing `line` with lowercase byte offsets panicked or misindexed.
        let line1 = "İapple";
        let m1 = find_matches_in_line(line1, "apple", false, false);
        assert_eq!(m1, vec![(2, 5)]);
        assert_eq!(&line1[m1[0].0..m1[0].0 + m1[0].1], "apple");

        // Whole-word case-insensitive check across preceding/following multibyte chars
        let line2 = "prefix İ suffix İend";
        let m2 = find_matches_in_line(line2, "SUFFIX", false, true);
        assert_eq!(m2.len(), 1);
        assert_eq!(&line2[m2[0].0..m2[0].0 + m2[0].1], "suffix");

        // Multi-byte -> single-byte/fewer-byte lowercase conversion ('K' 3->1, 'ẞ' 3->2) & emojis
        let line3 = "KELVIN and \u{1E9E} 🚀 ﬁle İ";
        let kelvin = find_matches_in_line(line3, "kelvin", false, true);
        assert_eq!(kelvin, vec![(0, 8)]);
        assert_eq!(&line3[kelvin[0].0..kelvin[0].0 + kelvin[0].1], "KELVIN");

        let sharp_s = find_matches_in_line(line3, "ß", false, true);
        assert_eq!(sharp_s.len(), 1);
        assert_eq!(
            &line3[sharp_s[0].0..sharp_s[0].0 + sharp_s[0].1],
            "\u{1E9E}"
        );
        assert_eq!(sharp_s[0].1, 3);

        let file_lig = find_matches_in_line(line3, "ﬁle", false, true);
        assert_eq!(file_lig.len(), 1);
        assert_eq!(&line3[file_lig[0].0..file_lig[0].0 + file_lig[0].1], "ﬁle");

        // Partial slice into single expanded char must be rejected safely without panicking
        assert!(find_matches_in_line("İ", "i", false, false).is_empty());
        assert_eq!(
            find_matches_in_line("İ", "i\u{307}", false, false),
            vec![(0, 2)]
        );

        // Case-sensitive mode only matches exact case
        let cs_line = "İapple Apple apple";
        let cs_matches = find_matches_in_line(cs_line, "apple", true, false);
        assert_eq!(cs_matches.len(), 2);
        for (start, len) in cs_matches {
            assert_eq!(&cs_line[start..start + len], "apple");
        }
    }

    #[test]
    fn test_unicode_search_then_replace_roundtrip() {
        let (guard, temp_dir) = setup_guard_with_dir("kairo_fs_test_unicode_search_rep");
        let file = temp_dir.join("unicode_dotted.txt");
        fs::write(&file, "İ alpha İ\nKELVIN test\n").unwrap();

        let options = SearchQueryOptions {
            is_case_sensitive: false,
            is_whole_word: true,
            is_regex: false,
            include_patterns: vec![],
            exclude_patterns: vec![],
            max_results: None,
        };
        let matches = fs_search_workspace_impl(
            &guard,
            temp_dir.to_string_lossy().to_string(),
            "alpha".to_string(),
            options,
        )
        .unwrap();
        assert_eq!(matches.len(), 1);
        assert_eq!(matches[0].line_number, 1);
        assert_eq!(matches[0].column, 4); // "İ " is 3 bytes -> 1-based byte column = 4

        let summary = fs_replace_in_files_impl(
            &guard,
            vec![FileReplacementPayload {
                file_path: matches[0].file_path.clone(),
                line_number: matches[0].line_number,
                column: matches[0].column,
                match_length: matches[0].match_length,
                replacement: "omega".to_string(),
            }],
        )
        .unwrap();
        assert_eq!(summary.files_modified, 1);
        assert_eq!(summary.occurrences_replaced, 1);
        assert_eq!(
            fs::read_to_string(&file).unwrap(),
            "İ omega İ\nKELVIN test\n"
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_replace_preserves_crlf_lf_multiple_and_empty_replacements() {
        let (guard, temp_dir) = setup_guard_with_dir("kairo_fs_test_crlf_lf");

        // 1. CRLF file with trailing CRLF
        let crlf_file = temp_dir.join("crlf.txt");
        fs::write(&crlf_file, "foo one\r\nuntouched line\r\nfoo two foo\r\n").unwrap();

        // 2. LF file without trailing newline
        let lf_file = temp_dir.join("lf.txt");
        fs::write(&lf_file, "alpha foo beta\nsecond foo").unwrap();

        // 3. Empty replacement (deletion) in CRLF file
        let del_file = temp_dir.join("delete.txt");
        fs::write(&del_file, "keep [remove] end\r\nnext\r\n").unwrap();

        let summary = fs_replace_in_files_impl(
            &guard,
            vec![
                FileReplacementPayload {
                    file_path: crlf_file.to_string_lossy().to_string(),
                    line_number: 1,
                    column: 1,
                    match_length: 3,
                    replacement: "bar".to_string(),
                },
                FileReplacementPayload {
                    file_path: crlf_file.to_string_lossy().to_string(),
                    line_number: 3,
                    column: 1,
                    match_length: 3,
                    replacement: "baz".to_string(),
                },
                FileReplacementPayload {
                    file_path: crlf_file.to_string_lossy().to_string(),
                    line_number: 3,
                    column: 9,
                    match_length: 3,
                    replacement: "qux".to_string(),
                },
                FileReplacementPayload {
                    file_path: lf_file.to_string_lossy().to_string(),
                    line_number: 2,
                    column: 8,
                    match_length: 3,
                    replacement: "LF".to_string(),
                },
                FileReplacementPayload {
                    file_path: del_file.to_string_lossy().to_string(),
                    line_number: 1,
                    column: 6,
                    match_length: 8,
                    replacement: "".to_string(),
                },
            ],
        )
        .unwrap();

        assert_eq!(summary.files_modified, 3);
        assert_eq!(summary.occurrences_replaced, 5);
        assert_eq!(
            fs::read_to_string(&crlf_file).unwrap(),
            "bar one\r\nuntouched line\r\nbaz two qux\r\n"
        );
        assert_eq!(
            fs::read_to_string(&lf_file).unwrap(),
            "alpha foo beta\nsecond LF"
        );
        assert_eq!(
            fs::read_to_string(&del_file).unwrap(),
            "keep  end\r\nnext\r\n"
        );

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_replace_skips_write_when_no_matches_or_unchanged() {
        let (guard, temp_dir) = setup_guard_with_dir("kairo_fs_test_no_rewrite");
        let ro_file = temp_dir.join("readonly.txt");
        let original_crlf = "line one\r\nline two\r\n";
        fs::write(&ro_file, original_crlf).unwrap();

        // Mark file read-only so any accidental fs::write call fails deterministically
        let mut perms = fs::metadata(&ro_file).unwrap().permissions();
        perms.set_readonly(true);
        fs::set_permissions(&ro_file, perms).unwrap();

        // Invalid line/col (no-match) and identical replacement must NOT touch disk
        let summary = fs_replace_in_files_impl(
            &guard,
            vec![
                FileReplacementPayload {
                    file_path: ro_file.to_string_lossy().to_string(),
                    line_number: 99,
                    column: 1,
                    match_length: 4,
                    replacement: "nope".to_string(),
                },
                FileReplacementPayload {
                    file_path: ro_file.to_string_lossy().to_string(),
                    line_number: 1,
                    column: 1,
                    match_length: 4,
                    replacement: "line".to_string(),
                },
            ],
        )
        .expect("No-op replacements must not attempt to write read-only file");

        assert_eq!(summary.files_modified, 0);
        assert_eq!(summary.occurrences_replaced, 0);
        assert_eq!(fs::read_to_string(&ro_file).unwrap(), original_crlf);

        let mut reset_perms = fs::metadata(&ro_file).unwrap().permissions();
        #[allow(clippy::permissions_set_readonly_false)]
        reset_perms.set_readonly(false);
        fs::set_permissions(&ro_file, reset_perms).unwrap();
        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_search_and_list_limits_cancellation_and_async_offload() {
        let (guard, temp_dir) = setup_guard_with_dir("kairo_fs_test_large_async");

        // Create nested files across 10 directories (100 files total)
        for d in 0..10 {
            let sub = temp_dir.join(format!("dir_{}", d));
            fs::create_dir_all(&sub).unwrap();
            for f in 0..10 {
                fs::write(
                    sub.join(format!("file_{}.rs", f)),
                    format!("fn item_{}_{}() {{ let needle = 1; }}\n", d, f),
                )
                .unwrap();
            }
        }
        // Excluded dir should be pruned cleanly
        let ignored = temp_dir.join("vendor");
        fs::create_dir_all(&ignored).unwrap();
        fs::write(ignored.join("ignored.rs"), "needle inside vendor").unwrap();

        let listed_capped =
            fs_list_workspace_files_impl(&guard, temp_dir.to_string_lossy().to_string(), Some(25))
                .unwrap();
        assert_eq!(listed_capped.len(), 25);

        let options = SearchQueryOptions {
            is_case_sensitive: true,
            is_whole_word: true,
            is_regex: false,
            include_patterns: vec![],
            exclude_patterns: vec!["vendor/**".to_string()],
            max_results: Some(15),
        };

        let guard_arc = Arc::new(guard);
        let root_str = temp_dir.to_string_lossy().to_string();

        // Execute through Tauri's blocking task pool to confirm non-UI async offload path
        let guard_for_async = Arc::clone(&guard_arc);
        let root_for_async = root_str.clone();
        let async_matches = tauri::async_runtime::block_on(async move {
            tauri::async_runtime::spawn_blocking(move || {
                fs_search_workspace_impl(
                    &guard_for_async,
                    root_for_async,
                    "needle".to_string(),
                    options,
                )
            })
            .await
            .expect("join blocking task")
        })
        .expect("async workspace search should succeed");
        assert_eq!(async_matches.len(), 15);
        assert!(!async_matches.iter().any(|m| m.file_path.contains("vendor")));

        // Verify cooperative cancellation aborts cleanly
        let cancel = AtomicBool::new(true);
        let cancel_res = fs_search_workspace_with_cancel_impl(
            &guard_arc,
            root_str,
            "needle".to_string(),
            SearchQueryOptions {
                is_case_sensitive: true,
                is_whole_word: false,
                is_regex: false,
                include_patterns: vec![],
                exclude_patterns: vec![],
                max_results: None,
            },
            &cancel,
        );
        assert!(cancel_res.is_err());

        // Verify depth-0 traversal error propagation on unreadable/non-existent directory
        let missing_dir = temp_dir.join("does_not_exist");
        let empty_excludes = Vec::new();
        let mut out = Vec::new();
        let mut walk_ctx = WalkContext {
            guard: &guard_arc,
            expected_gen: guard_arc.snapshot().unwrap().generation,
            cancel: &AtomicBool::new(false),
            max_files: 100,
            max_dirs: 100,
            dirs_visited: 0,
            exclude_patterns: &empty_excludes,
        };
        assert!(walk_workspace_files_ctx(&mut walk_ctx, &missing_dir, &mut out, 0).is_err());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_binary_chunk_and_search_respect_bounds_and_offsets() {
        let temp_dir = std::env::temp_dir().join(format!(
            "kairo_bin_test_{}",
            std::time::SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&temp_dir).unwrap();
        let bin_path = temp_dir.join("sample.bin");
        let payload: Vec<u8> = vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
            0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
            0x89, 0x50, 0x4E, 0x47,
        ];
        fs::write(&bin_path, &payload).unwrap();

        let guard = WorkspaceGuard::new();
        guard
            .open_workspace(&temp_dir.to_string_lossy(), None)
            .unwrap();
        let path_str = bin_path.to_string_lossy().to_string();

        // Read middle slice
        let chunk = fs_read_binary_chunk_impl(&guard, path_str.clone(), 8, 8).unwrap();
        assert_eq!(chunk.offset, 8);
        assert_eq!(chunk.total_size, 20);
        assert_eq!(chunk.bytes, vec![0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52]);

        // Past-EOF read returns empty bytes safely
        let eof_chunk = fs_read_binary_chunk_impl(&guard, path_str.clone(), 100, 16).unwrap();
        assert!(eof_chunk.bytes.is_empty());
        assert_eq!(eof_chunk.total_size, 20);

        // Search for PNG magic header
        let search_res = fs_search_binary_impl(&guard, path_str, vec![0x89, 0x50, 0x4E, 0x47], None).unwrap();
        assert_eq!(search_res.offsets, vec![0, 16]);
        assert!(!search_res.truncated);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
