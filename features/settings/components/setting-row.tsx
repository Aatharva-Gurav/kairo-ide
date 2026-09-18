"use client";

import React from "react";
import { SettingDefinition } from "../types";
import { useSettings } from "../store";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { ReloadIcon } from "@hugeicons/core-free-icons";

interface SettingRowProps {
  definition: SettingDefinition;
}

export function SettingRow({ definition }: SettingRowProps) {
  const {
    getSetting,
    updateSetting,
    resetSetting,
    isSettingModified,
    activeScope,
  } = useSettings();

  const value = getSetting(definition.key);
  const isModified = isSettingModified(definition.key, activeScope);

  const handleReset = () => {
    resetSetting(definition.key, activeScope);
  };

  return (
    <div className="py-3 px-4 rounded-lg border border-border/60 bg-card/40 hover:bg-card/70 transition-colors flex flex-col gap-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-foreground select-none">
              {definition.label}
            </span>
            {isModified && (
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-500 font-semibold border border-amber-500/20">
                Modified
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {definition.description}
          </p>
          <span className="text-[10px] font-mono text-muted-foreground/60 select-all">
            {definition.key}
          </span>
        </div>

        {/* Reset button if modified */}
        {isModified && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={handleReset}
            title="Reset to default"
            className="text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
          >
            <HugeiconsIcon icon={ReloadIcon} className="size-3" />
          </Button>
        )}
      </div>

      {/* Value Control */}
      <div className="pt-1">
        {definition.type === "boolean" && (
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => updateSetting(definition.key, e.target.checked, activeScope)}
              className="size-4 rounded border-border text-primary focus:ring-ring cursor-pointer accent-primary"
            />
            <span className="text-xs text-foreground font-medium">
              {value ? "Enabled" : "Disabled"}
            </span>
          </label>
        )}

        {definition.type === "select" && (
          <select
            value={String(value ?? definition.defaultValue)}
            onChange={(e) => updateSetting(definition.key, e.target.value, activeScope)}
            className="h-8 w-full max-w-xs rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
          >
            {definition.options?.map((opt) => (
              <option key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {definition.type === "number" && (
          <div className="flex items-center gap-2 max-w-[160px]">
            <input
              type="number"
              min={definition.min}
              max={definition.max}
              step={definition.step || 1}
              value={Number(value ?? definition.defaultValue)}
              onChange={(e) => {
                const parsed = Number(e.target.value);
                if (!isNaN(parsed)) {
                  updateSetting(definition.key, parsed, activeScope);
                }
              }}
              className="h-8 w-full rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {definition.min !== undefined && definition.max !== undefined && (
              <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                ({definition.min}–{definition.max})
              </span>
            )}
          </div>
        )}

        {definition.type === "string" && (
          <input
            type="text"
            value={String(value ?? definition.defaultValue)}
            onChange={(e) => updateSetting(definition.key, e.target.value, activeScope)}
            className="h-8 w-full max-w-md rounded-md border border-input bg-background px-2.5 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
          />
        )}
      </div>
    </div>
  );
}

