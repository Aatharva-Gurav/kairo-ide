use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

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

fn normalize_path_for_compare(p: &Path) -> PathBuf {
    let s = p.to_string_lossy().replace('/', "\\");
    let clean = if let Some(stripped) = s.strip_prefix(r"\\?\") {
        stripped.to_string()
    } else {
        s
    };
    PathBuf::from(clean.to_lowercase())
}

fn is_descendant(parent: &Path, child: &Path) -> bool {
    let parent_norm = parent
        .canonicalize()
        .map(|p| normalize_path_for_compare(&p))
        .unwrap_or_else(|_| normalize_path_for_compare(parent));

    let child_norm = normalize_path_for_compare(child);

    if child_norm.starts_with(&parent_norm) {
        return true;
    }

    // Walk up child parents to see if any ancestor matches parent
    let mut curr = child.to_path_buf();
    while let Some(par) = curr.parent() {
        let par_norm = par
            .canonicalize()
            .map(|p| normalize_path_for_compare(&p))
            .unwrap_or_else(|_| normalize_path_for_compare(par));

        if par_norm.starts_with(&parent_norm) {
            return true;
        }
        curr = par.to_path_buf();
    }

    false
}

fn copy_dir_all(src: &Path, dst: &Path) -> std::io::Result<()> {
    if !dst.exists() {
        fs::create_dir_all(dst)?;
    }
    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let entry_path = entry.path();
        let dest_path = dst.join(entry.file_name());

        if is_descendant(&entry_path, &dest_path) {
            continue;
        }

        if file_type.is_dir() {
            copy_dir_all(&entry_path, &dest_path)?;
        } else {
            fs::copy(entry_path, dest_path)?;
        }
    }
    Ok(())
}


#[tauri::command]
pub fn fs_read_directory(path: String, show_hidden: Option<bool>) -> Result<Vec<FileEntry>, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }
    if !p.is_dir() {
        return Err(format!("Path is not a directory: {}", path));
    }

    let include_hidden = show_hidden.unwrap_or(false);
    let mut entries = Vec::new();

    let read_dir = fs::read_dir(p).map_err(|e| format!("Unable to read directory: {}", e))?;

    for item in read_dir {
        let entry = match item {
            Ok(e) => e,
            Err(_) => continue,
        };

        let file_name = entry.file_name().to_string_lossy().to_string();

        if !include_hidden && file_name.starts_with('.') {
            continue;
        }

        let entry_path = entry.path();
        let metadata = entry.metadata().ok();
        let is_dir = metadata.as_ref().map(|m| m.is_dir()).unwrap_or(false);
        let size = if !is_dir {
            metadata.as_ref().map(|m| m.len())
        } else {
            None
        };
        let modified_at = metadata.as_ref().and_then(get_modified_time);

        entries.push(FileEntry {
            name: file_name,
            path: entry_path.to_string_lossy().to_string(),
            is_directory: is_dir,
            size,
            modified_at,
        });
    }

    // Sort: directories first (alphabetical case-insensitive), then files (alphabetical case-insensitive)
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
pub fn fs_create_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err("A file or directory already exists at this path.".to_string());
    }

    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Unable to create parent directories: {}", e))?;
        }
    }

    fs::File::create(p)
        .map_err(|e| format!("Unable to create file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn fs_create_directory(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err("A file or directory already exists at this path.".to_string());
    }

    fs::create_dir_all(p)
        .map_err(|e| format!("Unable to create directory: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn fs_rename(old_path: String, new_path: String) -> Result<(), String> {
    let src = Path::new(&old_path);
    let dest = Path::new(&new_path);

    if !src.exists() {
        return Err("The item to rename does not exist.".to_string());
    }
    if dest.exists() {
        return Err("An item with the destination name already exists.".to_string());
    }

    fs::rename(src, dest)
        .map_err(|e| format!("Unable to rename item: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn fs_delete(path: String, is_dir: bool) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("Item does not exist.".to_string());
    }

    if is_dir {
        fs::remove_dir_all(p)
            .map_err(|e| format!("Unable to delete directory: {}", e))?;
    } else {
        fs::remove_file(p)
            .map_err(|e| format!("Unable to delete file: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn fs_copy(src_path: String, dest_path: String) -> Result<(), String> {
    let src = Path::new(&src_path);
    let dest = Path::new(&dest_path);

    if !src.exists() {
        return Err("Source does not exist.".to_string());
    }

    if src.is_dir() {
        if is_descendant(src, dest) {
            return Err("Cannot copy a directory into itself or one of its subdirectories.".to_string());
        }
        copy_dir_all(src, dest)
            .map_err(|e| format!("Unable to copy directory: {}", e))?;
    } else {
        if let Some(parent) = dest.parent() {
            if !parent.exists() {
                let _ = fs::create_dir_all(parent);
            }
        }
        fs::copy(src, dest)
            .map_err(|e| format!("Unable to copy file: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn fs_move(src_path: String, dest_path: String) -> Result<(), String> {
    let src = Path::new(&src_path);
    let dest = Path::new(&dest_path);

    if !src.exists() {
        return Err("Source does not exist.".to_string());
    }

    if src.is_dir() && is_descendant(src, dest) {
        return Err("Cannot move a directory into itself or one of its subdirectories.".to_string());
    }

    if let Some(parent) = dest.parent() {
        if !parent.exists() {
            let _ = fs::create_dir_all(parent);
        }
    }

    // Try atomic rename first
    if fs::rename(src, dest).is_err() {
        // Fallback to copy and remove (e.g. across drives/mount points)
        if src.is_dir() {
            copy_dir_all(src, dest).map_err(|e| format!("Unable to move directory: {}", e))?;
            fs::remove_dir_all(src).map_err(|e| format!("Failed to remove source directory: {}", e))?;
        } else {
            fs::copy(src, dest).map_err(|e| format!("Unable to move file: {}", e))?;
            fs::remove_file(src).map_err(|e| format!("Failed to remove source file: {}", e))?;
        }
    }

    Ok(())
}

#[tauri::command]
pub fn fs_duplicate(src_path: String) -> Result<String, String> {
    let src = Path::new(&src_path);
    if !src.exists() {
        return Err("File to duplicate does not exist.".to_string());
    }

    let parent = src.parent().ok_or_else(|| "Cannot duplicate root path".to_string())?;
    let stem = src.file_stem().and_then(|s| s.to_str()).unwrap_or("file");
    let ext = src.extension().and_then(|e| e.to_str());

    let mut counter = 1;
    loop {
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

        let candidate: PathBuf = parent.join(&new_name);
        if !candidate.exists() {
            if src.is_dir() {
                copy_dir_all(src, &candidate)
                    .map_err(|e| format!("Unable to duplicate directory: {}", e))?;
            } else {
                fs::copy(src, &candidate)
                    .map_err(|e| format!("Unable to duplicate file: {}", e))?;
            }
            return Ok(candidate.to_string_lossy().to_string());
        }
        counter += 1;
        if counter > 100 {
            return Err("Failed to find available duplicate filename.".to_string());
        }
    }
}

#[tauri::command]
pub fn fs_reveal(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("Item does not exist.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let formatted = p.to_string_lossy().replace('/', "\\");

        let mut cmd = std::process::Command::new("explorer");
        if p.is_dir() && p.parent().is_none() {
            cmd.raw_arg(format!("\"{}\"", formatted));
        } else {
            cmd.raw_arg(format!("/select,\"{}\"", formatted));
        }
        cmd.spawn()
            .map_err(|e| format!("Failed to reveal item in file manager: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to reveal item in file manager: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        let parent = if p.is_dir() { p } else { p.parent().unwrap_or(p) };
        std::process::Command::new("xdg-open")
            .arg(parent)
            .spawn()
            .map_err(|e| format!("Failed to reveal item in file manager: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn fs_exists(path: String) -> Result<bool, String> {
    Ok(Path::new(&path).exists())
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
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "ico" | "tiff"
            | "pdf" | "zip" | "tar" | "gz" | "7z" | "rar" | "bz2" | "xz"
            | "exe" | "dll" | "so" | "dylib" | "bin" | "iso" | "dmg"
            | "woff" | "woff2" | "ttf" | "otf" | "eot"
            | "mp3" | "mp4" | "wav" | "flac" | "ogg" | "avi" | "mov" | "webm" | "mkv"
            | "wasm" | "class" | "pyc" | "o" | "obj" | "lib" | "a" | "pdb"
    )
}

fn detect_binary(bytes: &[u8]) -> bool {
    let check_len = std::cmp::min(bytes.len(), 8192);
    for &b in &bytes[..check_len] {
        if b == 0 {
            return true;
        }
    }
    false
}

#[tauri::command]
pub fn fs_read_file(path: String) -> Result<FileContentResult, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("File does not exist: {}", path));
    }
    if !p.is_file() {
        return Err(format!("Path is not a file: {}", path));
    }

    let metadata = fs::metadata(p).map_err(|e| format!("Unable to read file metadata: {}", e))?;
    let size = metadata.len();
    let readonly = metadata.permissions().readonly();

    // 20 MB safeguard
    if size > 20 * 1024 * 1024 {
        return Err("File is too large (>20 MB) to open in editor.".to_string());
    }

    if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
        if is_binary_extension(ext) {
            return Ok(FileContentResult {
                content: String::new(),
                is_binary: true,
                size,
                readonly,
            });
        }
    }

    let bytes = fs::read(p).map_err(|e| format!("Unable to read file: {}", e))?;

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
pub fn fs_write_file(path: String, content: String) -> Result<(), String> {
    let p = Path::new(&path);
    if let Some(parent) = p.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Unable to create parent directories: {}", e))?;
        }
    }

    fs::write(p, content.as_bytes())
        .map_err(|e| format!("Unable to write file: {}", e))?;

    Ok(())
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

    if clean_pat.ends_with("/**") {
        let prefix = &clean_pat[..clean_pat.len() - 3];
        return norm_path.starts_with(prefix) || norm_path.contains(&format!("/{}", prefix));
    }

    norm_path.contains(clean_pat)
}

fn is_word_boundary(c: char) -> bool {
    !c.is_alphanumeric() && c != '_'
}

fn find_matches_in_line(
    line: &str,
    query: &str,
    case_sensitive: bool,
    whole_word: bool,
) -> Vec<(usize, usize)> {
    let mut matches = Vec::new();
    if query.is_empty() {
        return matches;
    }

    let search_line = if case_sensitive {
        line.to_string()
    } else {
        line.to_lowercase()
    };
    let search_query = if case_sensitive {
        query.to_string()
    } else {
        query.to_lowercase()
    };

    let query_len = search_query.len();
    let mut start = 0;

    while let Some(idx) = search_line[start..].find(&search_query) {
        let abs_start = start + idx;
        let abs_end = abs_start + query_len;

        let mut valid = true;
        if whole_word {
            // Check previous character
            if abs_start > 0 {
                if let Some(prev_char) = line[..abs_start].chars().last() {
                    if !is_word_boundary(prev_char) {
                        valid = false;
                    }
                }
            }
            // Check next character
            if abs_end < line.len() {
                if let Some(next_char) = line[abs_end..].chars().next() {
                    if !is_word_boundary(next_char) {
                        valid = false;
                    }
                }
            }
        }

        if valid {
            matches.push((abs_start, query_len));
        }

        start = abs_start + 1;
        if start >= search_line.len() {
            break;
        }
    }

    matches
}

fn walk_workspace_files(
    dir: &Path,
    files: &mut Vec<PathBuf>,
    max_count: usize,
) {
    if files.len() >= max_count {
        return;
    }

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return,
    };

    for entry in entries.flatten() {
        if files.len() >= max_count {
            return;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        if should_ignore_entry(&file_name) || file_name.starts_with('.') {
            continue;
        }

        let path = entry.path();
        if path.is_dir() {
            walk_workspace_files(&path, files, max_count);
        } else if path.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if is_binary_extension(ext) {
                    continue;
                }
            }
            files.push(path);
        }
    }
}

#[tauri::command]
pub fn fs_search_workspace(
    root_path: String,
    query: String,
    options: SearchQueryOptions,
) -> Result<Vec<WorkspaceSearchMatch>, String> {
    let p = Path::new(&root_path);
    if !p.exists() || !p.is_dir() {
        return Err("Search directory does not exist or is not a directory.".to_string());
    }

    if query.trim().is_empty() {
        return Ok(Vec::new());
    }

    let max_results = options.max_results.unwrap_or(5000);
    let mut files = Vec::new();
    walk_workspace_files(p, &mut files, 20_000);

    let mut results = Vec::new();

    for file in files {
        if results.len() >= max_results {
            break;
        }

        let file_str = file.to_string_lossy().to_string();

        // Check include patterns
        if !options.include_patterns.is_empty() {
            let matches_any_include = options
                .include_patterns
                .iter()
                .any(|pat| matches_pattern(&file_str, pat));
            if !matches_any_include {
                continue;
            }
        }

        // Check exclude patterns
        if !options.exclude_patterns.is_empty() {
            let matches_any_exclude = options
                .exclude_patterns
                .iter()
                .any(|pat| matches_pattern(&file_str, pat));
            if matches_any_exclude {
                continue;
            }
        }

        let content = match fs::read_to_string(&file) {
            Ok(c) => c,
            Err(_) => continue, // Skip binary / unreadable files
        };

        for (line_idx, line) in content.lines().enumerate() {
            if results.len() >= max_results {
                break;
            }

            let matches = find_matches_in_line(
                line,
                &query,
                options.is_case_sensitive,
                options.is_whole_word,
            );

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

#[tauri::command]
pub fn fs_replace_in_files(
    replacements: Vec<FileReplacementPayload>,
) -> Result<ReplaceSummary, String> {
    use std::collections::HashMap;

    let mut file_replacements: HashMap<String, Vec<FileReplacementPayload>> = HashMap::new();
    for rep in replacements {
        file_replacements.entry(rep.file_path.clone()).or_default().push(rep);
    }

    let mut files_modified = 0;
    let mut occurrences_replaced = 0;

    for (file_path, mut reps) in file_replacements {
        let p = Path::new(&file_path);
        if !p.exists() {
            continue;
        }

        let content = fs::read_to_string(p)
            .map_err(|e| format!("Unable to read file for replacement {}: {}", file_path, e))?;

        let mut lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();

        // Sort replacements bottom-to-top (descending line), then right-to-left (descending column)
        reps.sort_by(|a, b| {
            if a.line_number != b.line_number {
                b.line_number.cmp(&a.line_number)
            } else {
                b.column.cmp(&a.column)
            }
        });

        for rep in reps {
            let line_idx = (rep.line_number.saturating_sub(1)) as usize;
            if line_idx < lines.len() {
                let line = &lines[line_idx];
                let col_idx = (rep.column.saturating_sub(1)) as usize;
                let match_len = rep.match_length as usize;

                if col_idx + match_len <= line.len() {
                    let mut new_line = String::with_capacity(line.len() + rep.replacement.len());
                    new_line.push_str(&line[..col_idx]);
                    new_line.push_str(&rep.replacement);
                    new_line.push_str(&line[col_idx + match_len..]);
                    lines[line_idx] = new_line;
                    occurrences_replaced += 1;
                }
            }
        }

        let mut new_content = lines.join("\n");
        if content.ends_with('\n') {
            new_content.push('\n');
        }

        fs::write(p, new_content.as_bytes())
            .map_err(|e| format!("Unable to save replacement to {}: {}", file_path, e))?;

        files_modified += 1;
    }

    Ok(ReplaceSummary {
        files_modified,
        occurrences_replaced,
    })
}

#[tauri::command]
pub fn fs_list_workspace_files(
    root_path: String,
    max_files: Option<usize>,
) -> Result<Vec<String>, String> {
    let p = Path::new(&root_path);
    if !p.exists() || !p.is_dir() {
        return Err("Directory does not exist.".to_string());
    }

    let limit = max_files.unwrap_or(15_000);
    let mut files = Vec::new();
    walk_workspace_files(p, &mut files, limit);

    let result = files
        .into_iter()
        .map(|f| f.to_string_lossy().to_string())
        .collect();

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_read_and_delete_file() {
        let temp_dir = std::env::temp_dir().join("kairo_fs_test_1");
        let _ = fs::create_dir_all(&temp_dir);
        let test_file = temp_dir.join("test.txt");

        let res = fs_create_file(test_file.to_string_lossy().to_string());
        assert!(res.is_ok());

        // Attempt duplicate creation should fail
        let res_dup = fs_create_file(test_file.to_string_lossy().to_string());
        assert!(res_dup.is_err());

        // Read directory
        let entries = fs_read_directory(temp_dir.to_string_lossy().to_string(), Some(false)).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "test.txt");
        assert!(!entries[0].is_directory);

        // Delete
        let del = fs_delete(test_file.to_string_lossy().to_string(), false);
        assert!(del.is_ok());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_duplicate_file() {
        let temp_dir = std::env::temp_dir().join("kairo_fs_test_dup");
        let _ = fs::create_dir_all(&temp_dir);
        let original = temp_dir.join("main.rs");
        fs::write(&original, "fn main() {}").unwrap();

        let dup1 = fs_duplicate(original.to_string_lossy().to_string()).unwrap();
        assert!(dup1.ends_with("main copy.rs"));

        let dup2 = fs_duplicate(original.to_string_lossy().to_string()).unwrap();
        assert!(dup2.ends_with("main copy 2.rs"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_prevent_copy_into_descendant() {
        let temp_dir = std::env::temp_dir().join("kairo_fs_test_descendant");
        let parent = temp_dir.join("parent");
        let child = parent.join("child");
        let _ = fs::create_dir_all(&child);

        let res = fs_copy(parent.to_string_lossy().to_string(), child.join("sub").to_string_lossy().to_string());
        assert!(res.is_err());

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_read_and_write_file() {
        let temp_dir = std::env::temp_dir().join("kairo_fs_test_read_write");
        let _ = fs::create_dir_all(&temp_dir);
        let test_file = temp_dir.join("hello.ts");

        let write_res = fs_write_file(
            test_file.to_string_lossy().to_string(),
            "export const msg = 'Hello Kairo';".to_string(),
        );
        assert!(write_res.is_ok());

        let read_res = fs_read_file(test_file.to_string_lossy().to_string()).unwrap();
        assert_eq!(read_res.content, "export const msg = 'Hello Kairo';");
        assert!(!read_res.is_binary);

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_binary_detection() {
        let temp_dir = std::env::temp_dir().join("kairo_fs_test_bin");
        let _ = fs::create_dir_all(&temp_dir);
        let bin_file = temp_dir.join("image.png");
        fs::write(&bin_file, [0x89, 0x50, 0x4E, 0x47, 0x00, 0x00]).unwrap();

        let read_res = fs_read_file(bin_file.to_string_lossy().to_string()).unwrap();
        assert!(read_res.is_binary);
        assert_eq!(read_res.content, "");

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_search_and_replace_workspace() {
        let temp_dir = std::env::temp_dir().join("kairo_fs_test_search_rep");
        let _ = fs::create_dir_all(&temp_dir);
        let src_dir = temp_dir.join("src");
        let _ = fs::create_dir_all(&src_dir);
        let file1 = src_dir.join("app.ts");
        let file2 = src_dir.join("util.ts");

        fs::write(&file1, "const message = 'apple pie';\nconsole.log(message);").unwrap();
        fs::write(&file2, "export const appleCount = 10;").unwrap();

        // Search for 'apple'
        let options = SearchQueryOptions {
            is_case_sensitive: false,
            is_whole_word: false,
            is_regex: false,
            include_patterns: vec![],
            exclude_patterns: vec![],
            max_results: Some(100),
        };

        let matches = fs_search_workspace(
            temp_dir.to_string_lossy().to_string(),
            "apple".to_string(),
            options,
        )
        .unwrap();

        assert_eq!(matches.len(), 2);

        // Replace in files
        let replacements = vec![FileReplacementPayload {
            file_path: file1.to_string_lossy().to_string(),
            line_number: 1,
            column: 18,
            match_length: 5,
            replacement: "cherry".to_string(),
        }];

        let rep_summary = fs_replace_in_files(replacements).unwrap();
        assert_eq!(rep_summary.files_modified, 1);
        assert_eq!(rep_summary.occurrences_replaced, 1);

        let updated = fs::read_to_string(&file1).unwrap();
        assert!(updated.contains("cherry pie"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_list_workspace_files() {
        let temp_dir = std::env::temp_dir().join("kairo_fs_test_list");
        let _ = fs::create_dir_all(&temp_dir);
        let sub = temp_dir.join("sub");
        let _ = fs::create_dir_all(&sub);

        fs::write(temp_dir.join("a.txt"), "a").unwrap();
        fs::write(sub.join("b.ts"), "b").unwrap();

        let files = fs_list_workspace_files(temp_dir.to_string_lossy().to_string(), None).unwrap();
        assert_eq!(files.len(), 2);

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
