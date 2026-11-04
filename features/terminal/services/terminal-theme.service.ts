import type { ITheme } from "@xterm/xterm";
import { THEME_DEFINITIONS, ThemeId, migrateLegacyTheme } from "@/features/theme";

export class TerminalThemeService {
  /**
   * Generates a fully compliant xterm.js ITheme object matching a Kairo IDE theme.
   */
  static getTheme(themePreference: string): ITheme {
    const themeId = migrateLegacyTheme(themePreference) as ThemeId;
    const def = THEME_DEFINITIONS[themeId] || THEME_DEFINITIONS["dark-modern"];
    const isDark = def.category === "dark";

    if (isDark) {
      return {
        background: def.colors.background || "#181818",
        foreground: def.colors.foreground || "#CCCCCC",
        cursor: def.colors.primary || "#0078D4",
        cursorAccent: def.colors.background || "#181818",
        selectionBackground: "rgba(0, 120, 212, 0.35)",
        selectionForeground: "#FFFFFF",
        selectionInactiveBackground: "rgba(255, 255, 255, 0.1)",

        // ANSI 16 Colors (Dark palette)
        black: "#1e1e1e",
        red: def.colors.destructive || "#f85149",
        green: def.colors.success || "#2ea043",
        yellow: def.colors.warning || "#bb8009",
        blue: def.colors.primary || "#388bfd",
        magenta: "#bc8cff",
        cyan: def.colors.info || "#39c5cf",
        white: "#d1d5db",

        brightBlack: "#6b7280",
        brightRed: "#ff7b72",
        brightGreen: "#56d364",
        brightYellow: "#e3b341",
        brightBlue: "#79c0ff",
        brightMagenta: "#d2a8ff",
        brightCyan: "#56d4dd",
        brightWhite: "#ffffff",
      };
    }

    // Light Theme ANSI Palette
    return {
      background: def.colors.background || "#FFFFFF",
      foreground: def.colors.foreground || "#1F2328",
      cursor: def.colors.primary || "#0969DA",
      cursorAccent: "#FFFFFF",
      selectionBackground: "rgba(9, 105, 218, 0.25)",
      selectionForeground: "#1F2328",
      selectionInactiveBackground: "rgba(0, 0, 0, 0.08)",

      black: "#24292f",
      red: def.colors.destructive || "#cf222e",
      green: def.colors.success || "#1a7f37",
      yellow: def.colors.warning || "#9a6700",
      blue: def.colors.primary || "#0969da",
      magenta: "#8250df",
      cyan: def.colors.info || "#1b7c83",
      white: "#6e7781",

      brightBlack: "#57606a",
      brightRed: "#a40e26",
      brightGreen: "#116329",
      brightYellow: "#633c01",
      brightBlue: "#0550ae",
      brightMagenta: "#6639ba",
      brightCyan: "#0e646a",
      brightWhite: "#8c959f",
    };
  }
}
