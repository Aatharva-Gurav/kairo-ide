# Themes (`features/theme`)

## Feature Overview
Manages Kairo IDE's 14 built-in VS Code-inspired color themes (7 dark, 7 light), OS system preference resolution (`"system"`), legacy theme migration, CSS custom property synchronization, and Monaco Editor theme registration.

## Implementation Location
- **Feature Module**: [`features/theme/`](../../../features/theme/)
  - `types.ts` (`DarkThemeId`, `LightThemeId`, `ThemeId`, `ThemePreference`, `ThemeDefinition`, `ThemeColors`, `MonacoThemeDef`)
  - `registry.ts` (14 theme definitions, legacy migration, CSS application helpers)
  - `index.ts` (public exports)
  - `theme.test.ts` (unit tests)
- **Early Paint Bootstrap**: [`public/theme-init.js`](../../../public/theme-init.js) loaded synchronously in `app/layout.tsx`

## Architecture
- Every theme defines two cohesive layers:
  1. `ThemeColors`: 29 CSS custom properties (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--border`, `--input`, `--ring`, semantic status tokens `--success`/`--warning`/`--destructive`/`--info`, and sidebar tokens `--sidebar*`).
  2. `MonacoThemeDef`: Token syntax highlighting rules and Monaco surface colors (`base`: `vs`, `vs-dark`, `hc-black`, or `hc-light`).
- Switching `appearance.theme` via `SettingsService` updates `kairo:active_theme` in `localStorage`, toggles the `dark` / `light` root classes, applies CSS variables, updates Monaco editor themes (`MonacoEditorView`), and triggers `TerminalThemeService` ANSI palette synchronization for `xterm.js`.
- `public/theme-init.js` executes before React hydration in `<head>` to read stored theme state and avoid initial light/dark flash.

## Feature Functionality
### Built-in Dark Themes (7)
- `dark-modern` (Dark Modern — default dark)
- `dark-plus` (Dark+)
- `vs-dark` (Visual Studio Dark)
- `hc-dark` (High Contrast Dark)
- `midnight-blue` (Midnight Blue)
- `graphite` (Graphite)
- `forest-dark` (Forest Dark)

### Built-in Light Themes (7)
- `light-modern` (Light Modern)
- `light-plus` (Light+)
- `vs-light` (Visual Studio Light)
- `hc-light` (High Contrast Light)
- `arctic-blue` (Arctic Blue)
- `warm-sand` (Warm Sand)
- `mint-light` (Mint Light)

### System & Legacy Support
- `"system"` resolves dynamically via `window.matchMedia("(prefers-color-scheme: dark)")` to `dark-modern` or `light-modern`.
- `migrateLegacyTheme()` automatically maps older identifiers (`dark`, `light`, `one-dark-pro`, `dracula`, `tokyo-night`, `github-dark`, `monokai`) onto current supported themes.

## Dependencies
- Consumed by `features/settings`, `features/editor` (Monaco themes), `features/terminal` (`TerminalThemeService`), `features/onboarding`, and `app/globals.css`.

## Configuration
- Setting key: `appearance.theme` (default `"dark-modern"`)
- Storage key: `kairo:active_theme`

## User Workflow
1. Open Settings (`Ctrl+,` / `Cmd+,`) -> **Appearance** -> select any theme or `system`.
2. UI chrome, sidebar, Monaco Editor syntax palette, and integrated terminal ANSI colors update immediately.

## Development Notes
- Keep `THEME_OPTIONS` in [`features/onboarding/components/onboarding-wizard.tsx`](../../../features/onboarding/components/onboarding-wizard.tsx) and `appearance.theme` options in [`features/settings/registry.ts`](../../../features/settings/registry.ts) in sync when adding themes.
- Verify theme integrity and legacy migration rules with `npm test` (`features/theme/theme.test.ts`).

## Known Limitations
- Custom user JSON theme imports (VS Code `.tmTheme` / theme extension packs) are not implemented; themes are compiled into the built-in registry.

## Related Documentation
- [Settings Feature](../settings/README.md)
- [Icon Theme Feature](../icon-theme/README.md)
- [Editor Feature](../editor/README.md)
- [Terminal Feature](../terminal/README.md)
