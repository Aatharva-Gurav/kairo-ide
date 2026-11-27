# Settings (`features/settings`)

## Feature Overview
Provides a schema-driven, scoped settings engine supporting user-level and workspace-level preferences with type validation, live propagation across every IDE subsystem, and an interactive searchable settings modal.

## Implementation Location
- **Feature Module**: [`features/settings/`](../../../features/settings/)
  - `types.ts` (`IDESettings`, `SettingDefinition`, `SettingsCategory`, `SettingScope`, etc.)
  - `registry.ts` (`DEFAULT_SETTINGS`, `SETTINGS_REGISTRY`, `getSettingDefinition`)
  - `services/settings.service.ts` (`SettingsService`, `SETTINGS_STORAGE_KEYS`)
  - `services/settings.service.test.ts` (unit tests)
  - `store.tsx` (`SettingsProvider`, `useSettings`)
  - `components/`: `settings-modal.tsx`, `settings-category-view.tsx`, `setting-row.tsx`, `keyboard-shortcuts-settings.tsx`

## Architecture
- **Hierarchical Merge (`SettingsService`)**: Computes `effectiveSettings` by deep-merging `DEFAULT_SETTINGS` -> `userSettings` (scoped per user ID) -> `workspaceSettings` (scoped by normalized workspace path).
- **Sanitization & Validation**: Every read/write runs through `sanitizeValue()` in `SettingsService`, clamping numbers (`min`/`max`), validating `select` options, executing custom `validate()` hooks, migrating legacy themes (`migrateLegacyTheme`), and sanitizing invalid terminal CSS variable fonts.
- **Live Reactivity**: Updating any setting immediately persists to `localStorage`, updates CSS variables/theme when `appearance.theme` changes, and notifies subscribed stores (`EditorProvider`, `TerminalProvider`, `SearchProvider`, `FileExplorerProvider`).

## Feature Functionality
Supports user and workspace scopes across 7 categories in the Settings Modal (`Ctrl+,` / `Cmd+,`):
- **Appearance**: `appearance.theme`, `appearance.iconTheme`, `appearance.sidebarPosition`
- **Editor**: font size/family, tab size/spaces, word wrap, minimap, line numbers, cursor style/blinking, bracket colorization, smooth scrolling, render whitespace, sticky scroll, auto-closing brackets/quotes, format on save/paste
- **Suggestions**: IntelliSense enablement, quick suggestions, trigger characters, accept-on-enter, tab completion, word-based suggestions, built-in snippets, parameter hints
- **Terminal**: font size/family/weight/line height, cursor style/blink, scrollback buffer size, default shell profile, copy on select, right-click behavior, confirm on close, custom shell profiles
- **Files**: `autoSave`, `autoSaveDelay`, `trimTrailingWhitespace`, `insertFinalNewline`, `defaultEncoding`
- **Search**: `excludePatterns`, `includePatterns`, `caseSensitive`, `wholeWord`, `useRegex`
- **Keybindings**: Integrated `KeyboardShortcutsSettings` view inside the Settings modal

## Dependencies
- `features/theme` (`migrateLegacyTheme`, `isDarkTheme`)
- `features/terminal` (`DEFAULT_TERMINAL_SETTINGS`, custom shell profile types)
- `features/commands` (`KeybindingService` for Keyboard Shortcuts tab)
- `lib/storage.ts`, `lib/tauri-ipc.ts`

## Configuration
Storage keys (`SETTINGS_STORAGE_KEYS`):
- `kairo.settings.<userId>` / `kairo:user_settings`
- `kairo:workspace_settings:<normalizedRootPath>`
- `kairo.settings.version`
- `kairo:active_theme`

## User Workflow
1. Open Settings via `Ctrl+,` (`Cmd+,`), the Command Palette, or the titlebar gear icon.
2. Switch between **User** and **Workspace** scopes at the top of the Settings modal, search settings by keyword, or jump straight to Keyboard Shortcuts.

## Development Notes
- Always define new settings in both [`types.ts`](../../../features/settings/types.ts) (`IDESettings`) and [`registry.ts`](../../../features/settings/registry.ts) (`DEFAULT_SETTINGS` + `SETTINGS_REGISTRY`) so validation and UI controls render automatically.

## Known Limitations
- User and workspace settings are persisted in browser/WebView `localStorage` rather than a `.kairo/settings.json` file on disk inside workspaces.

## Related Documentation
- [Themes Feature](../theme/README.md)
- [Commands & Keybindings](../commands/README.md)
- [Integrated Terminal Feature](../terminal/README.md)
- [Code Editor Feature](../editor/README.md)
