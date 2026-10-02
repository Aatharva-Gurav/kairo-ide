"use client";

import React, { useState } from "react";
import { useWorkspace } from "../../workspace/store";
import { ExplorerSearchBar } from "./explorer-search-bar";
import { ExplorerBulkBar } from "./explorer-bulk-bar";
import { ExplorerTree } from "./explorer-tree";
import { ExplorerToolbar } from "./explorer-toolbar";
import { ContextMenu } from "./context-menu";
import { ConfirmDeleteModal } from "./confirm-delete-modal";
import { ContextMenuState, FileSystemNode } from "../types";

export function FileExplorer() {
  const { activeWorkspace } = useWorkspace();

  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    isOpen: false,
    x: 0,
    y: 0,
    node: null,
    isRootOrEmpty: false,
  });

  const handleOpenContextMenu = (
    e: React.MouseEvent,
    node: FileSystemNode | null
  ) => {
    setContextMenu({
      isOpen: true,
      x: e.clientX,
      y: e.clientY,
      node,
      isRootOrEmpty: !node,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu((prev) => ({ ...prev, isOpen: false }));
  };

  if (!activeWorkspace) {
    return null;
  }

  return (
    <div className="relative flex flex-col flex-1 min-h-0 w-full h-full overflow-hidden">
      {/* Fixed Search Bar at top of sidebar */}
      <ExplorerSearchBar />

      {/* Bulk Selection Quick Action Bar */}
      <ExplorerBulkBar />

      {/* Tree Hierarchy Component */}
      <ExplorerTree onOpenContextMenu={handleOpenContextMenu} />

      {/* Floating Toolbar Button Group at bottom center */}
      <ExplorerToolbar />

      {/* Context Menu */}
      <ContextMenu state={contextMenu} onClose={handleCloseContextMenu} />

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal />
    </div>
  );
}