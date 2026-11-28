"use client";

import React, { useState, useEffect } from "react";
import { EditorDocument } from "../types";
import { useEditor } from "../store";
import {
  getFileExtension,
  revealInFileManager,
  getDetailedMetadata,
  formatBytes,
  copyToClipboard,
  DetailedMetadata,
  isImageFile,
} from "@/lib/tauri-ipc";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Button } from "@/components/ui/button";
import { HexViewer } from "./hex-viewer";
import {
  Folder,
  Copy,
  Check,
  Music,
} from "lucide-react";

interface BinaryFileViewProps {
  document: EditorDocument;
}

export function BinaryFileView({ document }: BinaryFileViewProps) {
  const { revealInExplorer } = useEditor();
  const ext = getFileExtension(document.path).toLowerCase();

  const isImage = isImageFile(document.path);
  const isAudio = ["mp3", "wav", "ogg", "flac", "m4a", "aac"].includes(ext);
  const isVideo = ["mp4", "webm", "mov", "mkv", "avi"].includes(ext);

  const [metadata, setMetadata] = useState<DetailedMetadata | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let isMounted = true;
    getDetailedMetadata(document.path)
      .then((meta) => {
        if (isMounted) setMetadata(meta);
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, [document.path]);

  let mediaSrc = "";
  if (isAudio || isVideo || isImage) {
    try {
      mediaSrc = convertFileSrc(document.path);
    } catch {
      mediaSrc = `file://${document.path}`;
    }
  }

  const handleReveal = async () => {
    try {
      await revealInFileManager(document.path);
    } catch {
      revealInExplorer(document.path);
    }
  };

  const handleCopyPath = async () => {
    await copyToClipboard(document.path);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // 1. AUDIO PLAYER
  if (isAudio) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 select-none bg-background">
        <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card/60 p-6 shadow-xl backdrop-blur-md flex flex-col items-center gap-4">
          <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
            <Music className="size-8" />
          </div>
          <div className="text-center">
            <h3 className="text-base font-semibold text-foreground tracking-tight">
              {document.title}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              {metadata?.size ? formatBytes(metadata.size) : "Audio File"}
            </p>
          </div>

          <audio controls className="w-full mt-2" src={mediaSrc}>
            Your browser does not support the audio element.
          </audio>

          <div className="flex items-center gap-2 mt-2 w-full justify-center">
            <Button size="xs" variant="outline" onClick={handleCopyPath} className="cursor-pointer gap-1">
              {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy Path"}
            </Button>
            <Button size="xs" variant="outline" onClick={handleReveal} className="cursor-pointer gap-1">
              <Folder className="size-3" />
              Reveal in File Manager
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 2. VIDEO PLAYER
  if (isVideo) {
    return (
      <div className="flex flex-1 flex-col h-full w-full bg-background select-none overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/70 bg-card/40 backdrop-blur-xs text-xs z-10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground uppercase px-2 py-0.5 rounded bg-muted/50 border border-border/50 font-semibold">
              {ext || "VIDEO"}
            </span>
            <span className="font-medium text-foreground truncate max-w-[240px]">
              {document.title}
            </span>
            {metadata?.size !== undefined && (
              <span className="text-muted-foreground/70 font-mono text-[11px]">
                ({formatBytes(metadata.size)})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="xs" variant="outline" onClick={handleCopyPath} className="cursor-pointer gap-1 text-[11px]">
              {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy Path"}
            </Button>
            <Button size="xs" variant="outline" onClick={handleReveal} className="cursor-pointer gap-1 text-[11px]">
              <Folder className="size-3" />
              Reveal in File Manager
            </Button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center p-6 bg-black/60 overflow-hidden">
          <video
            controls
            className="max-h-[80vh] max-w-full rounded-xl shadow-2xl border border-white/10"
            src={mediaSrc}
          >
            Your browser does not support the video tag.
          </video>
        </div>
      </div>
    );
  }

  // 2b. IMAGE VIEWER
  if (isImage) {
    return (
      <div className="flex flex-1 flex-col h-full w-full bg-background select-none overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/70 bg-card/40 backdrop-blur-xs text-xs z-10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground uppercase px-2 py-0.5 rounded bg-muted/50 border border-border/50 font-semibold">
              {ext || "IMAGE"}
            </span>
            <span className="font-medium text-foreground truncate max-w-[240px]">
              {document.title}
            </span>
            {metadata?.size !== undefined && (
              <span className="text-muted-foreground/70 font-mono text-[11px]">
                ({formatBytes(metadata.size)})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="xs" variant="outline" onClick={handleCopyPath} className="cursor-pointer gap-1 text-[11px]">
              {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy Path"}
            </Button>
            <Button size="xs" variant="outline" onClick={handleReveal} className="cursor-pointer gap-1 text-[11px]">
              <Folder className="size-3" />
              Reveal in File Manager
            </Button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center p-6 bg-[radial-gradient(#80808020_1px,transparent_1px)] [background-size:16px_16px] overflow-auto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaSrc}
            alt={document.title}
            className="max-h-[80vh] max-w-full rounded-lg shadow-xl border border-border/60 object-contain"
          />
        </div>
      </div>
    );
  }

  // 3. GENERAL BINARY, ARCHIVE, EXECUTABLE, OR OVERSIZED FILE HEX VIEWER
  return <HexViewer key={document.id} document={document} />;
}
