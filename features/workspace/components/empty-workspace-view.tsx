"use client";

import React, { useState, useMemo } from "react";
import { useWorkspace } from "../store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from "@/components/ui/empty";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Folder01Icon,
  Cancel01Icon,
  AlertCircleIcon,
  Clock01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function EmptyWorkspaceView() {
  const {
    openFolder,
    openWorkspacePath,
    recentWorkspaces,
    removeRecent,
    clearRecent,
    error,
    clearError,
  } = useWorkspace();

  const [searchQuery, setSearchQuery] = useState("");

  const filteredRecents = useMemo(() => {
    if (!searchQuery.trim()) return recentWorkspaces;
    const q = searchQuery.toLowerCase();
    return recentWorkspaces.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.rootPath.toLowerCase().includes(q) ||
        (p.projectTypes && p.projectTypes.some((t) => t.toLowerCase().includes(q)))
    );
  }, [recentWorkspaces, searchQuery]);

  return (
    <div className="flex flex-col gap-4 p-4 text-sidebar-foreground">
      {error && (
        <div className="flex items-start gap-2 rounded-md bg-destructive/10 p-2.5 text-xs text-destructive">
          <HugeiconsIcon icon={AlertCircleIcon} className="size-4 shrink-0 mt-0.5" />
          <div className="flex-1 leading-snug">{error}</div>
          <button
            onClick={clearError}
            className="text-destructive/70 hover:text-destructive shrink-0 cursor-pointer"
            title="Dismiss error"
          >
            <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
          </button>
        </div>
      )}

      {/* Primary Empty Workspace Call-to-Action */}
      <Empty className="border border-dashed border-sidebar-border/80 bg-sidebar-accent/15 p-4 rounded-xl gap-3">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-9 rounded-lg bg-sidebar-primary/10 text-sidebar-primary mb-0.5">
            <HugeiconsIcon icon={Folder01Icon} className="size-4.5" />
          </EmptyMedia>
          <EmptyTitle className="text-sm font-semibold">No Folder Open</EmptyTitle>
          <EmptyDescription className="text-xs text-muted-foreground">
            Open a folder to start working
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="w-full">
          <Button
            onClick={() => openFolder()}
            className="w-full cursor-pointer"
            size="sm"
          >
            <HugeiconsIcon icon={Folder01Icon} className="size-4 mr-1.5" />
            Open Folder
          </Button>
        </EmptyContent>
      </Empty>

      <Separator className="my-1 bg-sidebar-border" />

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Projects
          </span>
          {recentWorkspaces.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {recentWorkspaces.length} saved
              </span>
              <button
                onClick={clearRecent}
                className="text-[10px] text-muted-foreground hover:text-destructive cursor-pointer transition-colors"
                title="Clear all recent projects"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        {recentWorkspaces.length > 3 && (
          <div className="relative my-1">
            <HugeiconsIcon
              icon={Search01Icon}
              className="absolute left-2 top-2 size-3.5 text-muted-foreground"
            />
            <Input
              type="text"
              placeholder="Search recent..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 pl-7 text-xs bg-sidebar-accent/40"
            />
          </div>
        )}

        {recentWorkspaces.length === 0 ? (
          <Empty className="border-0 bg-transparent py-6 px-2 gap-1.5">
            <EmptyMedia variant="icon" className="size-7 rounded-md bg-muted/50 text-muted-foreground mb-0">
              <HugeiconsIcon icon={Clock01Icon} className="size-3.5" />
            </EmptyMedia>
            <EmptyTitle className="text-xs font-normal text-muted-foreground">
              No recently opened projects
            </EmptyTitle>
            <EmptyDescription className="text-[11px] text-muted-foreground/60">
              Opened workspaces will appear here
            </EmptyDescription>
          </Empty>
        ) : filteredRecents.length === 0 ? (
          <Empty className="border-0 bg-transparent py-5 px-2 gap-1">
            <EmptyTitle className="text-xs font-normal text-muted-foreground">
              No matching projects found
            </EmptyTitle>
            <EmptyDescription className="text-[11px] text-muted-foreground/60">
              Try a different search query
            </EmptyDescription>
          </Empty>
        ) : (
          <div className="flex flex-col gap-1 overflow-y-auto max-h-72">
            {filteredRecents.map((project) => {
              const isUnavailable = project.exists === false;
              return (
                <div
                  key={project.id}
                  className={`group relative flex items-center justify-between rounded-md p-2 text-left text-xs transition-colors hover:bg-sidebar-accent ${
                    isUnavailable ? "opacity-50" : ""
                  }`}
                >
                  <button
                    disabled={isUnavailable}
                    onClick={() => openWorkspacePath(project.rootPath)}
                    className="flex flex-1 flex-col truncate cursor-pointer text-left overflow-hidden"
                  >
                    <div className="flex items-center gap-1.5 font-medium truncate">
                      <HugeiconsIcon
                        icon={Folder01Icon}
                        className={`size-3.5 shrink-0 ${
                          isUnavailable
                            ? "text-muted-foreground"
                            : "text-sidebar-primary"
                        }`}
                      />
                      <span className="truncate">{project.name}</span>
                      {isUnavailable && (
                        <span className="text-[10px] text-destructive italic shrink-0">
                          (missing)
                        </span>
                      )}
                      {project.projectTypes && project.projectTypes.length > 0 && (
                        <span className="ml-auto mr-1 rounded bg-sidebar-accent px-1 py-0 text-[8px] font-mono text-muted-foreground">
                          {project.projectTypes[0]}
                        </span>
                      )}
                    </div>

                    <span className="text-[10px] text-muted-foreground truncate pl-5">
                      {project.rootPath}
                    </span>
                    <div className="flex items-center gap-1 text-[9px] text-muted-foreground/70 pl-5 mt-0.5">
                      <HugeiconsIcon icon={Clock01Icon} className="size-2.5" />
                      <span>{formatRelativeTime(project.lastOpenedAt)}</span>
                    </div>
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRecent(project.rootPath);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-destructive rounded hover:bg-muted/50 cursor-pointer"
                    title="Remove from recent list"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
