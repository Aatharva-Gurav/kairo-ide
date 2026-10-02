import {
  IDESettings,
  DeepPartial,
  SettingsCategory,
  SettingScope,
} from "../types";
import { DEFAULT_SETTINGS, SETTINGS_REGISTRY, getSettingDefinition } from "../registry";
import { normalizePath } from "@/lib/tauri-ipc";

export const SETTINGS_STORAGE_KEYS = {
  USER_SETTINGS: "kairo:user_settings",
  LEGACY_USER_SETTINGS: "kairo:user_settings",
  USER_SETTINGS_PREFIX: "kairo.settings.",
  WORKSPACE_SETTINGS_PREFIX: "kairo:workspace_settings:",
  SETTINGS_VERSION_KEY: "kairo.settings.version",
  CURRENT_VERSION: 1,
} as const;

export type SettingsChangeListener = (
  effective: IDESettings,
  changedKey?: string
) => void;

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }
  return null;
}

/**
 * Deep clone a plain object safely.
 */
function deepClone<T>(obj: T): T {
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

/**
 * Validates and sanitizes a value against its SettingDefinition.
 * Falls back to default if invalid or out of bounds.
 */
function sanitizeValue(key: string, value: unknown, defaultValue: unknown): unknown {
  const def = getSettingDefinition(key);
  if (!def) return value ?? defaultValue;

  if (value === undefined || value === null) {
    return defaultValue;
  }

  // Type-based check
  if (def.type === "boolean" && typeof value !== "boolean") {
    return defaultValue;
  }

  if (def.type === "number") {
    if (typeof value !== "number" || isNaN(value)) {
      return defaultValue;
    }
    if (def.min !== undefined && value < def.min) return def.min;
    if (def.max !== undefined && value > def.max) return def.max;
  }

  if (def.type === "string" && typeof value !== "string") {
    return defaultValue;
  }

  if (def.type === "select") {
    if (def.options && !def.options.some((opt) => opt.value === value)) {
      return defaultValue;
    }
  }

  if (def.validate && !def.validate(value)) {
    return defaultValue;
  }

  return value;
}

export class SettingsService {
  private static activeUserId: string | null = null;
  private static userSettings: DeepPartial<IDESettings> = {};
  private static workspaceSettings: DeepPartial<IDESettings> = {};
  private static activeWorkspacePath: string | null = null;
  private static effectiveSettings: IDESettings = deepClone(DEFAULT_SETTINGS);
  private static listeners = new Set<SettingsChangeListener>();
  private static initialized = false;

  /**
   * Returns the user-scoped storage key for user preferences.
   */
  static getUserStorageKey(userId: string | null = this.activeUserId): string {
    if (!userId) {
      return `${SETTINGS_STORAGE_KEYS.USER_SETTINGS_PREFIX}guest`;
    }
    return `${SETTINGS_STORAGE_KEYS.USER_SETTINGS_PREFIX}${userId}`;
  }

  /**
   * Switches the active user, scoping settings to that user and notifying listeners.
   */
  static setUser(userId: string | null): void {
    if (this.activeUserId === userId && this.initialized) {
      return;
    }

    this.activeUserId = userId;
    this.userSettings = this.loadStoredUserSettings();
    this.recalculateEffectiveSettings();
    this.applyLiveSettings(this.effectiveSettings);
    this.notifyListeners();
  }

  /**
   * Initializes the settings service, loading user settings and resolving effective settings.
   */
  static init(userId?: string | null): IDESettings {
    if (userId !== undefined) {
      this.activeUserId = userId;
    }

    if (this.initialized) {
      return this.effectiveSettings;
    }

    this.userSettings = this.loadStoredUserSettings();
    this.recalculateEffectiveSettings();
    this.applyLiveSettings(this.effectiveSettings);
    this.initialized = true;
    return this.effectiveSettings;
  }

  /**
   * Switches the active workspace root path, loading any project-specific settings.
   */
  static setWorkspaceRootPath(rootPath: string | null): void {
    const normalized = rootPath ? normalizePath(rootPath) : null;
    if (this.activeWorkspacePath === normalized) {
      return;
    }

    this.activeWorkspacePath = normalized;
    if (normalized) {
      this.workspaceSettings = this.loadStoredWorkspaceSettings(normalized);
    } else {
      this.workspaceSettings = {};
    }

    this.recalculateEffectiveSettings();
    this.applyLiveSettings(this.effectiveSettings);
    this.notifyListeners();
  }

  /**
   * Gets the current effective settings (Default -> User -> Workspace).
   */
  static getEffectiveSettings(): IDESettings {
    if (!this.initialized) {
      this.init();
    }
    return this.effectiveSettings;
  }

  /**
   * Reads a single setting value by keypath (e.g. "editor.fontSize").
   */
  static getSetting<T>(key: string): T {
    const parts = key.split(".");
    if (parts.length !== 2) {
      throw new Error(`Invalid setting key: ${key}`);
    }

    const [cat, prop] = parts as [SettingsCategory, string];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const categoryObj = this.getEffectiveSettings()[cat] as any;
    return categoryObj?.[prop] as T;
  }

  /**
   * Updates a setting in the specified scope ("user" or "workspace").
   */
  static updateSetting<T>(key: string, value: T, scope: "user" | "workspace" = "user"): void {
    const def = getSettingDefinition(key);
    if (!def) {
      console.warn(`[SettingsService] Unknown setting key: ${key}`);
      return;
    }

    const parts = key.split(".");
    if (parts.length !== 2) return;
    const [cat, prop] = parts as [SettingsCategory, string];

    // Sanitize value
    const sanitized = sanitizeValue(key, value, def.defaultValue) as T;

    if (scope === "workspace") {
      if (!this.activeWorkspacePath) {
        console.warn("[SettingsService] Cannot set workspace setting: No active workspace.");
        return;
      }
      if (!this.workspaceSettings[cat]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.workspaceSettings[cat] = {} as any;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.workspaceSettings[cat] as any)[prop] = sanitized;
      this.persistWorkspaceSettings(this.activeWorkspacePath, this.workspaceSettings);
    } else {
      if (!this.userSettings[cat]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.userSettings[cat] = {} as any;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.userSettings[cat] as any)[prop] = sanitized;
      this.persistUserSettings(this.userSettings);
    }

    this.recalculateEffectiveSettings();
    this.applyLiveSettings(this.effectiveSettings, key);
    this.notifyListeners(key);
  }

  /**
   * Resets a single setting in the specified scope (or both if unspecified).
   */
  static resetSetting(key: string, scope?: "user" | "workspace"): void {
    const parts = key.split(".");
    if (parts.length !== 2) return;
    const [cat, prop] = parts as [SettingsCategory, string];

    if (!scope || scope === "workspace") {
      if (this.workspaceSettings[cat]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (this.workspaceSettings[cat] as any)[prop];
        if (this.activeWorkspacePath) {
          this.persistWorkspaceSettings(this.activeWorkspacePath, this.workspaceSettings);
        }
      }
    }

    if (!scope || scope === "user") {
      if (this.userSettings[cat]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (this.userSettings[cat] as any)[prop];
        this.persistUserSettings(this.userSettings);
      }
    }

    this.recalculateEffectiveSettings();
    this.applyLiveSettings(this.effectiveSettings, key);
    this.notifyListeners(key);
  }

  /**
   * Resets an entire category of settings.
   */
  static resetCategory(category: SettingsCategory, scope?: "user" | "workspace"): void {
    if (!scope || scope === "workspace") {
      delete this.workspaceSettings[category];
      if (this.activeWorkspacePath) {
        this.persistWorkspaceSettings(this.activeWorkspacePath, this.workspaceSettings);
      }
    }

    if (!scope || scope === "user") {
      delete this.userSettings[category];
      this.persistUserSettings(this.userSettings);
    }

    this.recalculateEffectiveSettings();
    this.applyLiveSettings(this.effectiveSettings);
    this.notifyListeners();
  }

  /**
   * Resets all user or workspace settings to defaults.
   */
  static resetAll(scope?: "user" | "workspace"): void {
    if (!scope || scope === "workspace") {
      this.workspaceSettings = {};
      if (this.activeWorkspacePath) {
        this.persistWorkspaceSettings(this.activeWorkspacePath, {});
      }
    }

    if (!scope || scope === "user") {
      this.userSettings = {};
      this.persistUserSettings({});
    }

    this.recalculateEffectiveSettings();
    this.applyLiveSettings(this.effectiveSettings);
    this.notifyListeners();
  }

  /**
   * Checks if a setting is modified from default in the specified scope.
   */
  static isSettingModified(key: string, scope?: SettingScope): boolean {
    const parts = key.split(".");
    if (parts.length !== 2) return false;
    const [cat, prop] = parts as [SettingsCategory, string];

    const inWorkspace =
      this.workspaceSettings[cat] &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.workspaceSettings[cat] as any)[prop] !== undefined;

    const inUser =
      this.userSettings[cat] &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.userSettings[cat] as any)[prop] !== undefined;

    if (scope === "workspace") return Boolean(inWorkspace);
    if (scope === "user") return Boolean(inUser);
    return Boolean(inWorkspace || inUser);
  }

  /**
   * Gets raw user overrides.
   */
  static getUserSettings(): DeepPartial<IDESettings> {
    return deepClone(this.userSettings);
  }

  /**
   * Gets raw workspace overrides.
   */
  static getWorkspaceSettings(): DeepPartial<IDESettings> {
    return deepClone(this.workspaceSettings);
  }

  /**
   * Subscribes to settings change events.
   */
  static subscribe(listener: SettingsChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  // ─── PRIVATE HELPERS ──────────────────────────────────────────────────

  private static notifyListeners(changedKey?: string): void {
    const current = this.effectiveSettings;
    this.listeners.forEach((listener) => {
      try {
        listener(current, changedKey);
      } catch (err) {
        console.error("[SettingsService] Error in settings listener:", err);
      }
    });
  }

  /**
   * Merges Default -> User -> Workspace settings with validation.
   */
  private static recalculateEffectiveSettings(): void {
    const resolved = deepClone(DEFAULT_SETTINGS);

    for (const def of SETTINGS_REGISTRY) {
      const [cat, prop] = def.key.split(".") as [SettingsCategory, string];

      // Default value
      let val = def.defaultValue;

      // Check User override
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userVal = (this.userSettings[cat] as any)?.[prop];
      if (userVal !== undefined) {
        val = sanitizeValue(def.key, userVal, def.defaultValue);
      }

      // Check Workspace override (takes precedence if valid and active)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const wsVal = (this.workspaceSettings[cat] as any)?.[prop];
      if (wsVal !== undefined) {
        val = sanitizeValue(def.key, wsVal, val);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (resolved[cat] as any)[prop] = val;
    }

    this.effectiveSettings = resolved;
  }

  /**
   * Immediately applies live settings changes to DOM / system environment.
   */
  private static applyLiveSettings(settings: IDESettings, changedKey?: string): void {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    // 1. Theme live update
    if (!changedKey || changedKey === "appearance.theme") {
      const root = document.documentElement;
      const theme = settings.appearance.theme;
      root.setAttribute("data-theme", theme);

      const isLightTheme = theme === "light" || theme === "vs-light";
      const isSystem = theme === "system";

      if (isSystem) {
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        if (prefersDark) {
          root.classList.add("dark");
        } else {
          root.classList.remove("dark");
        }
      } else if (isLightTheme) {
        root.classList.remove("dark");
      } else {
        root.classList.add("dark");
      }
    }
  }

  private static loadStoredUserSettings(): DeepPartial<IDESettings> {
    const storage = getStorage();
    if (!storage) return {};

    const userKey = this.getUserStorageKey();
    try {
      let raw = storage.getItem(userKey);

      // Check legacy settings key for migration if scoped key does not exist yet
      if (!raw) {
        const legacy = storage.getItem(SETTINGS_STORAGE_KEYS.LEGACY_USER_SETTINGS);
        if (legacy) {
          raw = legacy;
          try {
            storage.setItem(userKey, legacy);
          } catch {
            // Ignore write errors during read
          }
        }
      }

      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch (error) {
      console.warn("[SettingsService] Corrupt user settings in storage, resetting to defaults:", error);
      return {};
    }
  }

  private static persistUserSettings(settings: DeepPartial<IDESettings>): void {
    const storage = getStorage();
    if (!storage) return;

    try {
      const userKey = this.getUserStorageKey();
      const serialized = JSON.stringify(settings);
      storage.setItem(userKey, serialized);
      storage.setItem(
        SETTINGS_STORAGE_KEYS.SETTINGS_VERSION_KEY,
        String(SETTINGS_STORAGE_KEYS.CURRENT_VERSION)
      );

      // Mirror legacy key if guest/default for backward compatibility
      if (!this.activeUserId) {
        storage.setItem(SETTINGS_STORAGE_KEYS.LEGACY_USER_SETTINGS, serialized);
      }
    } catch (error) {
      console.error("[SettingsService] Failed to persist user settings:", error);
    }
  }

  private static loadStoredWorkspaceSettings(rootPath: string): DeepPartial<IDESettings> {
    const storage = getStorage();
    if (!storage) return {};

    try {
      const key = `${SETTINGS_STORAGE_KEYS.WORKSPACE_SETTINGS_PREFIX}${rootPath}`;
      const raw = storage.getItem(key);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch (error) {
      console.warn("[SettingsService] Corrupt workspace settings in storage:", error);
      return {};
    }
  }

  private static persistWorkspaceSettings(
    rootPath: string,
    settings: DeepPartial<IDESettings>
  ): void {
    const storage = getStorage();
    if (!storage) return;

    try {
      const key = `${SETTINGS_STORAGE_KEYS.WORKSPACE_SETTINGS_PREFIX}${rootPath}`;
      storage.setItem(key, JSON.stringify(settings));
    } catch (error) {
      console.error("[SettingsService] Failed to persist workspace settings:", error);
    }
  }
}

