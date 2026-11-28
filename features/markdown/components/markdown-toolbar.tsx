"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  Heading,
  Bold,
  Italic,
  Strikethrough,
  Code,
  FileCode2,
  Link2,
  Image as ImageIcon,
  Quote,
  List,
  ListOrdered,
  ListTodo,
  Table,
  Eye,
  Pencil,
  Columns2,
} from "lucide-react";

export type MarkdownViewMode = "edit" | "preview" | "split";

export type MarkdownFormatAction =
  | "heading"
  | "bold"
  | "italic"
  | "strike"
  | "inlineCode"
  | "codeBlock"
  | "link"
  | "image"
  | "quote"
  | "ul"
  | "ol"
  | "task"
  | "table";

interface MarkdownToolbarProps {
  viewMode: MarkdownViewMode;
  onChangeViewMode: (mode: MarkdownViewMode) => void;
  onFormat: (action: MarkdownFormatAction) => void;
  words: number;
  characters: number;
  readonly?: boolean;
}

const FORMAT_ITEMS: Array<{
  action: MarkdownFormatAction;
  label: string;
  shortcut?: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { action: "heading", label: "Heading", icon: Heading },
  { action: "bold", label: "Bold", shortcut: "Ctrl+B", icon: Bold },
  { action: "italic", label: "Italic", shortcut: "Ctrl+I", icon: Italic },
  { action: "strike", label: "Strikethrough", icon: Strikethrough },
  { action: "inlineCode", label: "Inline Code", icon: Code },
  { action: "codeBlock", label: "Code Block", icon: FileCode2 },
  { action: "link", label: "Insert Link", shortcut: "Ctrl+K", icon: Link2 },
  { action: "image", label: "Insert Image", icon: ImageIcon },
  { action: "quote", label: "Blockquote", icon: Quote },
  { action: "ul", label: "Unordered List", icon: List },
  { action: "ol", label: "Ordered List", icon: ListOrdered },
  { action: "task", label: "Task List", icon: ListTodo },
  { action: "table", label: "Insert Table", icon: Table },
];

export const MarkdownToolbar = React.memo(function MarkdownToolbar({
  viewMode,
  onChangeViewMode,
  onFormat,
  words,
  characters,
  readonly = false,
}: MarkdownToolbarProps) {
  return (
    <div className="flex h-8 w-full shrink-0 items-center justify-between gap-2 border-b border-border/70 bg-muted/20 px-2.5 select-none overflow-x-auto no-scrollbar">
      {/* Left: Formatting actions (disabled in pure Preview or readonly) */}
      <div className="flex items-center gap-0.5">
        {FORMAT_ITEMS.map((item) => {
          const Icon = item.icon;
          const isDisabled = readonly || viewMode === "preview";
          return (
            <Tooltip key={item.action}>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    disabled={isDisabled}
                    onClick={() => onFormat(item.action)}
                    aria-label={item.label}
                    className="size-6 text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-35"
                  />
                }
              >
                <Icon className="size-3.5" />
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Right: Word/char stats + Edit / Split / Preview mode switcher */}
      <div className="flex items-center gap-2 shrink-0">
        <span className="hidden sm:inline-block text-[11px] font-mono text-muted-foreground tabular-nums">
          {words} {words === 1 ? "word" : "words"} · {characters} chars
        </span>

        <div className="flex items-center rounded-md border border-border/70 bg-background/80 p-0.5">
          <button
            type="button"
            onClick={() => onChangeViewMode("edit")}
            title="Edit Mode"
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer transition-colors",
              viewMode === "edit"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Pencil className="size-3" />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode("split")}
            title="Split View (Ctrl+Shift+V)"
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer transition-colors",
              viewMode === "split"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Columns2 className="size-3" />
            <span>Split</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeViewMode("preview")}
            title="Preview Mode (Ctrl+Shift+V)"
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium cursor-pointer transition-colors",
              viewMode === "preview"
                ? "bg-primary text-primary-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Eye className="size-3" />
            <span>Preview</span>
          </button>
        </div>
      </div>
    </div>
  );
});
