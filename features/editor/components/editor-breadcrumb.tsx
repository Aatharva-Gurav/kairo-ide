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
    <div className="flex h-7 w-full items-center gap-1 border-b border-border bg-background/50 px-3 text-[11px] text-muted-foreground select-none overflow-x-auto no-scrollbar">
      {activeWorkspace && (
        <div className="flex items-center gap-1 shrink-0 font-medium text-foreground/80">
          <HugeiconsIcon icon={Folder01Icon} className="size-3 text-sidebar-primary" />
          <span>{activeWorkspace.name}</span>
        </div>
      )}

      {parts.map((part, index) => {
        const isLast = index === parts.length - 1;
        return (
          <React.Fragment key={index}>
            <HugeiconsIcon icon={ArrowRight01Icon} className="size-2.5 text-muted-foreground/60 shrink-0" />
            <div
              className={`flex items-center gap-1 shrink-0 ${
                isLast ? "text-foreground font-medium" : "text-muted-foreground/90"
              }`}
            >
              {isLast && <FileIcon name={part} isDirectory={false} className="size-3 shrink-0" />}
              <span className="truncate max-w-[150px]">{part}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

