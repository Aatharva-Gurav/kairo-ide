"use client";

import React, { useState } from "react";
import { useFileExplorer } from "../store";
import { useWorkspace } from "../../workspace/store";
import { ExplorerToolbar } from "./explorer-toolbar";
import { ExplorerFilter } from "./explorer-filter";
import { ExplorerBulkBar } from "./explorer-bulk-bar";
import { ExplorerTree } from "./explorer-tree";
import { ContextMenu } from "./context-menu";
import { ConfirmDeleteModal } from "./confirm-delete-modal";
import { ContextMenuState, FileSystemNode } from "../types";

export function FileExplorer() {
  const { activeWorkspace } = useWorkspace();
  const { filterQuery } = useFileExplorer();
  const [isFilterOpen, setIsFilterOpen] = useState(false);

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

  const showFilter = isFilterOpen || Boolean(filterQuery);

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full overflow-hidden">
      {/* Explorer Toolbar: Filter, Sort, Hidden, Collapse, Actions */}
      <ExplorerToolbar
        isFilterOpen={showFilter}
        onToggleFilter={() => setIsFilterOpen((prev) => !prev)}
      />

      {/* Explorer Filter Bar */}
      {showFilter && (
        <ExplorerFilter onClose={() => setIsFilterOpen(false)} />
      )}

      {/* Bulk Selection Quick Action Bar */}
      <ExplorerBulkBar />

      {/* Tree Hierarchy Component */}
      <ExplorerTree onOpenContextMenu={handleOpenContextMenu} />

      {/* Context Menu */}
      <ContextMenu state={contextMenu} onClose={handleCloseContextMenu} />

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal />
    </div>
  );
}
