import { describe, it, expect } from "vitest";
import {
  THEME_LIST,
  DARK_THEMES,
  LIGHT_THEMES,
  migrateLegacyTheme,
  isDarkTheme,
  resolveTheme,
} from "./index";
import { ThemeId } from "./types";

describe("Theme System & Registry", () => {
  it("contains exactly 14 themes (7 dark, 7 light)", () => {
    expect(THEME_LIST).toHaveLength(14);
    expect(DARK_THEMES).toHaveLength(7);
    expect(LIGHT_THEMES).toHaveLength(7);
  });

  const expectedDarkThemes: ThemeId[] = [
    "dark-modern",
    "dark-plus",
    "vs-dark",
    "hc-dark",
    "midnight-blue",
    "graphite",
    "forest-dark",
  ];

  const expectedLightThemes: ThemeId[] = [
    "light-modern",
    "light-plus",
    "vs-light",
    "hc-light",
    "arctic-blue",
    "warm-sand",
    "mint-light",
  ];

  it("contains all 7 expected dark theme IDs", () => {
    const darkIds = DARK_THEMES.map((t) => t.id);
    for (const expectedId of expectedDarkThemes) {
      expect(darkIds).toContain(expectedId);
    }
  });

  it("contains all 7 expected light theme IDs", () => {
    const lightIds = LIGHT_THEMES.map((t) => t.id);
    for (const expectedId of expectedLightThemes) {
      expect(lightIds).toContain(expectedId);
    }
  });

  it("defines complete and valid semantic tokens for every theme", () => {
    for (const theme of THEME_LIST) {
      expect(theme.name).toBeTruthy();
      expect(theme.description).toBeTruthy();
      expect(theme.category).toMatch(/^(dark|light)$/);

      const c = theme.colors;
      expect(c.background).toBeTruthy();
      expect(c.foreground).toBeTruthy();
      expect(c.card).toBeTruthy();
      expect(c.popover).toBeTruthy();
      expect(c.primary).toBeTruthy();
      expect(c.primaryForeground).toBeTruthy();
      expect(c.secondary).toBeTruthy();
      expect(c.muted).toBeTruthy();
      expect(c.accent).toBeTruthy();
      expect(c.border).toBeTruthy();
      expect(c.input).toBeTruthy();
      expect(c.ring).toBeTruthy();
      expect(c.sidebar).toBeTruthy();
      expect(c.sidebarBorder).toBeTruthy();
      expect(c.success).toBeTruthy();
      expect(c.warning).toBeTruthy();
      expect(c.destructive).toBeTruthy();
    }
  });

  it("defines valid Monaco editor configurations for every theme", () => {
    for (const theme of THEME_LIST) {
      const m = theme.monaco;
      expect(["vs", "vs-dark", "hc-black", "hc-light"]).toContain(m.base);
      expect(m.rules.length).toBeGreaterThan(0);
      expect(m.colors["editor.background"]).toBeTruthy();
      expect(m.colors["editor.foreground"]).toBeTruthy();
      expect(m.colors["editor.selectionBackground"]).toBeTruthy();
      expect(m.colors["editorCursor.foreground"]).toBeTruthy();
    }
  });

  describe("migrateLegacyTheme", () => {
    it("safely migrates legacy theme IDs to new VS Code equivalents", () => {
      expect(migrateLegacyTheme("dark")).toBe("dark-modern");
      expect(migrateLegacyTheme("github-dark")).toBe("dark-modern");
      expect(migrateLegacyTheme("light")).toBe("light-modern");
      expect(migrateLegacyTheme("vs-dark")).toBe("vs-dark");
      expect(migrateLegacyTheme("vs-light")).toBe("vs-light");
      expect(migrateLegacyTheme("one-dark-pro")).toBe("graphite");
      expect(migrateLegacyTheme("dracula")).toBe("midnight-blue");
      expect(migrateLegacyTheme("tokyo-night")).toBe("midnight-blue");
      expect(migrateLegacyTheme("monokai")).toBe("forest-dark");
    });

    it("preserves modern theme IDs", () => {
      expect(migrateLegacyTheme("dark-modern")).toBe("dark-modern");
      expect(migrateLegacyTheme("dark-plus")).toBe("dark-plus");
      expect(migrateLegacyTheme("hc-dark")).toBe("hc-dark");
      expect(migrateLegacyTheme("arctic-blue")).toBe("arctic-blue");
      expect(migrateLegacyTheme("warm-sand")).toBe("warm-sand");
      expect(migrateLegacyTheme("mint-light")).toBe("mint-light");
      expect(migrateLegacyTheme("system")).toBe("system");
    });

    it("safely handles null, undefined, and corrupt strings", () => {
      expect(migrateLegacyTheme(null)).toBe("dark-modern");
      expect(migrateLegacyTheme(undefined)).toBe("dark-modern");
      expect(migrateLegacyTheme("unknown-theme-xyz")).toBe("dark-modern");
      expect(migrateLegacyTheme("random-light-theme")).toBe("light-modern");
    });
  });

  describe("isDarkTheme", () => {
    it("correctly identifies dark vs light themes", () => {
      expect(isDarkTheme("dark-modern")).toBe(true);
      expect(isDarkTheme("dark-plus")).toBe(true);
      expect(isDarkTheme("vs-dark")).toBe(true);
      expect(isDarkTheme("hc-dark")).toBe(true);
      expect(isDarkTheme("midnight-blue")).toBe(true);
      expect(isDarkTheme("graphite")).toBe(true);
      expect(isDarkTheme("forest-dark")).toBe(true);

      expect(isDarkTheme("light-modern")).toBe(false);
      expect(isDarkTheme("light-plus")).toBe(false);
      expect(isDarkTheme("vs-light")).toBe(false);
      expect(isDarkTheme("hc-light")).toBe(false);
      expect(isDarkTheme("arctic-blue")).toBe(false);
      expect(isDarkTheme("warm-sand")).toBe(false);
      expect(isDarkTheme("mint-light")).toBe(false);
    });

    it("correctly identifies legacy themes", () => {
      expect(isDarkTheme("dracula")).toBe(true);
      expect(isDarkTheme("one-dark-pro")).toBe(true);
      expect(isDarkTheme("tokyo-night")).toBe(true);
      expect(isDarkTheme("monokai")).toBe(true);
      expect(isDarkTheme("light")).toBe(false);
    });
  });

  describe("resolveTheme", () => {
    it("resolves dark-modern when requested", () => {
      const def = resolveTheme("dark-modern");
      expect(def.id).toBe("dark-modern");
      expect(def.colors.background).toBe("#181818");
    });

    it("resolves system mode based on prefersDark parameter", () => {
      const darkDef = resolveTheme("system", true);
      expect(darkDef.id).toBe("dark-modern");

      const lightDef = resolveTheme("system", false);
      expect(lightDef.id).toBe("light-modern");
    });
  });
});

