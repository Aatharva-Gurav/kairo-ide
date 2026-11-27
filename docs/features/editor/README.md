# Code Editor & Floating Creation (`features/editor`)

## Feature Overview
Provides a multi-tab, split-pane code editor powered by **Monaco Editor**, alongside buffer synchronization and conflict detection, code navigation, formatting, IntelliSense snippets, in-editor find/replace, binary previews, and a floating quick-create menu when the sidebar is collapsed.

## Implementation Location
- **Feature Module**: [`features/editor/`](../../../features/editor/)
  - `store.tsx` (`EditorProvider`, `useEditor`)
  - `types.ts` (`EditorDocument`, `EditorSettings`, `SplitDirection`, `FormatterProvider`, etc.)
  - `index.ts` (public exports)
  - `services/`:
    - `editor.service.ts` (`EditorService` — load, save, saveAll)
    - `buffer-sync.service.ts` (`BufferSyncService` — disk-to-buffer comparison, conflict detection, atomic apply with CRLF/LF preservation)
    - `formatter.service.ts` (`FormatterService` + built-in JSON formatter provider)
    - `intellisense.service.ts` (`IntelliSenseService` — language registration & `BUILTIN_SNIPPETS`)
    - `language.service.ts` (`LanguageService` — extension -> Monaco language ID mapping & display names)
    - `model.service.ts` (`ModelService` — Monaco model lifecycle)
    - `navigation.service.ts` (`NavigationService` — Go to Definition, Peek Definition, References, Symbol, Go to Line)
    - `pane-focus.ts` (tracks active primary vs split Monaco pane focus)
  - `components/`: `editor-workspace.tsx`, `editor-tabs.tsx`, `editor-tab.tsx`, `editor-breadcrumb.tsx`, `editor-status-bar.tsx`, `editor-empty-state.tsx`, `monaco-editor-view.tsx`, `split-editor-pane.tsx`, `binary-file-view.tsx`, `editor-find-replace.tsx`, `go-to-line-modal.tsx`, `quick-open-modal.tsx`, `close-confirm-modal.tsx`
  - Sub-feature `components/floating-creation/`: `floating-creation-feature.tsx`, `floating-creation-button.tsx`, `creation-options-popup.tsx`, `workspace-destination-picker.tsx`, `destination-folder-tree.tsx`, `use-destination-tree.ts`, `validation.ts`
  - Unit tests: `editor-focus.test.ts`, `services/*.test.ts`, `components/floating-creation/validation.test.ts`
- **Shared Worker & Diff Helpers**:
  - [`lib/monaco-worker-stub.ts`](../../../lib/monaco-worker-stub.ts) & [`public/monaco-worker.js`](../../../public/monaco-worker.js)
  - [`lib/diff/diff-service.ts`](../../../lib/diff/diff-service.ts)

## Architecture
- `EditorWorkspace` dynamically imports `MonacoEditorView` (`ssr: false`) after running `installMonacoWorkerStub()` so Monaco workers never trigger CSP/ErrorEvent crashes in Tauri static exports.
- `EditorProvider` bridges open documents with `BufferSyncService.connectEditorBridge(...)` and scopes buffers cleanly on `workspace:opened`, `workspace:closed`, and `workspace:switched` events.
- Split view supports `"horizontal"` (left/right) and `"vertical"` (top/bottom) panes with draggable `15%–85%` ratios (`SplitEditorPane`).
- Live settings from `SettingsProvider` (`editor.*`, `suggestions.*`, `files.*`) update Monaco editor options, auto-save timers, trailing whitespace trimming, final newline insertion, and IntelliSense completion options without page reload.

## Feature Functionality
- Multi-tab open, close, close-others, close-all, dirty-state indicators, and `CloseConfirmModal`
- Horizontal & vertical split editor panes with independent cursor tracking and active pane focus tracking
- Custom draggable `EditorFindReplace` widget (`Ctrl+F` / `Ctrl+H`) with Case, Whole Word, Regex, single/all replace, and persisted screen position (`kairo:editor_find_replace_pos`)
- `QuickOpenModal` (`Ctrl+P` / `Cmd+P`) fuzzy-searching workspace files (`fs_list_workspace_files`)
- `GoToLineModal` (`Ctrl+G` / `Cmd+G`), `EditorBreadcrumb`, and `EditorStatusBar` (line/column, selection count, EOL indicator, language label, zoom percentage, format button)
- Binary file detection (`BinaryFileView`) instead of corrupting non-text files
- `FloatingCreationFeature`: Floating action button visible when the right sidebar is collapsed and a workspace is open, allowing quick File/Folder creation into any workspace folder

## Dependencies
- `monaco-editor`, `@monaco-editor/react`
- `@/lib/diff` (`DiffService`), `@/lib/events` (`ideEvents`), `@/lib/tauri-ipc`
- `features/icon-theme`, `features/settings`, `features/theme`

## Configuration
Relevant settings categories in `features/settings/registry.ts`:
- `editor.*`: `fontSize`, `fontFamily`, `tabSize`, `insertSpaces`, `wordWrap`, `minimap`, `lineNumbers`, `cursorStyle`, `cursorBlinking`, `bracketPairColorization`, `smoothScrolling`, `renderWhitespace`, `stickyScroll`, `autoClosingBrackets`, `autoClosingQuotes`, `formatOnSave`, `formatOnPaste`
- `suggestions.*`: `enabled`, `quickSuggestions`, `suggestOnTriggerCharacters`, `acceptSuggestionOnEnter`, `tabCompletion`, `wordBasedSuggestions`, `snippetsEnabled`, `parameterHints`
- `files.*`: `autoSave`, `autoSaveDelay`, `trimTrailingWhitespace`, `insertFinalNewline`, `defaultEncoding`

## User Workflow
1. Open files from the File Explorer, Quick Open (`Ctrl+P`), Workspace Search (`Ctrl+Shift+F`), or OS drag-and-drop onto the window.
2. Edit side by side with `Ctrl+\` (split right) or `Ctrl+K Ctrl+\` (split down).
3. Save (`Ctrl+S` / `Ctrl+Shift+S`) or rely on configured `files.autoSave` (`afterDelay`, `onFocusChange`, `onWindowChange`).

## Development Notes
- Keep `FormatterService` extensible via `registerProvider()`; currently only JSON has a built-in provider, while other languages fall back to Monaco formatting where supported.
- Keybindings inside Monaco are coordinated with the global capture-phase `KeybindingService` dispatcher so global workbench/terminal/explorer shortcuts are not shadowed unnecessarily.

## Known Limitations
- Built-in code formatting outside Monaco's native language services currently includes only `JsonFormatterProvider`; external formatters (Prettier/Biome) are not bundled.
- LSP servers (rust-analyzer, pyright, etc.) are not bundled; IntelliSense relies on Monaco built-in language workers/services and `IntelliSenseService` snippets.

## Related Documentation
- [Workspace Search Feature](../search/README.md)
- [File Explorer Feature](../file-explorer/README.md)
- [Commands & Keybindings](../commands/README.md)
- [Settings Feature](../settings/README.md)
