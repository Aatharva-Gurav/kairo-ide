"use client";

import React from "react";
import { EditorDocument } from "../types";
import { useWorkspace } from "@/features/workspace/store";
import { useEditor } from "../store";
import { relativePath } from "@/lib/tauri-ipc";
import { FileIcon } from "@/features/icon-theme/components/file-icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Folder01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

interface EditorBreadcrumbProps {
  document: EditorDocument;
}

export function EditorBreadcrumb({ document }: EditorBreadcrumbProps) {
  const { activeWorkspace } = useWorkspace();
  const { revealInExplorer, monacoEditorRef } = useEditor();

  const rawRel = activeWorkspace
    ? relativePath(activeWorkspace.rootPath, document.path)
    : document.path;

  // Normalize path separators for cross-platform (Windows \ vs UNIX /)
  const normalizedRel = rawRel ? rawRel.replace(/\\/g, "/") : "";
  const parts = normalizedRel ? normalizedRel.split("/").filter(Boolean) : [document.title];

  const handleSegmentClick = (index: number) => {
    if (!activeWorkspace) return;
    const subPath = parts.slice(0, index + 1).join("/");
    const normalizedRoot = activeWorkspace.rootPath.replace(/\\/g, "/").replace(/\/$/, "");
    const fullPath = `${normalizedRoot}/${subPath}`;
    revealInExplorer(fullPath);
    if (index === parts.length - 1 && monacoEditorRef.current) {
      monacoEditorRef.current.focus();
    }
  };

  const handleWorkspaceClick = () => {
    if (activeWorkspace) {
      revealInExplorer(activeWorkspace.rootPath);
    }
  };

  return (
    <div className="relative z-20 shrink-0 flex h-6 w-full items-center gap-1 border-b border-border/60 bg-background/80 px-2.5 text-[11px] text-muted-foreground select-none overflow-x-auto no-scrollbar font-sans backdrop-blur-xs">
      {activeWorkspace && (
        <>
          <div
            onClick={handleWorkspaceClick}
            title={activeWorkspace.rootPath}
            className="flex items-center gap-1.5 shrink-0 font-medium text-foreground/80 hover:text-foreground text-[11px] px-1 py-0.5 rounded hover:bg-muted/50 cursor-pointer transition-colors duration-100"
          >
            <HugeiconsIcon icon={Folder01Icon} className="size-3 text-primary/90 shrink-0" />
            <span className="tracking-tight truncate max-w-[120px]">{activeWorkspace.name}</span>
          </div>

          <svg viewBox="0 0 16 16" fill="currentColor" className="size-2.5 text-muted-foreground/35 shrink-0">
            <path
              fillRule="evenodd"
              d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </>
      )}

      {parts.map((part, index) => {
        const isLast = index === parts.length - 1;
        return (
          <React.Fragment key={index}>
            {index > 0 && (
              <svg viewBox="0 0 16 16" fill="currentColor" className="size-2.5 text-muted-foreground/35 shrink-0">
                <path
                  fillRule="evenodd"
                  d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <div
              onClick={() => handleSegmentClick(index)}
              title={part}
              className={cn(
                "group flex items-center gap-1.5 shrink-0 px-1.5 py-0.5 rounded transition-colors duration-100 cursor-pointer",
                isLast
                  ? "text-foreground font-medium hover:bg-muted/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              )}
            >
              <FileIcon name={part} isDirectory={!isLast} className="size-3 shrink-0" />
              <span className="truncate max-w-[160px] tracking-tight">{part}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
