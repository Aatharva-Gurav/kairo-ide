"use client";

import React from "react";
import { EditorDocument } from "../types";
import { useWorkspace } from "@/features/workspace/store";
import { relativePath } from "@/lib/tauri-ipc";
import { FileIcon } from "@/features/icon-theme/components/file-icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Folder01Icon } from "@hugeicons/core-free-icons";

interface EditorBreadcrumbProps {
  document: EditorDocument;
}

export function EditorBreadcrumb({ document }: EditorBreadcrumbProps) {
  const { activeWorkspace } = useWorkspace();

  const rel = activeWorkspace
    ? relativePath(activeWorkspace.rootPath, document.path)
    : document.path;

  const parts = rel ? rel.split("/").filter(Boolean) : [document.title];

  return (
    <div className="flex h-6.5 w-full items-center gap-1.5 border-b border-border/70 bg-background/90 px-3 text-[11px] text-muted-foreground select-none overflow-x-auto no-scrollbar">
      {activeWorkspace && (
        <div className="flex items-center gap-1 shrink-0 font-medium text-foreground/80 text-xs">
          <HugeiconsIcon icon={Folder01Icon} className="size-3.5 text-sidebar-primary" />
          <span className="tracking-tight">{activeWorkspace.name}</span>
        </div>
      )}

      {parts.map((part, index) => {
        const isLast = index === parts.length - 1;
        return (
          <React.Fragment key={index}>
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-2.5 text-muted-foreground/40 shrink-0" />
            <div
              className={`group flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded transition-colors duration-120 ${
                isLast
                  ? "text-foreground font-medium bg-muted/25"
                  : "text-muted-foreground/80 hover:text-foreground hover:bg-muted/40 cursor-pointer"
              }`}
            >
              {isLast && <FileIcon name={part} isDirectory={false} className="size-3 shrink-0" />}
              <span className="truncate max-w-[160px] tracking-tight">{part}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}
