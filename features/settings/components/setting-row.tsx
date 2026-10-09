"use client";

import React from "react";
import { SettingDefinition } from "../types";
import { useSettings } from "../store";
import { RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingRowProps {
  definition: SettingDefinition;
}

function NumberSettingInput({
  definition,
  value,
  onCommit,
}: {
  definition: SettingDefinition;
  value: unknown;
  onCommit: (val: number) => void;
}) {
  const currentNum = Number(value ?? definition.defaultValue);
  const [localText, setLocalText] = React.useState<string>(String(currentNum));

  // Sync with external value changes (e.g. reset to default or scope change)
  React.useEffect(() => {
    setLocalText(String(currentNum));
  }, [currentNum]);

  const commitValue = () => {
    let parsed = Number(localText.trim());
    if (isNaN(parsed) || localText.trim() === "") {
      parsed = Number(definition.defaultValue);
    }
    if (definition.min !== undefined && parsed < definition.min) {
      parsed = definition.min;
    }
    if (definition.max !== undefined && parsed > definition.max) {
      parsed = definition.max;
    }
    setLocalText(String(parsed));
    onCommit(parsed);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setLocalText(raw);
    const parsed = Number(raw.trim());
    // Live commit only if parsed is a complete valid number within bounds
    if (
      !isNaN(parsed) &&
      raw.trim() !== "" &&
      (definition.min === undefined || parsed >= definition.min) &&
      (definition.max === undefined || parsed <= definition.max)
    ) {
      onCommit(parsed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitValue();
      (e.target as HTMLInputElement).blur();
    }
  };

  return (
    <div className="flex items-center gap-2 max-w-[180px]">
      <input
        type="number"
        min={definition.min}
        max={definition.max}
        step={definition.step || 1}
        value={localText}
        onChange={handleChange}
        onBlur={commitValue}
        onKeyDown={handleKeyDown}
        className="h-8.5 w-full rounded-xl border border-border/70 bg-background/80 px-3 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs transition-all"
      />
      {definition.min !== undefined && definition.max !== undefined && (
        <span className="text-[10px] text-muted-foreground font-mono shrink-0">
          ({definition.min}–{definition.max})
        </span>
      )}
    </div>
  );
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
    <div className="p-4 rounded-2xl border border-border/60 bg-card/60 dark:bg-[#202020]/50 hover:bg-card/90 dark:hover:bg-[#252525]/80 transition-all duration-150 flex flex-col gap-2.5 shadow-2xs">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-foreground select-none">
              {definition.label}
            </span>
            {isModified && (
              <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded-full bg-amber-500/10 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400 font-semibold border border-amber-500/25">
                Modified
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {definition.description}
          </p>
          <span className="text-[10px] font-mono text-muted-foreground/50 select-all block mt-0.5">
            {definition.key}
          </span>
        </div>

        {/* Reset button if modified */}
        {isModified && (
          <button
            onClick={handleReset}
            title="Reset to default"
            className="size-7 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 shrink-0 cursor-pointer active:scale-95 transition-all duration-120"
          >
            <RotateCcw className="size-3" />
          </button>
        )}
      </div>

      {/* Value Control */}
      <div className="pt-1">
        {definition.type === "boolean" && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(value)}
              onClick={() => updateSetting(definition.key, !value, activeScope)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                value ? "bg-primary" : "bg-muted/80 dark:bg-white/20"
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out",
                  value ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
            <span className="text-xs text-foreground font-medium select-none">
              {value ? "Enabled" : "Disabled"}
            </span>
          </div>
        )}

        {definition.type === "select" && (
          <select
            value={String(value ?? definition.defaultValue)}
            onChange={(e) => updateSetting(definition.key, e.target.value, activeScope)}
            className="h-8.5 w-full max-w-xs rounded-xl border border-border/70 bg-background/80 px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer shadow-2xs transition-all"
          >
            {definition.options?.map((opt) => (
              <option key={String(opt.value)} value={String(opt.value)}>
                {opt.label}
              </option>
            ))}
          </select>
        )}

        {definition.type === "number" && (
          <NumberSettingInput
            definition={definition}
            value={value}
            onCommit={(val) => updateSetting(definition.key, val, activeScope)}
          />
        )}

        {definition.type === "string" && (
          <input
            type="text"
            value={String(value ?? definition.defaultValue)}
            onChange={(e) => updateSetting(definition.key, e.target.value, activeScope)}
            className="h-8.5 w-full max-w-md rounded-xl border border-border/70 bg-background/80 px-3 text-xs text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary shadow-2xs transition-all"
          />
        )}
      </div>
    </div>
  );
}
