"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useWorkspace } from "@/features/workspace/store";
import { useEditor } from "@/features/editor/store";
import type { EditorDocument } from "@/features/editor/types";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileText } from "lucide-react";
import { ModelService } from "@/features/editor/services/model.service";

export function WorkspaceDirtyConfirmModal() {
  const { registerBeforeCloseHook } = useWorkspace();
  const { documents, saveAllDocuments, filesSettings } = useEditor();

  const documentsRef = useRef(documents);
  const filesSettingsRef = useRef(filesSettings);
  const saveAllDocumentsRef = useRef(saveAllDocuments);

  useEffect(() => {
    documentsRef.current = documents;
    filesSettingsRef.current = filesSettings;
    saveAllDocumentsRef.current = saveAllDocuments;
  }, [documents, filesSettings, saveAllDocuments]);

  const [promptState, setPromptState] = useState<{
    dirtyDocs: EditorDocument[];
    resolve: (proceed: boolean) => void;
  } | null>(null);

  useEffect(() => {
    if (!registerBeforeCloseHook) return;

    const unregister = registerBeforeCloseHook(async () => {
      // Find dirty documents
      const dirty = (documentsRef.current || []).filter((doc) => {
        if (doc.isDirty) return true;
        const model = ModelService.getModel(doc.id);
        return model && !model.isDisposed() && model.getValue() !== doc.savedContent;
      });

      if (dirty.length === 0) {
        return true;
      }

      // If autoSave is active, auto-save and proceed without prompting
      if (filesSettingsRef.current.autoSave !== "off" && saveAllDocumentsRef.current) {
        await saveAllDocumentsRef.current();
        return true;
      }

      // Prompt user with confirmation modal
      return new Promise<boolean>((resolve) => {
        setPromptState({ dirtyDocs: dirty, resolve });
      });
    });

    return () => {
      unregister();
    };
  }, [registerBeforeCloseHook]);

  const handleAction = useCallback(
    async (action: "save" | "discard" | "cancel") => {
      if (!promptState) return;
      const { resolve } = promptState;

      if (action === "save") {
        if (saveAllDocumentsRef.current) {
          await saveAllDocumentsRef.current();
        }
        setPromptState(null);
        resolve(true);
      } else if (action === "discard") {
        setPromptState(null);
        resolve(true);
      } else {
        setPromptState(null);
        resolve(false);
      }
    },
    [promptState]
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!promptState) return;
      if (e.key === "Escape") {
        e.preventDefault();
        handleAction("cancel");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [promptState, handleAction]);

  if (!promptState) return null;

  const { dirtyDocs } = promptState;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in-0 duration-180 ease-out">
      <div className="w-full max-w-md rounded-xl border border-border/80 bg-card p-5 shadow-2xl text-card-foreground animate-in zoom-in-[0.98] duration-180 ease-[cubic-bezier(0.16,1,0.3,1)]">
        <div className="flex items-start gap-3.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20 shadow-2xs">
            <AlertTriangle className="size-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              Save changes before closing workspace?
            </h3>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              You have {dirtyDocs.length} unsaved file{dirtyDocs.length > 1 ? "s" : ""}. If you don&apos;t save, your changes will be permanently lost.
            </p>

            <div className="mt-3 max-h-36 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-2 space-y-1.5 text-xs">
              {dirtyDocs.map((doc) => (
                <div key={doc.id} className="flex items-center gap-2 text-foreground truncate">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="font-medium truncate">{doc.title}</span>
                  <span className="text-[11px] text-muted-foreground truncate ml-auto">{doc.path}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 pt-2 border-t border-border/60">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAction("cancel")}
            className="cursor-pointer active:scale-95 transition-all duration-120"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleAction("discard")}
            className="cursor-pointer active:scale-95 transition-all duration-120"
          >
            Don&apos;t Save
          </Button>
          <Button
            size="sm"
            onClick={() => handleAction("save")}
            className="cursor-pointer font-medium active:scale-95 transition-all duration-120"
          >
            Save All
          </Button>
        </div>
      </div>
    </div>
  );
}
