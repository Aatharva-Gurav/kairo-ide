"use client";

import React, { useEffect } from "react";
import { useSettings, SettingsViewTab } from "../store";
import { useWorkspace } from "@/features/workspace/store";
import { SettingsCategoryView } from "./settings-category-view";
import { KeyboardShortcutsSettings } from "./keyboard-shortcuts-settings";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Search01Icon,
  PaintBoardIcon,
  File01Icon,
  Folder01Icon,
  FolderSearchIcon,
  KeyboardIcon,
  Settings01Icon,
  ReloadIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

interface CategoryNavOption {
  id: SettingsViewTab;
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: any;
}

const CATEGORIES: CategoryNavOption[] = [
  { id: "appearance", label: "Appearance", icon: PaintBoardIcon },
  { id: "editor", label: "Text Editor", icon: File01Icon },
  { id: "files", label: "Files & Autosave", icon: File01Icon },
  { id: "explorer", label: "File Explorer", icon: Folder01Icon },
  { id: "search", label: "Search", icon: FolderSearchIcon },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: KeyboardIcon },
];

export function SettingsModal() {
  const {
    isSettingsModalOpen,
    closeSettings,
    activeCategory,
    setActiveCategory,
    activeScope,
    setActiveScope,
    searchQuery,
    setSearchQuery,
    resetAll,
  } = useSettings();

  const { activeWorkspace } = useWorkspace();

  // Handle Escape key to close
  useEffect(() => {
    if (!isSettingsModalOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSettings();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsModalOpen, closeSettings]);

  if (!isSettingsModalOpen) return null;

  return (
    <div
      onClick={closeSettings}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 animate-in fade-in-0"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl h-[80vh] rounded-xl border border-border bg-card shadow-2xl flex flex-col overflow-hidden text-card-foreground animate-in zoom-in-95"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-border bg-background">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Settings01Icon} className="size-4 text-primary" />
              <h1 className="text-sm font-bold text-foreground">Settings</h1>
            </div>

            {/* Scope Selector: User vs Workspace */}
            <div className="flex items-center p-0.5 rounded-lg border border-border bg-muted/40 ml-4">
              <button
                type="button"
                onClick={() => setActiveScope("user")}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer",
                  activeScope === "user"
                    ? "bg-background text-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                User (Global)
              </button>
              <button
                type="button"
                onClick={() => {
                  if (activeWorkspace) {
                    setActiveScope("workspace");
                  }
                }}
                disabled={!activeWorkspace}
                title={
                  activeWorkspace
                    ? `Settings for ${activeWorkspace.name}`
                    : "No workspace currently open"
                }
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5",
                  !activeWorkspace
                    ? "opacity-50 cursor-not-allowed text-muted-foreground"
                    : activeScope === "workspace"
                    ? "bg-background text-foreground shadow-2xs font-semibold cursor-pointer"
                    : "text-muted-foreground hover:text-foreground cursor-pointer"
                )}
              >
                <span>Workspace</span>
                {activeWorkspace && (
                  <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[100px]">
                    ({activeWorkspace.name})
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Right Actions: Reset All & Close */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="xs"
              onClick={() => resetAll(activeScope)}
              title={`Reset all ${activeScope} settings to defaults`}
              className="cursor-pointer"
            >
              <HugeiconsIcon icon={ReloadIcon} className="size-3 mr-1" />
              Reset All
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={closeSettings}
              title="Close Settings (Esc)"
              className="cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </Button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-2.5 border-b border-border bg-muted/20 flex items-center gap-2">
          <HugeiconsIcon icon={Search01Icon} className="size-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search settings (e.g. font, theme, autosave, tab size)..."
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none font-sans"
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Main Content Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Categories Sidebar */}
          <div className="w-52 border-r border-border bg-sidebar p-2 flex flex-col gap-0.5 select-none shrink-0">
            <span className="text-[10px] font-semibold text-muted-foreground px-2.5 py-1 uppercase tracking-wider">
              Categories
            </span>
            {CATEGORIES.map((cat) => {
              const isSelected = activeCategory === cat.id && !searchQuery.trim();
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setActiveCategory(cat.id);
                  }}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors text-left cursor-pointer",
                    isSelected
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <HugeiconsIcon icon={cat.icon} className="size-3.5 shrink-0" />
                  <span className="truncate">{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Settings Pane */}
          <div className="flex-1 min-w-0 p-6 overflow-y-auto bg-background/50">
            {activeCategory === "shortcuts" && !searchQuery.trim() ? (
              <KeyboardShortcutsSettings />
            ) : (
              <SettingsCategoryView />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

