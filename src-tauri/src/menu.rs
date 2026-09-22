use std::sync::Mutex;
use tauri::{
    menu::{
        ContextMenu, Menu, MenuBuilder, MenuEvent, MenuItemBuilder, PredefinedMenuItem,
        Submenu, SubmenuBuilder,
    },
    AppHandle, Emitter, LogicalPosition, Manager, Position, Runtime, State,
};

pub struct AppMenus<R: Runtime> {
    pub file_menu: Menu<R>,
    pub edit_menu: Menu<R>,
    pub selection_menu: Menu<R>,
    pub view_menu: Menu<R>,
    pub help_menu: Menu<R>,
    pub recent_submenu: Submenu<R>,
}

pub type AppMenusState<R> = Mutex<Option<AppMenus<R>>>;

pub fn init_menus<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<AppMenus<R>> {
    // ─── 1. FILE MENU ───────────────────────────────────────────────────────────
    let new_text_file = MenuItemBuilder::with_id("file.new", "New Text File")
        .accelerator("CmdOrCtrl+N")
        .build(app)?;

    let new_window = MenuItemBuilder::with_id("file.newWindow", "New Window")
        .accelerator("CmdOrCtrl+Shift+N")
        .enabled(false)
        .build(app)?;

    let open_file = MenuItemBuilder::with_id("file.open", "Open File...")
        .accelerator("CmdOrCtrl+O")
        .build(app)?;

    let open_folder = MenuItemBuilder::with_id("file.openFolder", "Open Folder...")
        .accelerator("CmdOrCtrl+Shift+O")
        .build(app)?;

    // Open Recent Submenu
    let open_recent_empty = MenuItemBuilder::with_id("file.openRecentEmpty", "(No Recent Workspaces)")
        .enabled(false)
        .build(app)?;

    let clear_recent = MenuItemBuilder::with_id("file.clearRecent", "Clear Recently Opened")
        .build(app)?;

    let recent_submenu = SubmenuBuilder::with_id(app, "file.openRecent", "Open Recent")
        .item(&open_recent_empty)
        .separator()
        .item(&clear_recent)
        .build()?;

    let save = MenuItemBuilder::with_id("file.save", "Save")
        .accelerator("CmdOrCtrl+S")
        .build(app)?;

    let save_as = MenuItemBuilder::with_id("file.saveAs", "Save As...")
        .accelerator("CmdOrCtrl+Shift+S")
        .build(app)?;

    let save_all = MenuItemBuilder::with_id("file.saveAll", "Save All")
        .accelerator("CmdOrCtrl+Alt+S")
        .build(app)?;

    let close_editor = MenuItemBuilder::with_id("file.closeEditor", "Close Editor")
        .accelerator("CmdOrCtrl+W")
        .build(app)?;

    let close_window = MenuItemBuilder::with_id("file.closeWindow", "Close Window")
        .accelerator(if cfg!(target_os = "macos") { "Cmd+Shift+W" } else { "Alt+F4" })
        .build(app)?;

    let file_menu = MenuBuilder::new(app)
        .item(&new_text_file)
        .item(&new_window)
        .separator()
        .item(&open_file)
        .item(&open_folder)
        .item(&recent_submenu)
        .separator()
        .item(&save)
        .item(&save_as)
        .item(&save_all)
        .separator()
        .item(&close_editor)
        .item(&close_window)
        .build()?;

    // ─── 2. EDIT MENU ───────────────────────────────────────────────────────────
    let undo = MenuItemBuilder::with_id("edit.undo", "Undo")
        .accelerator("CmdOrCtrl+Z")
        .build(app)?;

    let redo = MenuItemBuilder::with_id(
        "edit.redo",
        "Redo",
    )
    .accelerator(if cfg!(target_os = "macos") { "CmdOrCtrl+Shift+Z" } else { "CmdOrCtrl+Y" })
    .build(app)?;

    let cut = MenuItemBuilder::with_id("edit.cut", "Cut")
        .accelerator("CmdOrCtrl+X")
        .build(app)?;

    let copy = MenuItemBuilder::with_id("edit.copy", "Copy")
        .accelerator("CmdOrCtrl+C")
        .build(app)?;

    let paste = MenuItemBuilder::with_id("edit.paste", "Paste")
        .accelerator("CmdOrCtrl+V")
        .build(app)?;

    let select_all = MenuItemBuilder::with_id("edit.selectAll", "Select All")
        .accelerator("CmdOrCtrl+A")
        .build(app)?;

    let edit_menu = MenuBuilder::new(app)
        .item(&undo)
        .item(&redo)
        .separator()
        .item(&cut)
        .item(&copy)
        .item(&paste)
        .separator()
        .item(&select_all)
        .build()?;

    // ─── 3. SELECTION MENU ──────────────────────────────────────────────────────
    let sel_select_all = MenuItemBuilder::with_id("selection.selectAll", "Select All")
        .accelerator("CmdOrCtrl+A")
        .build(app)?;

    let expand_sel = MenuItemBuilder::with_id("selection.expand", "Expand Selection")
        .accelerator("Shift+Alt+Right")
        .build(app)?;

    let shrink_sel = MenuItemBuilder::with_id("selection.shrink", "Shrink Selection")
        .accelerator("Shift+Alt+Left")
        .build(app)?;

    let copy_line_up = MenuItemBuilder::with_id("selection.copyLineUp", "Copy Line Up")
        .accelerator("Shift+Alt+Up")
        .build(app)?;

    let copy_line_down = MenuItemBuilder::with_id("selection.copyLineDown", "Copy Line Down")
        .accelerator("Shift+Alt+Down")
        .build(app)?;

    let move_line_up = MenuItemBuilder::with_id("selection.moveLineUp", "Move Line Up")
        .accelerator("Alt+Up")
        .build(app)?;

    let move_line_down = MenuItemBuilder::with_id("selection.moveLineDown", "Move Line Down")
        .accelerator("Alt+Down")
        .build(app)?;

    let selection_menu = MenuBuilder::new(app)
        .item(&sel_select_all)
        .item(&expand_sel)
        .item(&shrink_sel)
        .separator()
        .item(&copy_line_up)
        .item(&copy_line_down)
        .item(&move_line_up)
        .item(&move_line_down)
        .build()?;

    // ─── 4. VIEW MENU ───────────────────────────────────────────────────────────
    let command_palette = MenuItemBuilder::with_id("view.commandPalette", "Command Palette...")
        .accelerator("CmdOrCtrl+Shift+P")
        .build(app)?;

    let full_screen = MenuItemBuilder::with_id("view.appearance.fullScreen", "Full Screen")
        .accelerator("F11")
        .build(app)?;

    let zen_mode = MenuItemBuilder::with_id("view.appearance.zenMode", "Zen Mode")
        .enabled(false)
        .build(app)?;

    let toggle_menu_bar = MenuItemBuilder::with_id("view.appearance.toggleMenuBar", "Toggle Menu Bar")
        .enabled(false)
        .build(app)?;

    let appearance_menu = SubmenuBuilder::new(app, "Appearance")
        .item(&full_screen)
        .item(&zen_mode)
        .item(&toggle_menu_bar)
        .build()?;

    let split_right = MenuItemBuilder::with_id("view.editorLayout.splitRight", "Split Editor Right")
        .accelerator("CmdOrCtrl+\\")
        .build(app)?;

    let editor_layout_menu = SubmenuBuilder::new(app, "Editor Layout")
        .item(&split_right)
        .build()?;

    let explorer = MenuItemBuilder::with_id("view.explorer", "Explorer")
        .accelerator("CmdOrCtrl+Shift+E")
        .build(app)?;

    let search = MenuItemBuilder::with_id("view.search", "Search")
        .accelerator("CmdOrCtrl+Shift+F")
        .build(app)?;

    let source_control = MenuItemBuilder::with_id("view.sourceControl", "Source Control")
        .accelerator("CmdOrCtrl+Shift+G")
        .enabled(false)
        .build(app)?;

    let run_and_debug = MenuItemBuilder::with_id("view.runAndDebug", "Run and Debug")
        .accelerator("CmdOrCtrl+Shift+D")
        .enabled(false)
        .build(app)?;

    let extensions = MenuItemBuilder::with_id("view.extensions", "Extensions")
        .accelerator("CmdOrCtrl+Shift+X")
        .enabled(false)
        .build(app)?;

    let view_menu = MenuBuilder::new(app)
        .item(&command_palette)
        .separator()
        .item(&appearance_menu)
        .item(&editor_layout_menu)
        .separator()
        .item(&explorer)
        .item(&search)
        .separator()
        .item(&source_control)
        .item(&run_and_debug)
        .item(&extensions)
        .build()?;

    // ─── 5. HELP MENU ───────────────────────────────────────────────────────────
    let welcome = MenuItemBuilder::with_id("help.welcome", "Welcome").build(app)?;

    let documentation = MenuItemBuilder::with_id("help.documentation", "Documentation")
        .enabled(false)
        .build(app)?;

    let keyboard_shortcuts = MenuItemBuilder::with_id("help.keyboardShortcuts", "Keyboard Shortcuts")
        .accelerator("CmdOrCtrl+K CmdOrCtrl+S")
        .build(app)?;

    let check_for_updates = MenuItemBuilder::with_id("help.checkForUpdates", "Check for Updates")
        .enabled(false)
        .build(app)?;

    let about = MenuItemBuilder::with_id("help.about", "About Kairo IDE").build(app)?;

    let help_menu = MenuBuilder::new(app)
        .item(&welcome)
        .item(&documentation)
        .item(&keyboard_shortcuts)
        .item(&check_for_updates)
        .separator()
        .item(&about)
        .build()?;

    // Also build submenus for setting global app menu (enables system keyboard shortcuts on macOS and window accelerators)
    let file_sub = SubmenuBuilder::new(app, "File")
        .item(&new_text_file)
        .item(&new_window)
        .separator()
        .item(&open_file)
        .item(&open_folder)
        .item(&recent_submenu)
        .separator()
        .item(&save)
        .item(&save_as)
        .item(&save_all)
        .separator()
        .item(&close_editor)
        .item(&close_window)
        .build()?;

    let edit_sub = SubmenuBuilder::new(app, "Edit")
        .item(&undo)
        .item(&redo)
        .separator()
        .item(&cut)
        .item(&copy)
        .item(&paste)
        .separator()
        .item(&select_all)
        .build()?;

    let selection_sub = SubmenuBuilder::new(app, "Selection")
        .item(&sel_select_all)
        .item(&expand_sel)
        .item(&shrink_sel)
        .separator()
        .item(&copy_line_up)
        .item(&copy_line_down)
        .item(&move_line_up)
        .item(&move_line_down)
        .build()?;

    let view_sub = SubmenuBuilder::new(app, "View")
        .item(&command_palette)
        .separator()
        .item(&appearance_menu)
        .item(&editor_layout_menu)
        .separator()
        .item(&explorer)
        .item(&search)
        .separator()
        .item(&source_control)
        .item(&run_and_debug)
        .item(&extensions)
        .build()?;

    let help_sub = SubmenuBuilder::new(app, "Help")
        .item(&welcome)
        .item(&documentation)
        .item(&keyboard_shortcuts)
        .item(&check_for_updates)
        .separator()
        .item(&about)
        .build()?;

    if let Ok(global_menu) = MenuBuilder::new(app)
        .item(&file_sub)
        .item(&edit_sub)
        .item(&selection_sub)
        .item(&view_sub)
        .item(&help_sub)
        .build()
    {
        let _ = app.set_menu(global_menu);
    }

    Ok(AppMenus {
        file_menu,
        edit_menu,
        selection_menu,
        view_menu,
        help_menu,
        recent_submenu,
    })
}

pub fn handle_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id_str = event.id().0.as_str();

    if id_str.starts_with("file.openRecent:") {
        let path = id_str.trim_start_matches("file.openRecent:");
        let _ = app.emit(
            "menu:action",
            serde_json::json!({
                "id": "file.openRecent",
                "payload": path
            }),
        );
        return;
    }

    match id_str {
        "file.closeWindow" => {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.close();
            }
        }
        "view.appearance.fullScreen" => {
            if let Some(w) = app.get_webview_window("main") {
                if let Ok(is_fs) = w.is_fullscreen() {
                    let _ = w.set_fullscreen(!is_fs);
                }
            }
        }
        "help.about" => {
            std::thread::spawn(|| {
                rfd::MessageDialog::new()
                    .set_title("About Kairo IDE")
                    .set_description(
                        "Kairo IDE v0.1.0\n\n\
                         A high-performance, extensible desktop IDE shell\n\
                         built with Next.js, React, Monaco Editor, and Tauri 2.\n\n\
                         Architecture: Desktop Native Window\n\
                         Menu: Native Tauri OS Menu",
                    )
                    .show();
            });
        }
        _ => {
            let _ = app.emit(
                "menu:action",
                serde_json::json!({
                    "id": id_str
                }),
            );
        }
    }
}

// ─── TAURI COMMANDS ─────────────────────────────────────────────────────────────

#[tauri::command]
pub fn menu_popup<R: Runtime>(
    window: tauri::Window<R>,
    state: State<'_, AppMenusState<R>>,
    name: String,
    x: f64,
    y: f64,
) -> Result<(), String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let menus = guard.as_ref().ok_or_else(|| "Menus not initialized".to_string())?;

    let menu = match name.as_str() {
        "file" => &menus.file_menu,
        "edit" => &menus.edit_menu,
        "selection" => &menus.selection_menu,
        "view" => &menus.view_menu,
        "help" => &menus.help_menu,
        _ => return Err(format!("Unknown menu: {}", name)),
    };

    menu.popup_at(
        window,
        Position::Logical(LogicalPosition::new(x, y)),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn menu_sync_recent_workspaces<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppMenusState<R>>,
    paths: Vec<String>,
) -> Result<(), String> {
    let guard = state.lock().map_err(|e| e.to_string())?;
    let menus = guard.as_ref().ok_or_else(|| "Menus not initialized".to_string())?;

    // Clear existing items in recent submenu
    let items = menus.recent_submenu.items().map_err(|e| e.to_string())?;
    for item in items {
        let _ = menus.recent_submenu.remove(&item);
    }

    if paths.is_empty() {
        let empty_item = MenuItemBuilder::with_id("file.openRecentEmpty", "(No Recent Workspaces)")
            .enabled(false)
            .build(&app)
            .map_err(|e| e.to_string())?;
        let _ = menus.recent_submenu.append(&empty_item);
    } else {
        for path in paths.iter().take(10) {
            let p = std::path::Path::new(path);
            let label = p
                .file_name()
                .map(|f| f.to_string_lossy().to_string())
                .unwrap_or_else(|| path.clone());

            let item = MenuItemBuilder::with_id(format!("file.openRecent:{}", path), label)
                .build(&app)
                .map_err(|e| e.to_string())?;
            let _ = menus.recent_submenu.append(&item);
        }
    }

    let sep = PredefinedMenuItem::separator(&app).map_err(|e| e.to_string())?;
    let _ = menus.recent_submenu.append(&sep);

    let clear_item = MenuItemBuilder::with_id("file.clearRecent", "Clear Recently Opened")
        .enabled(!paths.is_empty())
        .build(&app)
        .map_err(|e| e.to_string())?;
    let _ = menus.recent_submenu.append(&clear_item);

    Ok(())
}

#[tauri::command]
pub fn window_minimize<R: Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize<R: Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_close<R: Runtime>(window: tauri::Window<R>) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_is_maximized<R: Runtime>(window: tauri::Window<R>) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_set_theme<R: Runtime>(window: tauri::Window<R>, theme: String) -> Result<(), String> {
    let t = match theme.as_str() {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => None,
    };
    window.set_theme(t).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_fullscreen<R: Runtime>(window: tauri::Window<R>) -> Result<bool, String> {
    let is_fs = window.is_fullscreen().map_err(|e| e.to_string())?;
    window.set_fullscreen(!is_fs).map_err(|e| e.to_string())?;
    Ok(!is_fs)
}

