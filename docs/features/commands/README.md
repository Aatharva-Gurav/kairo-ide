# Commands & Keybindings (`features/commands` & `features/command-palette`)

## Feature Overview
Provides the central command registry, fuzzy search engine, capture-phase keyboard shortcut dispatcher (supporting chords, OS-specific bindings, shifted keys, and context predicates), Command Palette modal, and Shortcut Recorder UI.

## Implementation Location
- **Commands Engine**: [`features/commands/`](../../../features/commands/)
  - `command-registry.ts` (`CommandRegistry`)
  - `keybinding.service.ts` (`KeybindingService`, `DEFAULT_KEYBINDINGS`, `splitKeyTokens`)
  - `fuzzy-search.ts` (`fuzzyFilter`)
  - `store.tsx` (`CommandProvider`, `useCommands`)
  - `types.ts` (`Command`, `Keybinding`, `ResolvedKeybinding`, `KeybindingConflict`, etc.)
  - `components/shortcut-recorder-modal.tsx` (`ShortcutRecorderModal`)
  - Unit tests: `command-registry.test.ts`, `keybinding.service.test.ts`, `fuzzy-search.test.ts`
- **Command Palette Modal**: [`features/command-palette/components/command-palette-modal.tsx`](../../../features/command-palette/components/command-palette-modal.tsx)
- **Settings UI**: [`features/settings/components/keyboard-shortcuts-settings.tsx`](../../../features/settings/components/keyboard-shortcuts-settings.tsx)

## Architecture
- `CommandRegistry` stores commands (`id`, `title`, `category`, optional `description`, `keywords`, dynamic `enabled` predicate, `execute()`) with duplicate execution guards and listener subscriptions.
- `KeybindingService` maintains default shortcuts (`DEFAULT_KEYBINDINGS`) merged with custom user overrides persisted in `localStorage` (`kairo:keybindings`), supporting:
  - Cross-platform normalization (`Cmd` on macOS vs `Ctrl` on Windows/Linux)
  - Physical `e.code` fallback mapping for shifted symbols/digits (e.g., `Backquote` for ``Ctrl+Shift+` ``, `Digit5` for `Ctrl+Shift+5`)
  - Two-step chord sequences with a `1500ms` timeout (e.g., `Ctrl+K F`, `Ctrl+K Ctrl+S`, `Ctrl+K Ctrl+W`, `Ctrl+K Ctrl+\`)
  - Context-aware `when` clauses (`terminalFocus`, `editorTextFocus`, `explorerFocus`) resolved dynamically against active DOM focus
- `CommandProvider` registers a single **capture-phase** `keydown` listener on `window` so workbench shortcuts fire reliably before being swallowed by Monaco or native browser controls, while `TerminalInstanceRegistry` delegates matching shortcuts via `attachCustomKeyEventHandler`.

## Feature Functionality
- **Command Palette** (`Ctrl+Shift+P` / `Cmd+Shift+P`): Fuzzy searches across command title, category, description, ID, and keywords (supporting optional leading `>`), displays live resolved shortcuts, and executes enabled commands.
- **Custom Keybinding Customization & Conflict Detection**: Edit or reset shortcuts via `ShortcutRecorderModal` in Settings (`Ctrl+K Ctrl+S` / `Cmd+K Cmd+S`), with automatic detection of identical or chord-prefix collisions (`detectConflicts`).

## Dependencies
- Subscribes to `WorkspaceContext`, `FileExplorerContext`, `EditorContext`, `SettingsContext`, `SidebarContext`, and `ideEvents`.
- Uses `getSafeLocalStorage()` (`lib/storage.ts`).

## Configuration
- Storage key: `kairo:keybindings`
- Key default shortcuts:
  - `Ctrl+Shift+P` -> Command Palette
  - `Ctrl+P` -> Quick Open File
  - `Ctrl+,` -> Open Settings
  - `Ctrl+K Ctrl+S` -> Keyboard Shortcuts
  - `Ctrl+B` -> Toggle Sidebar
  - `Ctrl+Shift+E` -> Focus Explorer
  - `Ctrl+Shift+F` -> Find in Workspace
  - ``Ctrl+` `` -> Toggle Terminal

## User Workflow
1. Press `Ctrl+Shift+P` (`Cmd+Shift+P` on macOS) and start typing any command name or category.
2. Open Settings -> Keyboard Shortcuts (`Ctrl+K Ctrl+S`) to rebind or reset any shortcut.

## Development Notes
- Always check `KeybindingService.isMacOS()` / `normalizeKeyboardEvent()` test coverage (`features/commands/keybinding.service.test.ts`) when altering key normalization or chord matching.
- On Windows/Linux, keep native Tauri menu accelerators disabled so global OS accelerators do not double-trigger alongside `KeybindingService`.

## Known Limitations
- Keybinding `when` expressions currently evaluate the three primary focus contexts (`terminalFocus`, `editorTextFocus`, `explorerFocus`) rather than arbitrary user-scripted condition ASTs.

## Related Documentation
- [Settings Feature](../settings/README.md)
- [Integrated Terminal Feature](../terminal/README.md)
- [Code Editor Feature](../editor/README.md)
