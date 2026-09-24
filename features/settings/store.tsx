"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  IDESettings,
  SettingsCategory,
  SettingScope,
  DeepPartial,
} from "./types";
import { SettingsService } from "./services/settings.service";
import { useWorkspaceOptional } from "@/features/workspace/store";

export type SettingsViewTab = SettingsCategory | "shortcuts";

export interface SettingsContextValue {
  settings: IDESettings;
  userSettings: DeepPartial<IDESettings>;
  workspaceSettings: DeepPartial<IDESettings>;
  activeScope: "user" | "workspace";
  setActiveScope: (scope: "user" | "workspace") => void;
  isSettingsModalOpen: boolean;
  setSettingsModalOpen: (open: boolean) => void;
  activeCategory: SettingsViewTab;
  setActiveCategory: (category: SettingsViewTab) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  openSettings: (category?: SettingsViewTab) => void;
  closeSettings: () => void;

  getSetting: <T>(key: string) => T;
  updateSetting: <T>(key: string, value: T, scope?: "user" | "workspace") => void;
  resetSetting: (key: string, scope?: "user" | "workspace") => void;
  resetCategory: (category: SettingsCategory, scope?: "user" | "workspace") => void;
  resetAll: (scope?: "user" | "workspace") => void;
  isSettingModified: (key: string, scope?: SettingScope) => boolean;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const workspaceContext = useWorkspaceOptional();
  const activeWorkspace = workspaceContext?.activeWorkspace ?? null;
  const [settings, setSettings] = useState<IDESettings>(() => SettingsService.init());
  const [userSettings, setUserSettings] = useState<DeepPartial<IDESettings>>(() =>
    SettingsService.getUserSettings()
  );
  const [workspaceSettings, setWorkspaceSettings] = useState<DeepPartial<IDESettings>>(() =>
    SettingsService.getWorkspaceSettings()
  );

  const [activeScope, setActiveScope] = useState<"user" | "workspace">("user");
  const [isSettingsModalOpen, setSettingsModalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<SettingsViewTab>("appearance");
  const [searchQuery, setSearchQuery] = useState("");

  // Sync workspace path changes to SettingsService
  useEffect(() => {
    SettingsService.setWorkspaceRootPath(activeWorkspace?.rootPath || null);
  }, [activeWorkspace]);

  // Subscribe to settings changes from the central service
  useEffect(() => {
    return SettingsService.subscribe((newEffective) => {
      setSettings(newEffective);
      setUserSettings(SettingsService.getUserSettings());
      setWorkspaceSettings(SettingsService.getWorkspaceSettings());
    });
  }, []);

  const openSettings = useCallback((category?: SettingsViewTab) => {
    if (category) {
      setActiveCategory(category);
    }
    setSearchQuery("");
    setSettingsModalOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsModalOpen(false);
  }, []);

  const getSetting = useCallback(<T,>(key: string): T => {
    return SettingsService.getSetting<T>(key);
  }, []);

  const updateSetting = useCallback(
    <T,>(key: string, value: T, scope?: "user" | "workspace") => {
      const targetScope = scope || activeScope;
      SettingsService.updateSetting(key, value, targetScope);
    },
    [activeScope]
  );

  const resetSetting = useCallback(
    (key: string, scope?: "user" | "workspace") => {
      const targetScope = scope || activeScope;
      SettingsService.resetSetting(key, targetScope);
    },
    [activeScope]
  );

  const resetCategory = useCallback(
    (category: SettingsCategory, scope?: "user" | "workspace") => {
      const targetScope = scope || activeScope;
      SettingsService.resetCategory(category, targetScope);
    },
    [activeScope]
  );

  const resetAll = useCallback(
    (scope?: "user" | "workspace") => {
      const targetScope = scope || activeScope;
      SettingsService.resetAll(targetScope);
    },
    [activeScope]
  );

  const isSettingModified = useCallback(
    (key: string, scope?: SettingScope): boolean => {
      return SettingsService.isSettingModified(key, scope);
    },
    []
  );

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      userSettings,
      workspaceSettings,
      activeScope,
      setActiveScope,
      isSettingsModalOpen,
      setSettingsModalOpen,
      activeCategory,
      setActiveCategory,
      searchQuery,
      setSearchQuery,
      openSettings,
      closeSettings,
      getSetting,
      updateSetting,
      resetSetting,
      resetCategory,
      resetAll,
      isSettingModified,
    }),
    [
      settings,
      userSettings,
      workspaceSettings,
      activeScope,
      isSettingsModalOpen,
      activeCategory,
      searchQuery,
      openSettings,
      closeSettings,
      getSetting,
      updateSetting,
      resetSetting,
      resetCategory,
      resetAll,
      isSettingModified,
    ]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

const defaultSettingsFallback: SettingsContextValue = {
  settings: SettingsService.getEffectiveSettings(),
  userSettings: SettingsService.getUserSettings(),
  workspaceSettings: SettingsService.getWorkspaceSettings(),
  activeScope: "user",
  setActiveScope: () => {},
  isSettingsModalOpen: false,
  setSettingsModalOpen: () => {},
  activeCategory: "appearance",
  setActiveCategory: () => {},
  searchQuery: "",
  setSearchQuery: () => {},
  openSettings: () => {},
  closeSettings: () => {},
  getSetting: <T,>(key: string): T => SettingsService.getSetting<T>(key),
  updateSetting: <T,>(key: string, value: T, scope?: "user" | "workspace") => {
    SettingsService.updateSetting(key, value, scope || "user");
  },
  resetSetting: (key: string, scope?: "user" | "workspace") => {
    SettingsService.resetSetting(key, scope);
  },
  resetCategory: (category: SettingsCategory, scope?: "user" | "workspace") => {
    SettingsService.resetCategory(category, scope);
  },
  resetAll: (scope?: "user" | "workspace") => {
    SettingsService.resetAll(scope);
  },
  isSettingModified: (key: string, scope?: SettingScope) => {
    return SettingsService.isSettingModified(key, scope);
  },
};

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    return defaultSettingsFallback;
  }
  return context;
}

