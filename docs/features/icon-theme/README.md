# Icon Theme (`features/icon-theme`)

## Feature Overview
Provides cached, multi-priority file and folder icon resolution for tabs, breadcrumbs, search results, quick-open modals, and the file explorer tree, backed by brand/technology SVG icons and crisp SVG folder indicators.

## Implementation Location
- **Feature Module**: [`features/icon-theme/`](../../../features/icon-theme/)
  - `types.ts` (`IconDefinition`, `IconResolveOptions`, `IconTheme`, `FilePatternRule`)
  - `resolver.ts` (`resolveIcon`, `clearIconCache`)
  - `context.tsx` (`IconThemeProvider`, `useIconTheme`)
  - `themes/simple-icons.ts` & `themes/index.ts` (icon theme definitions and mappings)
  - `components/file-icon.tsx` (`FileIcon`) & `components/folder-svgs.tsx` (custom open/closed folder SVGs)
  - `index.ts` (barrel exports)
  - `resolver.test.ts` (unit tests)
- **Explorer Re-export**: [`features/file-explorer/components/file-icon.tsx`](../../../features/file-explorer/components/file-icon.tsx) re-exports `@/features/icon-theme` components for explorer modules.

## Architecture
`resolveIcon(options, theme)` resolves icons with an in-memory cache (`Map` capped at `2000` entries to bound memory usage in large repositories) using strict priority order:
1. **Directories**:
   - Expanded folder name match (`folderExpandedNames`)
   - Closed folder name match (`folderNames`)
   - Default expanded/closed folder fallback
2. **Files**:
   - Exact filename match (case-insensitive, e.g., `package.json`, `Cargo.toml`)
   - Regex `filePatterns` match
   - Multi-part extension match (e.g., `.d.ts`, `.test.ts`)
   - Standard extension match (`.ts`, `.rs`, `.json`, etc.)
   - Default file fallback

## Feature Functionality
- Consistent `FileIcon` rendering across `EditorTabs`, `EditorBreadcrumb`, `QuickOpenModal`, `SplitEditorPane`, `WorkspaceSearchPanel`, `ReplaceConfirmModal`, and `FileTreeNode`.
- Distinct expanded vs collapsed folder visual states.
- Theme cache invalidation (`clearIconCache()`) when changing icon themes.

## Dependencies
- `@icons-pack/react-simple-icons`: Technology and language SVG brand icons
- `lucide-react`: Fallback UI icons

## Configuration
- Setting key: `appearance.iconTheme` (registered in `features/settings/registry.ts`; defaults to `"kairo-icons"`)
- `IconThemeProvider` wraps the workbench shell in [`app/page.tsx`](../../../app/page.tsx).

## User Workflow
- File and folder icons update automatically as files are opened, created, renamed, or expanded in the explorer and editor tabs.

## Development Notes
- Add new language/framework filename or extension mappings in `features/icon-theme/themes/simple-icons.ts` and validate resolution priority in `features/icon-theme/resolver.test.ts`.

## Known Limitations
- Uses a single built-in `simple-icons` theme (`kairo-icons`) rather than external VS Code icon pack loading.

## Related Documentation
- [File Explorer Feature](../file-explorer/README.md)
- [Themes Feature](../theme/README.md)
- [Editor Feature](../editor/README.md)
