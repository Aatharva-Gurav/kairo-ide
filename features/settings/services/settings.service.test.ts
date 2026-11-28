import { describe, it, expect, beforeEach } from "vitest";
import { SettingsService, SETTINGS_STORAGE_KEYS } from "./settings.service";

// In-memory localStorage polyfill
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
};

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("SettingsService", () => {
  beforeEach(() => {
    store.clear();
    SettingsService.resetAll();
    SettingsService.setWorkspaceRootPath(null);
  });

  it("loads default settings initially", () => {
    const effective = SettingsService.getEffectiveSettings();
    expect(effective.appearance.theme).toBe("dark-modern");
    expect(effective.editor.fontSize).toBe(13);
    expect(effective.editor.tabSize).toBe(2);
    expect(effective.editor.wordWrap).toBe("on");
    expect(effective.explorer.showHidden).toBe(false);
  });

  it("reads single setting by keypath", () => {
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(13);
    expect(SettingsService.getSetting<string>("appearance.theme")).toBe("dark-modern");
  });

  it("updates user setting and updates effective value", () => {
    SettingsService.updateSetting("editor.fontSize", 16, "user");
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(16);

    const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEYS.USER_SETTINGS)!);
    expect(stored.editor.fontSize).toBe(16);
  });

  it("applies precedence: Default -> User -> Workspace", () => {
    // 1. Baseline: 13
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(13);

    // 2. User sets to 15
    SettingsService.updateSetting("editor.fontSize", 15, "user");
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(15);

    // 3. Open Project A: sets workspace override to 18
    SettingsService.setWorkspaceRootPath("/projects/project-a");
    SettingsService.updateSetting("editor.fontSize", 18, "workspace");
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(18);

    // 4. Switch to Project B: workspace override should fall back to user setting (15)
    SettingsService.setWorkspaceRootPath("/projects/project-b");
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(15);

    // 5. Switch back to Project A: workspace override (18) is restored
    SettingsService.setWorkspaceRootPath("/projects/project-a");
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(18);
  });

  it("resets individual setting to default", () => {
    SettingsService.updateSetting("editor.tabSize", 4, "user");
    expect(SettingsService.getSetting<number>("editor.tabSize")).toBe(4);

    SettingsService.resetSetting("editor.tabSize", "user");
    expect(SettingsService.getSetting<number>("editor.tabSize")).toBe(2);
  });

  it("resets category settings", () => {
    SettingsService.updateSetting("editor.tabSize", 4, "user");
    SettingsService.updateSetting("editor.fontSize", 18, "user");

    SettingsService.resetCategory("editor", "user");
    expect(SettingsService.getSetting<number>("editor.tabSize")).toBe(2);
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(13);
  });

  it("resets all user settings", () => {
    SettingsService.updateSetting("editor.fontSize", 20, "user");
    SettingsService.updateSetting("appearance.theme", "midnight-blue", "user");

    SettingsService.resetAll("user");
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(13);
    expect(SettingsService.getSetting<string>("appearance.theme")).toBe("dark-modern");
  });

  it("validates and clamps number settings to bounds", () => {
    // min is 8, max is 72 for editor.fontSize
    SettingsService.updateSetting("editor.fontSize", 100, "user");
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(72);

    SettingsService.updateSetting("editor.fontSize", 2, "user");
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(8);
  });

  it("safely falls back to default on corrupted storage data", () => {
    localStorage.setItem(SettingsService.getUserStorageKey(), "{ corrupt json ... ");
    SettingsService.init();

    // Must not crash and must return valid defaults
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(13);
  });

  it("notifies listeners on settings change", () => {
    let notified = false;
    let changedKeyRef: string | undefined;

    const unsub = SettingsService.subscribe((_effective, changedKey) => {
      notified = true;
      changedKeyRef = changedKey;
    });

    SettingsService.updateSetting("appearance.theme", "midnight-blue", "user");
    expect(notified).toBe(true);
    expect(changedKeyRef).toBe("appearance.theme");

    unsub();
  });

  it("isolates settings between different user accounts", () => {
    // User A
    SettingsService.setUser("user-a");
    SettingsService.updateSetting("appearance.theme", "midnight-blue", "user");
    SettingsService.updateSetting("editor.fontSize", 16, "user");
    expect(SettingsService.getSetting<string>("appearance.theme")).toBe("midnight-blue");
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(16);

    // Switch to User B
    SettingsService.setUser("user-b");
    expect(SettingsService.getSetting<string>("appearance.theme")).toBe("dark-modern");
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(13);
    SettingsService.updateSetting("appearance.theme", "forest-dark", "user");
    expect(SettingsService.getSetting<string>("appearance.theme")).toBe("forest-dark");

    // Switch back to User A -> previous settings are preserved without bleeding
    SettingsService.setUser("user-a");
    expect(SettingsService.getSetting<string>("appearance.theme")).toBe("midnight-blue");
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(16);
  });

  it("migrates legacy user settings if user-scoped key does not exist", () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEYS.LEGACY_USER_SETTINGS,
      JSON.stringify({ appearance: { theme: "monokai" } })
    );

    SettingsService.setUser("migrated-user");
    expect(SettingsService.getSetting<string>("appearance.theme")).toBe("forest-dark");

    // Check migrated into user-scoped key
    const scopedRaw = localStorage.getItem(SettingsService.getUserStorageKey("migrated-user"));
    expect(scopedRaw).toBeDefined();
    expect(JSON.parse(scopedRaw!).appearance.theme).toBe("forest-dark");
  });

  it("migrates legacy theme IDs to their modern equivalents", () => {
    SettingsService.updateSetting("appearance.theme", "dracula", "user");
    expect(SettingsService.getSetting<string>("appearance.theme")).toBe("midnight-blue");

    SettingsService.updateSetting("appearance.theme", "one-dark-pro", "user");
    expect(SettingsService.getSetting<string>("appearance.theme")).toBe("graphite");

    SettingsService.updateSetting("appearance.theme", "dark", "user");
    expect(SettingsService.getSetting<string>("appearance.theme")).toBe("dark-modern");

    SettingsService.updateSetting("appearance.theme", "light", "user");
    expect(SettingsService.getSetting<string>("appearance.theme")).toBe("light-modern");

    SettingsService.updateSetting("appearance.theme", "tokyo-night", "user");
    expect(SettingsService.getSetting<string>("appearance.theme")).toBe("midnight-blue");
  });

  it("safely handles invalid keypaths in getSetting without throwing", () => {
    expect(SettingsService.getSetting("invalidKey")).toBeUndefined();
    expect(SettingsService.getSetting("too.many.nested.parts")).toBeUndefined();
  });

  it("sanitizes numeric strings into numbers for numeric settings", () => {
    SettingsService.updateSetting("editor.fontSize", "18" as unknown as number, "user");
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(18);
  });

  it("allows terminal.fontSize below 14 within its valid 9-32 range", () => {
    SettingsService.updateSetting("terminal.fontSize", 12, "user");
    expect(SettingsService.getSetting<number>("terminal.fontSize")).toBe(12);

    SettingsService.updateSetting("terminal.fontSize", 10, "user");
    expect(SettingsService.getSetting<number>("terminal.fontSize")).toBe(10);
  });

  it("normalizes workspace paths across slashes and casing for settings persistence", () => {
    SettingsService.setWorkspaceRootPath("C:\\Projects\\MyApp");
    SettingsService.updateSetting("editor.tabSize", 4, "workspace");
    expect(SettingsService.getSetting<number>("editor.tabSize")).toBe(4);

    // Switch to same path formatted with forward slashes and lowercase
    SettingsService.setWorkspaceRootPath("c:/projects/myapp");
    expect(SettingsService.getSetting<number>("editor.tabSize")).toBe(4);
  });

  it("synchronizes persisted theme with pre-hydration theme-init.js across user modes", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const vm = await import("node:vm");

    const scriptPath = path.join(process.cwd(), "public", "theme-init.js");
    const themeInitCode = fs.readFileSync(scriptPath, "utf8");

    const runThemeInit = (prefersDark = true) => {
      const classes = new Set<string>();
      const attrs: Record<string, string> = {};
      const mockDoc = {
        documentElement: {
          classList: {
            add: (c: string) => classes.add(c),
            remove: (c: string) => classes.delete(c),
          },
          setAttribute: (k: string, v: string) => {
            attrs[k] = v;
          },
        },
      };
      const sandbox = {
        localStorage: localStorageMock,
        document: mockDoc,
        window: {
          matchMedia: () => ({ matches: prefersDark }),
        },
      };
      vm.runInNewContext(themeInitCode, sandbox);
      return { theme: attrs["data-theme"], isDark: classes.has("dark") };
    };

    // Offline Mode ("local" user) selects light theme -> startup script resolves exact same theme
    SettingsService.setUser("local");
    SettingsService.updateSetting("appearance.theme", "warm-sand", "user");
    expect(localStorage.getItem(SETTINGS_STORAGE_KEYS.ACTIVE_THEME_KEY)).toBe("warm-sand");
    expect(runThemeInit()).toEqual({ theme: "warm-sand", isDark: false });

    // Even if kairo:active_theme is cleared, theme-init.js falls back cleanly to kairo.settings.local
    localStorage.removeItem(SETTINGS_STORAGE_KEYS.ACTIVE_THEME_KEY);
    expect(runThemeInit()).toEqual({ theme: "warm-sand", isDark: false });

    // Signed-in user selects dark theme -> startup script resolves exact same theme
    SettingsService.setUser("cloud-user-42");
    SettingsService.updateSetting("appearance.theme", "midnight-blue", "user");
    expect(localStorage.getItem(SETTINGS_STORAGE_KEYS.ACTIVE_THEME_KEY)).toBe("midnight-blue");
    expect(runThemeInit()).toEqual({ theme: "midnight-blue", isDark: true });

    // System preference tracks matchMedia dynamically
    SettingsService.updateSetting("appearance.theme", "system", "user");
    expect(localStorage.getItem(SETTINGS_STORAGE_KEYS.ACTIVE_THEME_KEY)).toBe("system");
    expect(runThemeInit(false)).toEqual({ theme: "light-modern", isDark: false });
    expect(runThemeInit(true)).toEqual({ theme: "dark-modern", isDark: true });
  });

  it("applies system theme to DOM and meta color-scheme based on matchMedia", () => {
    let prefersDark = false;
    const classes = new Set<string>();
    const attrs: Record<string, string> = {};
    const metaAttrs: Record<string, string> = { content: "light dark" };

    const origWindow = globalThis.window;
    const origDocument = globalThis.document;

    try {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: {
          documentElement: {
            classList: {
              add: (c: string) => classes.add(c),
              remove: (c: string) => classes.delete(c),
            },
            setAttribute: (k: string, v: string) => {
              attrs[k] = v;
            },
          },
          querySelector: (selector: string) =>
            selector === 'meta[name="color-scheme"]'
              ? {
                  setAttribute: (k: string, v: string) => {
                    metaAttrs[k] = v;
                  },
                }
              : null,
        },
      });

      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: {
          matchMedia: () => ({
            matches: prefersDark,
            addEventListener: () => {},
          }),
        },
      });

      // OS in light mode -> system resolves to light-modern while keeping meta "light dark"
      prefersDark = false;
      SettingsService.updateSetting("appearance.theme", "system", "user");
      expect(attrs["data-theme"]).toBe("light-modern");
      expect(classes.has("dark")).toBe(false);
      expect(classes.has("kairo-light")).toBe(true);
      expect(metaAttrs["content"]).toBe("light dark");

      // OS in dark mode -> system resolves to dark-modern while keeping meta "light dark"
      prefersDark = true;
      SettingsService.updateSetting("appearance.theme", "system", "user");
      expect(attrs["data-theme"]).toBe("dark-modern");
      expect(classes.has("dark")).toBe(true);
      expect(classes.has("kairo-dark")).toBe(true);
      expect(metaAttrs["content"]).toBe("light dark");

      // Explicit light theme pins meta color-scheme to "light"
      SettingsService.updateSetting("appearance.theme", "light-modern", "user");
      expect(attrs["data-theme"]).toBe("light-modern");
      expect(metaAttrs["content"]).toBe("light");
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: origWindow });
      Object.defineProperty(globalThis, "document", { configurable: true, value: origDocument });
    }
  });
});
