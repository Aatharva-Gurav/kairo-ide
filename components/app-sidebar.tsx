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
          "fixed z-40 flex items-center justify-center transition-all duration-150 ease-out cursor-pointer select-none size-7 rounded-md active:scale-95 border shadow-2xs backdrop-blur-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring",
          open
            ? "top-3.5 left-[calc(var(--sidebar-width)-44px)] border-sidebar-border/80 bg-sidebar/95 text-sidebar-foreground hover:bg-sidebar-accent hover:border-sidebar-primary/50"
            : "top-1 left-2 border-border/80 bg-background/95 text-muted-foreground hover:text-foreground shadow-2xs hover:bg-accent hover:border-sidebar-primary/50"
        )}
      >
        <div className="flex items-center justify-center size-5 rounded bg-sidebar-accent/40 dark:bg-sidebar-accent/30 transition-transform duration-200">
          <HugeiconsIcon
            icon={open ? SidebarLeftIcon : SidebarRightIcon}
            className={cn(
              "size-3.5 transition-all duration-200 ease-out",
              open ? "rotate-0 scale-100" : "rotate-180 scale-105"
            )}
          />
        </div>
      </button>

      <Sidebar variant="floating" {...props}>
        {!activeWorkspace ? (
          <SidebarHeader>
            <div className="flex items-center justify-between p-2 select-none pr-12">
              <div className="flex items-center gap-2">
                <div className="flex aspect-square size-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground shadow-2xs transition-transform duration-200 hover:scale-105">
                  <HugeiconsIcon icon={LayoutBottomIcon} strokeWidth={2} className="size-3.5" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold text-xs tracking-tight text-sidebar-foreground">Kairo IDE</span>
                  <span className="text-[10px] text-muted-foreground font-mono">Workspace</span>
                </div>
              </div>
            </div>
          </SidebarHeader>
        ) : (
          <SidebarHeader className="h-10 justify-center px-2.5 border-b border-sidebar-border/80 pr-12">
            <div className="relative flex items-center p-0.5 rounded-lg bg-sidebar-accent/40 border border-sidebar-border/60 min-w-0">
              <button
                type="button"
                onClick={() => setActiveTab("explorer")}
                title="File Explorer"
                className={cn(
                  "group flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-all duration-120 ease-out shrink-0 active:scale-97",
                  activeTab === "explorer"
                    ? "bg-sidebar text-sidebar-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <HugeiconsIcon icon={Folder01Icon} className="size-3.5" />
                <span className="tracking-tight">Explorer</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("search")}
                title="Search Workspace (Ctrl+Shift+F)"
                className={cn(
                  "group flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium cursor-pointer transition-all duration-120 ease-out shrink-0 active:scale-97",
                  activeTab === "search"
                    ? "bg-sidebar text-sidebar-foreground shadow-2xs font-semibold"
                    : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <HugeiconsIcon icon={Search01Icon} className="size-3.5" />
                <span className="tracking-tight">Search</span>
              </button>
            </div>
          </SidebarHeader>
        )}

        <SidebarContent className="relative flex-1 min-h-0 overflow-hidden">
          {!activeWorkspace ? (
            <div className="h-full w-full animate-in fade-in-50 duration-150 delay-subtle">
              <EmptyWorkspaceView />
            </div>
          ) : activeTab === "explorer" ? (
            <div key="tab-explorer" className="h-full w-full animate-in fade-in-50 duration-150 delay-subtle">
              <FileExplorer />
            </div>
          ) : (
            <div key="tab-search" className="h-full w-full animate-in fade-in-50 duration-150 delay-subtle">
              <WorkspaceSearchPanel />
            </div>
          )}
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border/70 p-1.5 bg-sidebar/80">
          <button
            type="button"
            onClick={() => openSettings()}
            title="Open Settings (Ctrl+,)"
            className="group flex items-center gap-2 w-full px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-all duration-140 cursor-pointer select-none active:scale-[0.98]"
          >
            <HugeiconsIcon icon={Settings01Icon} className="size-3.5 transition-transform duration-200 ease-out group-hover:rotate-45 text-muted-foreground group-hover:text-sidebar-foreground" />
            <span className="tracking-tight">Settings</span>
            <kbd className="ml-auto kbd-shortcut transition-colors group-hover:border-sidebar-primary/40 group-hover:text-sidebar-foreground">
              {KeybindingService.formatDisplay("ctrl+,")}
            </kbd>
          </button>
        </SidebarFooter>
      </Sidebar>
    </>
  );
}