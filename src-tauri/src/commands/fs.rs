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
        let formatted = p.to_string_lossy().replace('/', "\\");
        std::process::Command::new("explorer")
            .arg(format!("/select,{}", formatted))
            .spawn()
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
}
