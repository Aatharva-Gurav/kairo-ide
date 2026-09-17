"use client";

import React from "react";
import { AppSidebar } from "@/components/app-sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { WorkspaceProvider, useWorkspace } from "@/features/workspace/store";
import { FileExplorerProvider, useFileExplorer } from "@/features/file-explorer/store";
import { FileIcon } from "@/features/file-explorer/components/file-icon";
import { normalizePath } from "@/lib/tauri-ipc";
import { ideEvents, FileEventPayload } from "@/lib/events";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Folder01Icon,
  CodeIcon,
  ComputerIcon,
  File01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function PageContent() {
  const { activeWorkspace, openFolder } = useWorkspace();
  const { selectedNode, selectedPaths, nodes } = useFileExplorer();
  const [sideNode, setSideNode] = React.useState<FileEventPayload | null>(null);

  React.useEffect(() => {
    return ideEvents.on("file:open-to-side", (payload) => {
      setSideNode(payload);
    });
  }, []);

  // Compute breadcrumb path
  const relativeBreadcrumb = React.useMemo(() => {
    if (!activeWorkspace || !selectedNode) return [];
    const wsRoot = normalizePath(activeWorkspace.rootPath).toLowerCase();
    const nodePath = normalizePath(selectedNode.path);
    const nodeLower = nodePath.toLowerCase();

    if (nodeLower.startsWith(wsRoot)) {
      const rel = nodePath.slice(activeWorkspace.rootPath.length).replace(/^\/+/, "");
      return rel ? rel.split("/") : [selectedNode.name];
    }
    return [selectedNode.name];
  }, [activeWorkspace, selectedNode]);

  return (
    <SidebarInset>
      <header className="flex h-16 shrink-0 items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <Breadcrumb>
          <BreadcrumbList>
            {activeWorkspace ? (
              <>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#" className="font-semibold text-foreground">
                    {activeWorkspace.name}
                  </BreadcrumbLink>
                </BreadcrumbItem>
                {relativeBreadcrumb.length > 0 ? (
                  relativeBreadcrumb.map((segment, idx) => {
                    const isLast = idx === relativeBreadcrumb.length - 1;
                    return (
                      <React.Fragment key={idx}>
                        <BreadcrumbSeparator className="hidden md:block" />
                        <BreadcrumbItem>
                          {isLast ? (
                            <BreadcrumbPage className="font-medium text-foreground">
                              {segment}
                            </BreadcrumbPage>
                          ) : (
                            <span className="text-muted-foreground hidden md:inline">
                              {segment}
                            </span>
                          )}
                        </BreadcrumbItem>
                      </React.Fragment>
                    );
                  })
                ) : (
                  <>
                    <BreadcrumbSeparator className="hidden md:block" />
                    <BreadcrumbItem>
                      <BreadcrumbPage>Workspace Overview</BreadcrumbPage>
                    </BreadcrumbItem>
                  </>
                )}
              </>
            ) : (
              <>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="#">Kairo IDE</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>No Project Open</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        {/* Top 3 Metric Cards - preserving existing grid layout */}
        <div className="grid auto-rows-min gap-4 md:grid-cols-3">
          {/* Card 1: Workspace status */}
          <div className="rounded-xl bg-muted/50 p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Workspace
              </span>
              <HugeiconsIcon icon={Folder01Icon} className="size-4 text-sidebar-primary" />
            </div>
            <div className="mt-2">
              <div className="text-sm font-bold truncate flex items-center gap-1.5">
                <span>{activeWorkspace ? activeWorkspace.name : "No Workspace"}</span>
                {activeWorkspace?.projectTypes && activeWorkspace.projectTypes.length > 0 && (
                  <span className="rounded bg-sidebar-accent px-1.5 py-0.2 text-[9px] font-mono text-sidebar-accent-foreground font-normal">
                    {activeWorkspace.projectTypes.slice(0, 2).join(" • ")}
                  </span>
                )}
              </div>
              <div
                className="text-xs text-muted-foreground truncate mt-0.5"
                title={activeWorkspace?.rootPath}
              >
                {activeWorkspace ? activeWorkspace.rootPath : "Open a folder to start"}
              </div>
            </div>
          </div>

          {/* Card 2: File Explorer status */}
          <div className="rounded-xl bg-muted/50 p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Explorer
              </span>
              <HugeiconsIcon icon={CodeIcon} className="size-4 text-blue-500" />
            </div>
            <div className="mt-2">
              <div className="text-sm font-bold">
                {activeWorkspace ? `${nodes.length} root items` : "Idle"}
              </div>
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {selectedPaths.size > 1
                  ? `${selectedPaths.size} items selected`
                  : selectedNode
                  ? `Selected: ${selectedNode.name}`
                  : "Ready"}
              </div>
            </div>
          </div>

          {/* Card 3: IDE Engine status */}
          <div className="rounded-xl bg-muted/50 p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                IDE Architecture
              </span>
              <HugeiconsIcon icon={ComputerIcon} className="size-4 text-emerald-500" />
            </div>
            <div className="mt-2">
              <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                Tauri Native Engine
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Events ready for Monaco & Terminal
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="min-h-[100vh] flex-1 rounded-xl bg-muted/50 md:min-h-min p-6 flex flex-col justify-center items-center">
          {sideNode || (selectedNode && selectedNode.type === "file") ? (
            <div className={`w-full max-w-4xl grid gap-4 ${sideNode ? "md:grid-cols-2" : "max-w-2xl"}`}>
              {/* Primary Selected File */}
              {selectedNode && selectedNode.type === "file" && (
                <div className="rounded-lg border border-border bg-card p-5 shadow-xs text-card-foreground">
                  <div className="flex items-center gap-3 border-b border-border pb-3">
                    <FileIcon name={selectedNode.name} isDirectory={false} className="size-6" />
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold truncate">{selectedNode.name}</h2>
                        <span className="rounded bg-sidebar-accent px-1.5 py-0.2 text-[9px] font-mono text-muted-foreground">
                          Primary
                        </span>
                      </div>
                      <p
                        className="text-[11px] text-muted-foreground truncate font-mono mt-0.5"
                        title={selectedNode.path}
                      >
                        {selectedNode.path}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 py-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Size: </span>
                      <span className="font-medium">{formatBytes(selectedNode.size)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Modified: </span>
                      <span className="font-medium">
                        {selectedNode.modifiedAt
                          ? new Date(selectedNode.modifiedAt).toLocaleTimeString()
                          : "Unknown"}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-md bg-muted/70 p-3 border border-border/60 text-center">
                    <p className="text-xs text-muted-foreground">
                      File opened via <code className="text-sidebar-primary font-semibold">file:open-requested</code> event.
                    </p>
                    <p className="text-[10px] text-muted-foreground/80 mt-1">
                      Ready for Monaco Code Editor integration.
                    </p>
                  </div>
                </div>
              )}

              {/* Open to Side File */}
              {sideNode && (
                <div className="rounded-lg border border-sidebar-primary/30 bg-card p-5 shadow-xs text-card-foreground relative">
                  <button
                    onClick={() => setSideNode(null)}
                    className="absolute top-3 right-3 p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
                    title="Close Side View"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
                  </button>

                  <div className="flex items-center gap-3 border-b border-border pb-3 pr-6">
                    <FileIcon name={sideNode.name} isDirectory={false} className="size-6" />
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold truncate">{sideNode.name}</h2>
                        <span className="rounded bg-sidebar-primary/15 text-sidebar-primary px-1.5 py-0.2 text-[9px] font-mono font-medium">
                          Side Split
                        </span>
                      </div>
                      <p
                        className="text-[11px] text-muted-foreground truncate font-mono mt-0.5"
                        title={sideNode.path}
                      >
                        {sideNode.path}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 py-3 text-xs">
                    <div>
                      <span className="text-muted-foreground">Size: </span>
                      <span className="font-medium">{formatBytes(sideNode.size)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Modified: </span>
                      <span className="font-medium">
                        {sideNode.modifiedAt
                          ? new Date(sideNode.modifiedAt).toLocaleTimeString()
                          : "Unknown"}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-md bg-muted/70 p-3 border border-border/60 text-center">
                    <p className="text-xs text-muted-foreground">
                      Split opened via <code className="text-sidebar-primary font-semibold">file:open-to-side</code> event.
                    </p>
                    <p className="text-[10px] text-muted-foreground/80 mt-1">
                      Ready for multi-editor layout group integration.
                    </p>
                  </div>
                </div>
              )}
            </div>
          ) : activeWorkspace ? (
            <div className="flex flex-col items-center justify-center text-center max-w-md">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-sidebar-primary/10 text-sidebar-primary mb-3">
                <HugeiconsIcon icon={Folder01Icon} className="size-6" />
              </div>
              <h2 className="text-lg font-semibold">{activeWorkspace.name}</h2>
              <p
                className="text-xs text-muted-foreground font-mono mt-1 px-4 truncate max-w-full"
                title={activeWorkspace.rootPath}
              >
                {activeWorkspace.rootPath}
              </p>
              {activeWorkspace.projectTypes && activeWorkspace.projectTypes.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2 justify-center flex-wrap">
                  {activeWorkspace.projectTypes.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-sidebar-accent px-2 py-0.5 text-[10px] font-mono text-sidebar-accent-foreground"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                Select a file from the explorer on the left to inspect it, or right-click in the tree to create, rename, and manage files.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center max-w-md">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-sidebar-primary/10 text-sidebar-primary mb-3">
                <HugeiconsIcon icon={File01Icon} className="size-7" />
              </div>
              <h2 className="text-lg font-bold">Welcome to Kairo IDE</h2>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                Open a local project or select a recent workspace from the sidebar to begin.
              </p>
              <Button onClick={() => openFolder()} className="mt-4 cursor-pointer" size="sm">
                <HugeiconsIcon icon={Folder01Icon} className="size-4 mr-1.5" />
                Open Folder
              </Button>
            </div>
          )}
        </div>
      </div>
    </SidebarInset>
  );
}

export default function Page() {
  return (
    <WorkspaceProvider>
      <FileExplorerProvider>
        <SidebarProvider
          style={
            {
              "--sidebar-width": "19rem",
            } as React.CSSProperties
          }
        >
          <AppSidebar />
          <PageContent />
        </SidebarProvider>
      </FileExplorerProvider>
    </WorkspaceProvider>
  );
}
