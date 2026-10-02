pub mod commands;
pub mod menu;

use commands::fs::*;
use commands::workspace::*;
use menu::*;
use tauri::Manager;

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

      let menus = menu::init_menus(app.handle())?;
      app.manage(std::sync::Mutex::new(Some(menus)));

      Ok(())
    })
    .on_menu_event(menu::handle_menu_event)
    .invoke_handler(tauri::generate_handler![
      workspace_pick_folder,
      workspace_pick_file,
      workspace_save_file_as,
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
      fs_read_file,
      fs_write_file,
      fs_search_workspace,
      fs_replace_in_files,
      fs_list_workspace_files,
      menu_popup,
      menu_sync_recent_workspaces,
      window_minimize,
      window_toggle_maximize,
      window_close,
      window_is_maximized,
      window_set_theme,
      window_toggle_fullscreen,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

