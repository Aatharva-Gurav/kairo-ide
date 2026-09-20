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
} from "@/components/ui/empty";
import { WorkspaceProvider, useWorkspace } from "@/features/workspace/store";
import { FileExplorerProvider } from "@/features/file-explorer/store";
import { EditorProvider, useEditor } from "@/features/editor/store";
import { SearchProvider } from "@/features/search/store";
import { EditorWorkspace } from "@/features/editor/components/editor-workspace";
import { IconThemeProvider } from "@/features/icon-theme";
import { HugeiconsIcon } from "@hugeicons/react";
import { Folder01Icon } from "@hugeicons/core-free-icons";
import { KairoBrandIcon } from "@/components/kairo-brand-icon";

import { AppTitleBar } from "@/components/app-titlebar";

function PageContent() {
  const { activeWorkspace, openFolder } = useWorkspace();
  const { documents } = useEditor();

  return (
    <SidebarInset className="h-[calc(100vh-30px)] overflow-hidden flex flex-col p-0 m-0 border-0">
      {activeWorkspace || documents.length > 0 ? (
        <EditorWorkspace />
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 h-full w-full bg-background select-none">
          <Empty className="max-w-sm w-full border-none bg-transparent gap-3 animate-in fade-in-50 zoom-in-95 duration-200">
            <EmptyHeader className="max-w-sm flex flex-col items-center">
              <div className="animate-kairo-float mb-2.5">
                <KairoBrandIcon size={54} className="rounded-2xl shadow-lg hover:scale-105 transition-transform duration-200" />
              </div>
              <EmptyTitle className="text-base font-semibold tracking-tight text-foreground">Welcome to Kairo IDE</EmptyTitle>
              <EmptyDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Open a local project or select a recent workspace from the sidebar to begin editing.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent className="mt-2">
              <Button onClick={() => openFolder()} className="cursor-pointer shadow-2xs font-medium interactive-hover" size="default">
                <HugeiconsIcon icon={Folder01Icon} className="size-3.5 mr-1.5 transition-transform duration-150 group-hover:scale-110" />
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
                    <div className="flex flex-col h-screen w-screen overflow-hidden">
                      <AppTitleBar />
                      <div className="flex flex-1 overflow-hidden relative">
                        <AppSidebar />
                        <PageContent />
                      </div>
                    </div>
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
