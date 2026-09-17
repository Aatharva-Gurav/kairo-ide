"use client";

import * as React from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { useWorkspace } from "@/features/workspace/store";
import { useFileExplorer } from "@/features/file-explorer/store";
import { WorkspaceHeader } from "@/features/workspace/components/workspace-header";
import { EmptyWorkspaceView } from "@/features/workspace/components/empty-workspace-view";
import { FileExplorer } from "@/features/file-explorer/components/file-explorer";
import { HugeiconsIcon } from "@hugeicons/react";
import { LayoutBottomIcon } from "@hugeicons/core-free-icons";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { activeWorkspace } = useWorkspace();
  const { startCreateFile, startCreateFolder, refresh, collapseAll } = useFileExplorer();

  return (
    <Sidebar variant="floating" {...props}>
      <SidebarHeader>
        {activeWorkspace ? (
          <WorkspaceHeader
            onNewFileRoot={() => startCreateFile(activeWorkspace.rootPath)}
            onNewFolderRoot={() => startCreateFolder(activeWorkspace.rootPath)}
            onRefresh={() => refresh()}
            onCollapseAll={() => collapseAll()}
          />
        ) : (
          <div className="flex items-center gap-2 p-2 select-none">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <HugeiconsIcon icon={LayoutBottomIcon} strokeWidth={2} className="size-4" />
            </div>
            <div className="flex flex-col gap-0.5 leading-none">
              <span className="font-semibold text-xs tracking-tight">Kairo IDE</span>
              <span className="text-[10px] text-muted-foreground">Workspace</span>
            </div>
          </div>
        )}
      </SidebarHeader>
      <SidebarContent>
        {activeWorkspace ? <FileExplorer /> : <EmptyWorkspaceView />}
      </SidebarContent>
    </Sidebar>
  );
}
