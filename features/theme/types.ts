/**
 * Strongly typed theme domain types for Kairo IDE.
 * Defines the 14 VS Code-inspired theme identifiers, semantic color tokens,
 * and Monaco Editor theme contracts.
 */

export type DarkThemeId =
  | "dark-modern"
  | "dark-plus"
  | "vs-dark"
  | "hc-dark"
  | "midnight-blue"
  | "graphite"
  | "forest-dark";

export type LightThemeId =
  | "light-modern"
  | "light-plus"
  | "vs-light"
  | "hc-light"
  | "arctic-blue"
  | "warm-sand"
  | "mint-light";

export type ThemeId = DarkThemeId | LightThemeId;

/**
 * Union of all theme values accepted in preferences, including "system" mode
 * and legacy theme IDs supported for backward-compatible migration.
 */
export type ThemePreference =
  | ThemeId
  | "system"
  | "dark"
  | "light"
  | "one-dark-pro"
  | "dracula"
  | "tokyo-night"
  | "github-dark"
  | "monokai";

export type ThemeCategory = "dark" | "light";

export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  popover: string;
  popoverForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  input: string;
  ring: string;
  success: string;
  warning: string;
  destructive: string;
  info: string;
  sidebar: string;
  sidebarForeground: string;
  sidebarPrimary: string;
  sidebarPrimaryForeground: string;
  sidebarAccent: string;
  sidebarAccentForeground: string;
  sidebarBorder: string;
  sidebarRing: string;
}

export interface MonacoTokenRule {
  token: string;
  foreground: string;
  fontStyle?: string;
}

export interface MonacoThemeDef {
  base: "vs" | "vs-dark" | "hc-black" | "hc-light";
  rules: MonacoTokenRule[];
  colors: Record<string, string>;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  category: ThemeCategory;
  description: string;
  colors: ThemeColors;
  monaco: MonacoThemeDef;
}

