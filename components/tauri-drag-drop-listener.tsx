"use client";

import { useEffect } from "react";
import { isTauriEnvironment } from "@/lib/tauri-ipc";
import { useWorkspace } from "@/features/workspace/store";
import { useFileExplorer } from "@/features/file-explorer/store";
import { useEditor } from "@/features/editor/store";
import { FileExplorerService } from "@/features/file-explorer/service";

/**
 * Global Drag & Drop Handler supporting:
 * 1. Tauri native OS window file drops (via getCurrentWebview().onDragDropEvent)
 * 2. Browser standard file drops (fallback for web mode)
 *
 * Drops over the File Explorer copy items into the target project folder.
 * Drops over the Editor (or outside explorer) open and edit the file(s).
 */
export function TauriDragDropListener() {
  const { activeWorkspace } = useWorkspace();
  const { refresh } = useFileExplorer();
  const { openDocument } = useEditor();

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    let isCancelled = false;

    if (isTauriEnvironment()) {
      // Dynamic import to avoid SSR issues
      import("@tauri-apps/api/webview")
        .then(({ getCurrentWebview }) => {
          if (isCancelled) return;
          return getCurrentWebview().onDragDropEvent(async (event) => {
            if (event.payload.type === "drop") {
              const { paths, position } = event.payload;
              if (!paths || paths.length === 0) return;

              const scale = window.devicePixelRatio || 1;
              const clientX = position.x / scale;
              const clientY = position.y / scale;

              const el = document.elementFromPoint(clientX, clientY);
              const folderEl = el?.closest("[data-folder-path]");
              const explorerEl = el?.closest("[data-file-explorer]");

              // Case A: Dropped on a folder in File Explorer
              if (folderEl) {
                const targetDir = folderEl.getAttribute("data-folder-path");
                if (targetDir) {
                  for (const p of paths) {
                    try {
                      await FileExplorerService.copy(p, targetDir);
                    } catch (err) {
                      console.error("[DragDrop] Failed to copy item into folder:", p, err);
                    }
                  }
                  await refresh();
                  return;
                }
              }

              // Case B: Dropped on empty space in File Explorer (copy to root)
              if (explorerEl && activeWorkspace) {
                for (const p of paths) {
                  try {
                    await FileExplorerService.copy(p, activeWorkspace.rootPath);
                  } catch (err) {
                    console.error("[DragDrop] Failed to copy item into root:", p, err);
                  }
                }
                await refresh();
                return;
              }

              // Case C: Dropped onto Editor area or welcome screen (open files for editing)
              for (const p of paths) {
                try {
                  await openDocument(p);
                } catch (err) {
                  console.error("[DragDrop] Failed to open file in editor:", p, err);
                }
              }
            }
          });
        })
        .then((unlisten) => {
          if (unlisten) {
            unlistenFn = unlisten;
          }
        })
        .catch((err) => {
          console.warn("[DragDrop] Tauri drag-drop listener initialization failed:", err);
        });
    }

    // Standard DOM drop handler for browser fallback
    const handleWindowDragOver = (e: DragEvent) => {
      e.preventDefault();
    };

    const handleWindowDrop = async (e: DragEvent) => {
      // If default was already prevented by an inner element, ignore
      if (e.defaultPrevented) return;
      if (!e.dataTransfer || !e.dataTransfer.files || e.dataTransfer.files.length === 0) return;

      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);

      for (const file of files) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const nativePath = (file as any).path;
        if (nativePath) {
          try {
            await openDocument(nativePath);
          } catch (err) {
            console.error("[DragDrop] Failed to open dropped native file:", nativePath, err);
          }
        }
      }
    };

    window.addEventListener("dragover", handleWindowDragOver);
    window.addEventListener("drop", handleWindowDrop);

    return () => {
      isCancelled = true;
      if (unlistenFn) {
        unlistenFn();
      }
      window.removeEventListener("dragover", handleWindowDragOver);
      window.removeEventListener("drop", handleWindowDrop);
    };
  }, [activeWorkspace, refresh, openDocument]);

  return null;
}

