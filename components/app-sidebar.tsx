"use client";

import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { useWorkspace } from "@/features/workspace/store";
import { EmptyWorkspaceView } from "@/features/workspace/components/empty-workspace-view";
import { FileExplorer } from "@/features/file-explorer/components/file-explorer";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  LayoutBottomIcon,
  SidebarLeftIcon,
  SidebarRightIcon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { activeWorkspace } = useWorkspace();
  const { open, toggleSidebar } = useSidebar();

  return (
    <>
      {/* Punch-hole design sidebar toggle button */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={open ? "Hide Sidebar (Ctrl+B)" : "Show Sidebar (Ctrl+B)"}
        title={open ? "Hide Sidebar (Ctrl+B)" : "Show Sidebar (Ctrl+B)"}
        className={cn(
          "fixed z-40 flex items-center justify-center transition-all duration-200 ease-linear cursor-pointer select-none",
          "size-7 rounded-full",
          // Punch-hole bezel & surface styling
          "border shadow-xs backdrop-blur-md",
          "hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          open
            ? "top-4 left-[calc(var(--sidebar-width)-46px)] border-sidebar-border bg-sidebar/95 text-sidebar-foreground hover:bg-sidebar-accent"
            : "top-4 left-3 border-border bg-background/95 text-foreground shadow-sm hover:bg-accent"
        )}
      >
        <div className="flex items-center justify-center size-5 rounded-full bg-sidebar-accent/50 dark:bg-sidebar-accent/30">
          <HugeiconsIcon
            icon={open ? SidebarLeftIcon : SidebarRightIcon}
            className="size-3.5 transition-transform duration-200"
          />
        </div>
      </button>

      <Sidebar variant="floating" {...props}>
        {!activeWorkspace && (
          <SidebarHeader>
            <div className="flex items-center justify-between p-2 select-none pr-8">
              <div className="flex items-center gap-2">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <HugeiconsIcon icon={LayoutBottomIcon} strokeWidth={2} className="size-4" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold text-xs tracking-tight">Kairo IDE</span>
                  <span className="text-[10px] text-muted-foreground">Workspace</span>
                </div>
              </div>
            </div>
          </SidebarHeader>
        )}
        <SidebarContent className="relative flex-1 min-h-0 overflow-hidden">
          {activeWorkspace ? <FileExplorer /> : <EmptyWorkspaceView />}
        </SidebarContent>
      </Sidebar>
    </>
  );
}