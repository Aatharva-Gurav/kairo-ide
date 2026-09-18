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
    expect(effective.appearance.theme).toBe("dark");
    expect(effective.editor.fontSize).toBe(13);
    expect(effective.editor.tabSize).toBe(2);
    expect(effective.editor.wordWrap).toBe("on");
    expect(effective.explorer.showHidden).toBe(false);
  });

  it("reads single setting by keypath", () => {
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(13);
    expect(SettingsService.getSetting<string>("appearance.theme")).toBe("dark");
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
    SettingsService.updateSetting("appearance.theme", "light", "user");

    SettingsService.resetAll("user");
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(13);
    expect(SettingsService.getSetting<string>("appearance.theme")).toBe("dark");
  });

  it("validates and clamps number settings to bounds", () => {
    // min is 8, max is 72 for editor.fontSize
    SettingsService.updateSetting("editor.fontSize", 100, "user");
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(72);

    SettingsService.updateSetting("editor.fontSize", 2, "user");
    expect(SettingsService.getSetting<number>("editor.fontSize")).toBe(8);
  });

  it("safely falls back to default on corrupted storage data", () => {
    localStorage.setItem(SETTINGS_STORAGE_KEYS.USER_SETTINGS, "{ corrupt json ... ");
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

    SettingsService.updateSetting("appearance.theme", "light", "user");
    expect(notified).toBe(true);
    expect(changedKeyRef).toBe("appearance.theme");

    unsub();
  });
});
