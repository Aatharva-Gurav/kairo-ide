pub mod agent;
pub mod commands;
pub mod menu;

use commands::fs::*;
use commands::workspace::*;
use menu::*;
use agent::commands::*;
use std::sync::Arc;
use tauri::Manager;

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

            let workspace_root =
                std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
            let backend_state = Arc::new(agent::DesktopBackendState::new(workspace_root));
            app.manage(Arc::clone(&backend_state));

            let backend_state_warmup = Arc::clone(&backend_state);
            tauri::async_runtime::spawn(async move {
                let _ = tauri::async_runtime::spawn_blocking(move || {
                    let _ = agent::ensure_desktop_backend_started(&backend_state_warmup);
                })
                .await;
            });

            // Default to maximized window on launch
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.maximize();
            }

            Ok(())
        })
        .on_menu_event(menu::handle_menu_event)
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if let Some(state) = window.try_state::<Arc<agent::DesktopBackendState>>() {
                    state.stop();
                }
            }
        })
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
            fs_get_metadata,
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
            get_desktop_backend_endpoint,
            restart_desktop_backend,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
