"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useWorkspace } from "@/features/workspace/store";
import { useEditor } from "@/features/editor/store";
import { KairoBrandIcon } from "@/components/kairo-brand-icon";
import { isTauriEnvironment, invokeCommand, basename } from "@/lib/tauri-ipc";

const TOP_MENUS = [
  { id: "file", label: "File" },
  { id: "edit", label: "Edit" },
  { id: "selection", label: "Selection" },
  { id: "view", label: "View" },
  { id: "help", label: "Help" },
] as const;

export function AppTitleBar() {
  const { activeWorkspace } = useWorkspace();
  const { activeDocument } = useEditor();
  const [isMaximized, setIsMaximized] = useState(false);
  const isTauri = isTauriEnvironment();

  // Check window maximized state on mount and resize
  useEffect(() => {
    if (!isTauri) return;

    let isMounted = true;
    const checkMaximized = async () => {
      try {
        const max = await invokeCommand<boolean>("window_is_maximized");
        if (isMounted) {
          setIsMaximized(Boolean(max));
        }
      } catch {
        // Ignored in non-window contexts
      }
    };

    checkMaximized();
    window.addEventListener("resize", checkMaximized);
    return () => {
      isMounted = false;
      window.removeEventListener("resize", checkMaximized);
    };
  }, [isTauri]);

  const handleMenuClick = useCallback(
    async (menuId: string, event: React.MouseEvent<HTMLButtonElement>) => {
      if (!isTauri) return;
      const rect = event.currentTarget.getBoundingClientRect();
      try {
        await invokeCommand("menu_popup", {
          name: menuId,
          x: Math.round(rect.left),
          y: Math.round(rect.bottom),
        });
      } catch (err) {
        console.error(`[AppTitleBar] Failed to popup menu "${menuId}":`, err);
      }
    },
    [isTauri]
  );

  const handleMinimize = useCallback(async () => {
    if (!isTauri) return;
    try {
      await invokeCommand("window_minimize");
    } catch (err) {
      console.error("[AppTitleBar] Failed to minimize window:", err);
    }
  }, [isTauri]);

  const handleToggleMaximize = useCallback(async () => {
    if (!isTauri) return;
    try {
      await invokeCommand("window_toggle_maximize");
      const max = await invokeCommand<boolean>("window_is_maximized");
      setIsMaximized(Boolean(max));
    } catch (err) {
      console.error("[AppTitleBar] Failed to toggle maximize window:", err);
    }
  }, [isTauri]);

  const handleClose = useCallback(async () => {
    if (!isTauri) return;
    try {
      await invokeCommand("window_close");
    } catch (err) {
      console.error("[AppTitleBar] Failed to close window:", err);
    }
  }, [isTauri]);

  // Window title computation
  const titleText = activeDocument
    ? `${basename(activeDocument.path)} - ${activeWorkspace?.name || "Kairo IDE"}`
    : activeWorkspace
    ? `${activeWorkspace.name} - Kairo IDE`
    : "Kairo IDE";

  return (
    <header
      className="h-[30px] w-full bg-sidebar border-b border-sidebar-border/80 flex items-center justify-between select-none z-50 shrink-0 text-xs"
      data-tauri-drag-region
    >
      {/* Left section: Brand Icon & Top-Level Menus */}
      <div className="flex items-center h-full pl-2 gap-0.5 z-10">
        <div className="flex items-center justify-center mr-1.5 pointer-events-none">
          <KairoBrandIcon size={16} />
        </div>

        <nav className="flex items-center gap-0.5 h-full" aria-label="Application Menu">
          {TOP_MENUS.map((menu) => (
            <button
              key={menu.id}
              type="button"
              onClick={(e) => handleMenuClick(menu.id, e)}
              className="h-[22px] px-2 rounded-sm text-[12px] font-normal text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent/80 active:bg-sidebar-accent cursor-pointer transition-colors duration-100 flex items-center focus:outline-none focus-visible:ring-1 focus-visible:ring-sidebar-ring"
            >
              {menu.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Middle section: Window Title & Draggable Area */}
      <div
        className="flex-1 h-full flex items-center justify-center px-4 overflow-hidden cursor-default"
        data-tauri-drag-region
        onDoubleClick={handleToggleMaximize}
      >
        <span
          className="text-[11.5px] text-muted-foreground/75 font-normal truncate tracking-tight pointer-events-none select-none"
          title={titleText}
        >
          {titleText}
        </span>
      </div>

      {/* Right section: Window Controls (Minimize, Maximize/Restore, Close) */}
      <div className="flex items-center h-full z-10">
        <button
          type="button"
          onClick={handleMinimize}
          title="Minimize"
          aria-label="Minimize"
          className="w-[46px] h-[30px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/80 transition-colors focus:outline-none"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" className="fill-current">
            <rect width="10" height="1" />
          </svg>
        </button>

        <button
          type="button"
          onClick={handleToggleMaximize}
          title={isMaximized ? "Restore" : "Maximize"}
          aria-label={isMaximized ? "Restore" : "Maximize"}
          className="w-[46px] h-[30px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/80 transition-colors focus:outline-none"
        >
          {isMaximized ? (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              className="stroke-current fill-none"
              strokeWidth="1"
            >
              <path d="M2.5 2V0.5h7v7H8" />
              <rect x="0.5" y="2.5" width="7" height="7" />
            </svg>
          ) : (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              className="stroke-current fill-none"
              strokeWidth="1"
            >
              <rect x="0.5" y="0.5" width="9" height="9" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={handleClose}
          title="Close"
          aria-label="Close"
          className="w-[46px] h-[30px] flex items-center justify-center text-muted-foreground hover:text-white hover:bg-[#e81123] transition-colors focus:outline-none"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className="stroke-current"
            strokeWidth="1.1"
          >
            <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" />
            <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" />
          </svg>
        </button>
      </div>
    </header>
  );
}
