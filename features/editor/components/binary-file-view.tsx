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
import {
  Folder,
  Copy,
  Check,
  File,
  Archive,
  Cpu,
  FileText,
  Music,
  ImageIcon,
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
  const isArchive = ["zip", "tar", "gz", "7z", "rar", "bz2", "xz"].includes(ext);
  const isExecutable = ["exe", "dll", "so", "dylib", "bin", "iso", "wasm", "class"].includes(ext);
  const isPdf = ext === "pdf";

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

  // 3. GENERAL BINARY, IMAGE, ARCHIVE, EXECUTABLE, OR OVERSIZED FILE INSPECTOR
  const getCategoryIcon = () => {
    if (isImage) return <ImageIcon className="size-8 text-sky-500" />;
    if (isArchive) return <Archive className="size-8 text-amber-500" />;
    if (isExecutable) return <Cpu className="size-8 text-blue-500" />;
    if (isPdf) return <FileText className="size-8 text-red-500" />;
    return <File className="size-8 text-muted-foreground" />;
  };

  const getCategoryTitle = () => {
    if (document.isTooLarge) return "Large File";
    if (isImage) return "Image File";
    if (isArchive) return "Archive File";
    if (isExecutable) return "Executable / Binary";
    if (isPdf) return "PDF Document";
    return "Binary File";
  };

  const getCategoryDescription = () => {
    if (document.isTooLarge) {
      return "This file exceeds the 20MB safe editor threshold and cannot be opened directly in the text editor to maintain high performance.";
    }
    if (isImage) {
      return "This is an image file. Click below to copy its path or reveal it in your file manager.";
    }
    if (isArchive) {
      return "This is a compressed archive containing packaged files and data.";
    }
    if (isExecutable) {
      return "This is a compiled executable or native system binary.";
    }
    if (isPdf) {
      return "This is a PDF document that can be viewed with your system's default PDF application.";
    }
    return "This file contains binary data and cannot be displayed in the text editor.";
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center p-8 select-none bg-background">
      <div className="w-full max-w-md rounded-2xl border border-border/80 bg-card/50 p-6 shadow-xl backdrop-blur-md flex flex-col items-center text-center animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/60 border border-border/80 shadow-xs mb-3">
          {getCategoryIcon()}
        </div>

        <h3 className="text-base font-semibold text-foreground tracking-tight">
          {getCategoryTitle()}
        </h3>
        <p className="text-xs font-mono text-muted-foreground mt-0.5 truncate max-w-full px-4">
          {document.title}
        </p>

        <p className="text-xs text-muted-foreground/80 mt-2.5 max-w-sm leading-relaxed">
          {getCategoryDescription()}
        </p>

        {/* Detailed File Metadata Card */}
        <div className="w-full mt-4 p-3 rounded-xl bg-muted/30 border border-border/60 text-left text-[11px] font-mono flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-muted-foreground">
            <span>Size:</span>
            <span className="text-foreground font-medium">
              {metadata?.size !== undefined ? formatBytes(metadata.size) : "Unknown"}
            </span>
          </div>
          <div className="flex justify-between items-center text-muted-foreground">
            <span>Extension:</span>
            <span className="text-foreground font-medium uppercase">{ext || "none"}</span>
          </div>
          <div className="flex justify-between items-start text-muted-foreground gap-2">
            <span>Path:</span>
            <span className="text-foreground truncate max-w-[240px] text-right" title={document.path}>
              {document.path}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2.5 mt-5">
          <Button onClick={handleCopyPath} size="sm" variant="outline" className="cursor-pointer gap-1.5">
            {copied ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy Path"}
          </Button>
          <Button onClick={handleReveal} size="sm" variant="outline" className="cursor-pointer gap-1.5">
            <Folder className="size-3.5" />
            Reveal in File Manager
          </Button>
        </div>
      </div>
    </div>
  );
}
