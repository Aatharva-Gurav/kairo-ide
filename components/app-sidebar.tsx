"use client";

import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useWorkspace } from "@/features/workspace/store";
import { useSettings } from "@/features/settings/store";
import { KeybindingService } from "@/features/commands/keybinding.service";
import { ideEvents } from "@/lib/events";
import { EmptyWorkspaceView } from "@/features/workspace/components/empty-workspace-view";
import { FileExplorer } from "@/features/file-explorer/components/file-explorer";
import { WorkspaceSearchPanel } from "@/features/search/components/workspace-search-panel";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  LayoutBottomIcon,
  SidebarLeftIcon,
  SidebarRightIcon,
  Folder01Icon,
  Search01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { activeWorkspace } = useWorkspace();
  const { open, setOpen, toggleSidebar } = useSidebar();
  const { openSettings } = useSettings();
  const [activeTab, setActiveTab] = React.useState<"explorer" | "search">("explorer");

  // Switch sidebar tab via event bus (e.g. from search command)
  React.useEffect(() => {
    return ideEvents.on("sidebar:switch-tab", (tab) => {
      setActiveTab(tab);
      if (!open) {
        setOpen(true);
      }
    });
  }, [open, setOpen]);

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
            : "top-1 left-2.5 border-border bg-background/95 text-foreground shadow-sm hover:bg-accent"
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
        {!activeWorkspace ? (
          <SidebarHeader>
            <div className="flex items-center justify-between p-2 select-none pr-12">
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
        ) : (
          <SidebarHeader className="h-11 justify-center px-2.5 border-b border-sidebar-border pr-12">
            <div className="flex items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => setActiveTab("explorer")}
                title="File Explorer"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all shrink-0",
                  activeTab === "explorer"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <HugeiconsIcon icon={Folder01Icon} className="size-3.5" />
                <span>Explorer</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("search")}
                title="Search Workspace (Ctrl+Shift+F)"
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all shrink-0",
                  activeTab === "search"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <HugeiconsIcon icon={Search01Icon} className="size-3.5" />
                <span>Search</span>
              </button>
            </div>
          </SidebarHeader>
        )}

        <SidebarContent className="relative flex-1 min-h-0 overflow-hidden">
          {!activeWorkspace ? (
            <EmptyWorkspaceView />
          ) : activeTab === "explorer" ? (
            <FileExplorer />
          ) : (
            <WorkspaceSearchPanel />
          )}
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-1.5">
          <button
            type="button"
            onClick={() => openSettings()}
            title="Open Settings (Ctrl+,)"
            className="flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/50 transition-colors cursor-pointer select-none"
          >
            <HugeiconsIcon icon={Settings01Icon} className="size-3.5" />
            <span>Settings</span>
            <kbd className="ml-auto text-[10px] font-mono text-muted-foreground/60">
              {KeybindingService.formatDisplay("ctrl+,")}
            </kbd>
          </button>
        </SidebarFooter>
      </Sidebar>
    </>
  );
}