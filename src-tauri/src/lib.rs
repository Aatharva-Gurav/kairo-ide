pub mod commands;

use commands::fs::*;
use commands::workspace::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      workspace_pick_folder,
      workspace_validate_path,
      workspace_detect_project,
      fs_read_directory,
      fs_create_file,
      fs_create_directory,
      fs_rename,
      fs_delete,
      fs_copy,
      fs_move,
      fs_duplicate,
      fs_reveal,
      fs_exists,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

