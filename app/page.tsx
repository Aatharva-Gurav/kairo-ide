"use client";

import React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from "@/components/ui/empty";
import { WorkspaceProvider, useWorkspace } from "@/features/workspace/store";
import { FileExplorerProvider } from "@/features/file-explorer/store";
import { EditorProvider, useEditor } from "@/features/editor/store";
import { SearchProvider } from "@/features/search/store";
import { EditorWorkspace } from "@/features/editor/components/editor-workspace";
import { IconThemeProvider } from "@/features/icon-theme";
import { HugeiconsIcon } from "@hugeicons/react";
import { Folder01Icon, File01Icon } from "@hugeicons/core-free-icons";

function PageContent() {
  const { activeWorkspace, openFolder } = useWorkspace();
  const { documents } = useEditor();

  return (
    <SidebarInset className="h-screen overflow-hidden flex flex-col p-0 m-0 border-0">
      {activeWorkspace || documents.length > 0 ? (
        <EditorWorkspace />
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 h-full w-full bg-background select-none">
          <Empty className="max-w-md w-full border-none bg-transparent">
            <EmptyHeader className="max-w-md">
              <EmptyMedia
                variant="icon"
                className="size-14 rounded-2xl bg-sidebar-primary/10 text-sidebar-primary mb-3"
              >
                <HugeiconsIcon icon={File01Icon} className="size-7" />
              </EmptyMedia>
              <EmptyTitle className="text-lg font-bold">Welcome to Kairo IDE</EmptyTitle>
              <EmptyDescription className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Open a local project or select a recent workspace from the sidebar to begin editing.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="mt-4">
              <Button onClick={() => openFolder()} className="cursor-pointer" size="sm">
                <HugeiconsIcon icon={Folder01Icon} className="size-4 mr-1.5" />
                Open Folder
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      )}
    </SidebarInset>
  );
}

import { SettingsProvider } from "@/features/settings/store";
import { CommandProvider } from "@/features/commands/store";

export default function Page() {
  return (
    <IconThemeProvider>
      <WorkspaceProvider>
        <SettingsProvider>
          <FileExplorerProvider>
            <EditorProvider>
              <SearchProvider>
                <SidebarProvider
                  style={
                    {
                      "--sidebar-width": "19rem",
                    } as React.CSSProperties
                  }
                >
                  <CommandProvider>
                    <AppSidebar />
                    <PageContent />
                  </CommandProvider>
                </SidebarProvider>
              </SearchProvider>
            </EditorProvider>
          </FileExplorerProvider>
        </SettingsProvider>
      </WorkspaceProvider>
    </IconThemeProvider>
  );
}
