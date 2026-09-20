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
import { HugeiconsIcon } from "@hugeicons/react";
import { ReloadIcon } from "@hugeicons/core-free-icons";

const CATEGORY_TITLES: Record<SettingsCategory, { title: string; description: string }> = {
  appearance: {
    title: "Appearance",
    description: "Customize workbench themes, density, fonts, and layout visibility.",
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
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between pb-3 border-b border-border/80">
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Search Results ({displayedDefinitions.length})
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Matching &ldquo;{searchQuery}&rdquo; across all settings
            </p>
          </div>
        </div>

        {displayedDefinitions.length > 0 ? (
          <div className="flex flex-col gap-3">
            {displayedDefinitions.map((def) => (
              <SettingRow key={def.key} definition={def} />
            ))}
          </div>
        ) : (
          <div className="py-16 text-center text-xs text-muted-foreground italic">
            No settings match your search query.
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between pb-3 border-b border-border/80">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-foreground">{meta.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{meta.description}</p>
        </div>

        <Button
          variant="outline"
          size="xs"
          onClick={() => resetCategory(categoryKey, activeScope)}
          title={`Reset ${meta.title} settings to default`}
          className="cursor-pointer"
        >
          <HugeiconsIcon icon={ReloadIcon} className="size-3 mr-1" />
          Reset Category
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {displayedDefinitions.map((def) => (
          <SettingRow key={def.key} definition={def} />
        ))}
      </div>
    </div>
  );
}
