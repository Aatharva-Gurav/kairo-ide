"use client";

import React, { useMemo } from "react";
import { useSettings } from "../store";
import { SettingRow } from "./setting-row";
import {
  getCategoryDefinitions,
  searchDefinitions,
} from "../registry";
import { SettingsCategory } from "../types";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";

const CATEGORY_TITLES: Record<SettingsCategory, { title: string; description: string }> = {
  appearance: {
    title: "Appearance",
    description: "Customize workbench themes, fonts, and layout visibility.",
  },
  editor: {
    title: "Text Editor",
    description: "Configure code formatting, typography, whitespace, and Monaco editor behaviors.",
  },
  files: {
    title: "Files & Autosave",
    description: "Configure autosave intervals, encoding, trimming, and file lifecycle.",
  },
  explorer: {
    title: "File Explorer",
    description: "Manage file tree sorting, hidden files, compact folders, and delete prompts.",
  },
  search: {
    title: "Search",
    description: "Default search configurations, case sensitivity, and exclusion filters.",
  },
  keyboard: {
    title: "Keyboard Dispatch",
    description: "Configure keyboard dispatch mode and input trapping rules.",
  },
  suggestions: {
    title: "Code Suggestions",
    description: "Configure code completions, quick suggestions, trigger characters, and preview behavior.",
  },
};

export function SettingsCategoryView() {
  const {
    activeCategory,
    searchQuery,
    resetCategory,
    activeScope,
  } = useSettings();

  const isSearching = Boolean(searchQuery.trim());

  const displayedDefinitions = useMemo(() => {
    if (isSearching) {
      return searchDefinitions(searchQuery);
    }
    if (activeCategory === "shortcuts") {
      return [];
    }
    return getCategoryDefinitions(activeCategory as SettingsCategory);
  }, [isSearching, searchQuery, activeCategory]);

  if (isSearching) {
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between pb-3.5 border-b border-border/60">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Search Results
              </h2>
              <span className="text-[11px] font-medium font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {displayedDefinitions.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Matching &ldquo;{searchQuery}&rdquo; across all workbench settings
            </p>
          </div>
        </div>

        {displayedDefinitions.length > 0 ? (
          <div className="flex flex-col gap-3.5">
            {displayedDefinitions.map((def) => (
              <SettingRow key={def.key} definition={def} />
            ))}
          </div>
        ) : (
          <div className="py-20 text-center text-xs text-muted-foreground">
            No settings match &ldquo;{searchQuery}&rdquo;.
          </div>
        )}
      </div>
    );
  }

  const categoryKey = activeCategory as SettingsCategory;
  const meta = CATEGORY_TITLES[categoryKey] || {
    title: categoryKey,
    description: "",
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between pb-3.5 border-b border-border/60">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">{meta.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{meta.description}</p>
        </div>

        <Button
          variant="outline"
          size="xs"
          onClick={() => resetCategory(categoryKey, activeScope)}
          title={`Reset ${meta.title} settings to default`}
          className="rounded-xl h-8 px-3 text-xs font-medium cursor-pointer"
        >
          <RotateCcw className="size-3 mr-1.5" />
          Reset Category
        </Button>
      </div>

      <div className="flex flex-col gap-3.5">
        {displayedDefinitions.map((def) => (
          <SettingRow key={def.key} definition={def} />
        ))}
      </div>
    </div>
  );
}
