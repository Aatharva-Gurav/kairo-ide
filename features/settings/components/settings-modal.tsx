"use client";

import React, { useEffect } from "react";
import { useSettings, SettingsViewTab } from "../store";
import { useWorkspace } from "@/features/workspace/store";
import { SettingsCategoryView } from "./settings-category-view";
import { KeyboardShortcutsSettings } from "./keyboard-shortcuts-settings";
import { Button } from "@/components/ui/button";
import {
  X,
  Search,
  Palette,
  FileText,
  File,
  Folder,
  FolderSearch,
  Keyboard,
  Settings,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface CategoryNavOption {
  id: SettingsViewTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const CATEGORIES: CategoryNavOption[] = [
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "editor", label: "Text Editor", icon: FileText },
  { id: "suggestions", label: "Code Suggestions", icon: Sparkles },
  { id: "files", label: "Files & Autosave", icon: File },
  { id: "explorer", label: "File Explorer", icon: Folder },
  { id: "search", label: "Search", icon: FolderSearch },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: Keyboard },
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in-0 duration-200 ease-out"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl h-[84vh] rounded-2xl md:rounded-3xl border border-border/70 dark:border-white/10 bg-card/98 dark:bg-[#1f1f1f]/98 shadow-2xl ring-1 ring-black/5 dark:ring-white/10 backdrop-blur-xl flex flex-col overflow-hidden text-card-foreground animate-in zoom-in-95 duration-200 ease-[cubic-bezier(0.16,1,0.3,1)]"
      >
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-border/60 bg-transparent">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center">
                <Settings className="size-4" />
              </div>
              <h1 className="text-base font-semibold tracking-tight text-foreground">Settings</h1>
            </div>

            {/* Scope Selector: User vs Workspace (ChatGPT Segmented Pill Style) */}
            <div className="flex items-center p-1 rounded-xl border border-border/50 bg-muted/40 ml-4">
              <button
                type="button"
                onClick={() => setActiveScope("user")}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-lg transition-all duration-120 cursor-pointer active:scale-95",
                  activeScope === "user"
                    ? "bg-card text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                User
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
                  "px-3 py-1 text-xs font-medium rounded-lg transition-all duration-120 flex items-center gap-1.5 active:scale-95",
                  !activeWorkspace
                    ? "opacity-50 cursor-not-allowed text-muted-foreground"
                    : activeScope === "workspace"
                    ? "bg-card text-foreground shadow-xs font-semibold cursor-pointer"
                    : "text-muted-foreground hover:text-foreground cursor-pointer"
                )}
              >
                <span>Workspace</span>
                {activeWorkspace && (
                  <span className="text-[10px] text-muted-foreground/80 font-mono truncate max-w-[100px]">
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
              className="rounded-xl h-8 px-3 text-xs cursor-pointer group active:scale-95 transition-all duration-120"
            >
              <RotateCcw className="size-3 mr-1.5 transition-transform duration-300 group-hover:rotate-180" />
              Reset All
            </Button>
            <button
              onClick={closeSettings}
              title="Close Settings (Esc)"
              className="size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-all cursor-pointer"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-2.5 border-b border-border/50 bg-muted/15 flex items-center gap-2.5">
          <Search className="size-4 text-muted-foreground/70 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search settings (e.g. font, theme, autosave, tab size)..."
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 outline-none font-sans"
            autoFocus
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-0.5 rounded-full hover:bg-muted/60 transition-colors cursor-pointer active:scale-95"
            >
              Clear
            </button>
          )}
        </div>

        {/* Main Content Body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Categories Sidebar */}
          <div className="w-56 border-r border-border/60 bg-muted/15 dark:bg-black/10 p-3 flex flex-col gap-1 select-none shrink-0">
            <span className="text-[10px] font-semibold text-muted-foreground/70 px-3 py-1.5 uppercase tracking-wider">
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
                    "group relative flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-all duration-120 text-left cursor-pointer active:scale-98",
                    isSelected
                      ? "bg-card dark:bg-[#2a2a2a] text-foreground font-semibold shadow-xs border border-border/50 dark:border-white/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <cat.icon className={cn(
                    "size-3.5 shrink-0 transition-colors",
                    isSelected ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                  )} />
                  <span className="truncate">{cat.label}</span>
                </button>
              );
            })}
          </div>

          {/* Settings Pane */}
          <div key={activeCategory} className="flex-1 min-w-0 p-6 md:p-8 overflow-y-auto bg-transparent animate-in fade-in-50 duration-150">
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
