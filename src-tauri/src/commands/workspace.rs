use std::path::Path;

#[tauri::command]
pub fn workspace_pick_folder() -> Result<Option<String>, String> {
    let folder = rfd::FileDialog::new().pick_folder();
    Ok(folder.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn workspace_validate_path(path: String) -> Result<bool, String> {
    let p = Path::new(&path);
    Ok(p.exists() && p.is_dir())
}

#[tauri::command]
pub fn workspace_detect_project(root_path: String) -> Result<Vec<String>, String> {
    let p = Path::new(&root_path);
    if !p.exists() || !p.is_dir() {
        return Ok(Vec::new());
    }

    let mut characteristics = Vec::new();

    if p.join("package.json").exists() {
        characteristics.push("Node.js".to_string());
    }
    if p.join("tsconfig.json").exists() {
        characteristics.push("TypeScript".to_string());
    }
    if p.join("Cargo.toml").exists() {
        characteristics.push("Rust".to_string());
    }
    if p.join("pyproject.toml").exists() || p.join("requirements.txt").exists() || p.join("setup.py").exists() {
        characteristics.push("Python".to_string());
    }
    if p.join("pom.xml").exists() || p.join("build.gradle").exists() || p.join("build.gradle.kts").exists() {
        characteristics.push("Java".to_string());
    }
    if p.join("CMakeLists.txt").exists() || p.join("Makefile").exists() {
        characteristics.push("C/C++".to_string());
    }
    if p.join("go.mod").exists() {
        characteristics.push("Go".to_string());
    }
    if p.join("src-tauri").exists() {
        characteristics.push("Tauri".to_string());
    }
    if p.join("next.config.ts").exists() || p.join("next.config.js").exists() || p.join("next.config.mjs").exists() {
        characteristics.push("Next.js".to_string());
    }

    Ok(characteristics)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_validate_path_existing_dir() {
        let temp_dir = std::env::temp_dir().join("kairo_test_workspace");
        let _ = fs::create_dir_all(&temp_dir);
        let result = workspace_validate_path(temp_dir.to_string_lossy().to_string());
        assert_eq!(result, Ok(true));
        let _ = fs::remove_dir(&temp_dir);
    }

    #[test]
    fn test_validate_path_nonexistent() {
        let nonexistent = std::env::temp_dir().join("kairo_nonexistent_workspace_123456");
        let result = workspace_validate_path(nonexistent.to_string_lossy().to_string());
        assert_eq!(result, Ok(false));
    }
}

