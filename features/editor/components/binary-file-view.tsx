"use client";

import React from "react";
import { EditorDocument } from "../types";
import { useEditor } from "../store";
import { getFileExtension, revealInFileManager } from "@/lib/tauri-ipc";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { HugeiconsIcon } from "@hugeicons/react";
import { File01Icon, Folder01Icon } from "@hugeicons/core-free-icons";

interface BinaryFileViewProps {
  document: EditorDocument;
}

export function BinaryFileView({ document }: BinaryFileViewProps) {
  const { revealInExplorer } = useEditor();
  const ext = getFileExtension(document.path);

  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico"].includes(ext);

  let imageSrc = "";
  if (isImage) {
    try {
      imageSrc = convertFileSrc(document.path);
    } catch {
      imageSrc = `file://${document.path}`;
    }
  }

  const handleReveal = async () => {
    try {
      await revealInFileManager(document.path);
    } catch {
      revealInExplorer(document.path);
    }
  };

  if (isImage) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 bg-background select-none overflow-auto">
        <div className="rounded-xl border border-border/80 bg-card/40 p-4 shadow-sm max-w-lg flex flex-col items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={document.title}
            className="max-h-[60vh] max-w-full object-contain rounded-lg border border-border/60 bg-muted/20"
          />
          <div className="mt-3 flex items-center justify-between w-full text-xs text-muted-foreground font-mono">
            <span className="truncate max-w-[200px] text-foreground/80">{document.title}</span>
            <Button size="xs" variant="outline" onClick={handleReveal} className="cursor-pointer">
              <HugeiconsIcon icon={Folder01Icon} className="size-3 mr-1.5" />
              Reveal in File Manager
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 text-center select-none bg-background">
      <div className="flex size-12 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 mb-3 border border-amber-500/20 shadow-2xs">
        <HugeiconsIcon icon={File01Icon} className="size-6" />
      </div>

      <h2 className="text-base font-semibold tracking-tight text-foreground">
        {document.isTooLarge ? "File Too Large" : "Binary File"}
      </h2>
      <p className="text-xs text-muted-foreground mt-1 max-w-md leading-relaxed">
        {document.isTooLarge
          ? "This file exceeds the 20MB safe editor threshold and cannot be opened without risking performance degradation."
          : "This file appears to be binary and cannot be opened in the text editor."}
      </p>

      <div className="mt-5">
        <Button onClick={handleReveal} size="sm" variant="outline" className="cursor-pointer">
          <HugeiconsIcon icon={Folder01Icon} className="size-3.5 mr-1.5" />
          Reveal in File Manager
        </Button>
      </div>
    </div>
  );
}

