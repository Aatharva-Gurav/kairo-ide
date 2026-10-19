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
  ZoomIn,
  ZoomOut,
  RotateCcw,
  File,
  Archive,
  Cpu,
  FileText,
  Music,
  Grid,
  Sun,
  Moon,
  Code,
  Eye,
  ImageOff,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

  // Image viewer state
  const [zoom, setZoom] = useState(1);
  const [bgStyle, setBgStyle] = useState<"checkerboard" | "dark" | "light">("checkerboard");
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [metadata, setMetadata] = useState<DetailedMetadata | null>(null);
  const [copied, setCopied] = useState(false);
  const [svgMode, setSvgMode] = useState<"image" | "code">("image");
  const [imgError, setImgError] = useState(false);

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
  if (isImage || isAudio || isVideo) {
    if (ext === "svg" && document.content) {
      mediaSrc = `data:image/svg+xml;utf8,${encodeURIComponent(document.content)}`;
    } else {
      try {
        mediaSrc = convertFileSrc(document.path);
      } catch {
        mediaSrc = `file://${document.path}`;
      }
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

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 5));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.25));
  const handleResetZoom = () => setZoom(1);

  // 1. IMAGE VIEWER WITH ZOOM & CANVAS BACKGROUND CONTROLS
  if (isImage) {
    return (
      <div className="flex flex-1 flex-col h-full w-full bg-background select-none overflow-hidden relative">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border/70 bg-card/40 backdrop-blur-xs text-xs z-10 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-muted-foreground uppercase px-2 py-0.5 rounded bg-muted/50 border border-border/50 font-semibold">
              {ext || "IMG"}
            </span>
            <span className="font-medium text-foreground truncate max-w-[240px]">
              {document.title}
            </span>
            {dimensions && (
              <span className="text-muted-foreground/70 font-mono text-[11px]">
                {dimensions.width} × {dimensions.height} px
              </span>
            )}
            {metadata?.size !== undefined && (
              <span className="text-muted-foreground/70 font-mono text-[11px]">
                ({formatBytes(metadata.size)})
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Zoom controls */}
            <div className="flex items-center bg-muted/40 rounded-lg p-0.5 border border-border/50 mr-2">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleZoomOut}
                title="Zoom Out"
                disabled={zoom <= 0.25}
                className="size-6 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <ZoomOut className="size-3.5" />
              </Button>
              <span className="font-mono text-[11px] px-2 min-w-[45px] text-center text-muted-foreground">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleZoomIn}
                title="Zoom In"
                disabled={zoom >= 5}
                className="size-6 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <ZoomIn className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={handleResetZoom}
                title="Reset Zoom (100%)"
                className="size-6 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <RotateCcw className="size-3.5" />
              </Button>
            </div>

            {/* Background pattern toggle */}
            <div className="flex items-center bg-muted/40 rounded-lg p-0.5 border border-border/50 mr-2">
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setBgStyle("checkerboard")}
                title="Checkerboard Background"
                className={cn(
                  "size-6 cursor-pointer",
                  bgStyle === "checkerboard"
                    ? "bg-background text-foreground shadow-2xs font-bold"
                    : "text-muted-foreground"
                )}
              >
                <Grid className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setBgStyle("dark")}
                title="Dark Background"
                className={cn(
                  "size-6 cursor-pointer",
                  bgStyle === "dark"
                    ? "bg-background text-foreground shadow-2xs font-bold"
                    : "text-muted-foreground"
                )}
              >
                <Moon className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setBgStyle("light")}
                title="Light Background"
                className={cn(
                  "size-6 cursor-pointer",
                  bgStyle === "light"
                    ? "bg-background text-foreground shadow-2xs font-bold"
                    : "text-muted-foreground"
                )}
              >
                <Sun className="size-3.5" />
              </Button>
            </div>

            {/* SVG Mode toggle (Preview vs Code) */}
            {ext === "svg" && document.content && (
              <div className="flex items-center bg-muted/40 rounded-lg p-0.5 border border-border/50 mr-2">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setSvgMode("image")}
                  title="View Rendered Image"
                  className={cn(
                    "size-6 cursor-pointer gap-1 px-1.5 w-auto text-[11px]",
                    svgMode === "image"
                      ? "bg-background text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground"
                  )}
                >
                  <Eye className="size-3" />
                  <span>Preview</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setSvgMode("code")}
                  title="View SVG Source Code"
                  className={cn(
                    "size-6 cursor-pointer gap-1 px-1.5 w-auto text-[11px]",
                    svgMode === "code"
                      ? "bg-background text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground"
                  )}
                >
                  <Code className="size-3" />
                  <span>Code</span>
                </Button>
              </div>
            )}

            {/* Actions */}
            <Button
              variant="outline"
              size="xs"
              onClick={handleCopyPath}
              className="cursor-pointer gap-1 text-[11px]"
            >
              {copied ? <Check className="size-3 text-green-500" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy Path"}
            </Button>
            <Button
              variant="outline"
              size="xs"
              onClick={handleReveal}
              className="cursor-pointer gap-1 text-[11px]"
            >
              <Folder className="size-3" />
              Reveal
            </Button>
          </div>
        </div>

        {/* Viewport Canvas or Code View */}
        {svgMode === "code" && document.content ? (
          <div className="flex-1 w-full h-full p-4 overflow-auto font-mono text-xs select-text bg-background">
            <pre className="p-4 rounded-lg bg-card/60 border border-border/60 text-foreground overflow-x-auto whitespace-pre font-mono leading-relaxed">
              <code>{document.content}</code>
            </pre>
          </div>
        ) : (
          <div
            className={cn(
              "flex flex-1 items-center justify-center p-8 overflow-auto transition-colors duration-150",
              bgStyle === "checkerboard" &&
                "bg-[radial-gradient(#80808022_1px,transparent_1px)] [background-size:16px_16px] bg-[#121214]",
              bgStyle === "dark" && "bg-[#0f0f11]",
              bgStyle === "light" && "bg-[#f5f5f7]"
            )}
          >
            {imgError ? (
              <div className="flex flex-col items-center justify-center p-8 gap-3 text-center max-w-sm rounded-xl border border-border bg-card/50">
                <div className="size-12 rounded-xl bg-muted/60 border border-border flex items-center justify-center text-muted-foreground">
                  <ImageOff className="size-6" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-sm">{document.title}</span>
                  <span className="text-xs text-muted-foreground">
                    Web preview for {ext.toUpperCase()} is not natively supported by your browser engine. You can reveal or open it with your OS viewer.
                  </span>
                </div>
                <Button variant="outline" size="xs" onClick={handleReveal} className="cursor-pointer gap-1 mt-1">
                  <Folder className="size-3" />
                  Reveal in File Manager
                </Button>
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={mediaSrc}
                alt={document.title}
                onError={() => setImgError(true)}
                onLoad={(e) => {
                  setDimensions({
                    width: e.currentTarget.naturalWidth,
                    height: e.currentTarget.naturalHeight,
                  });
                }}
                style={{
                  transform: `scale(${zoom})`,
                  transformOrigin: "center center",
                }}
                className="max-h-[75vh] max-w-[85vw] object-contain rounded-md shadow-lg transition-transform duration-100 ease-out border border-white/5"
              />
            )}
          </div>
        )}
      </div>
    );
  }

  // 2. AUDIO PLAYER
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

  // 3. VIDEO PLAYER
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

  // 4. GENERAL BINARY, ARCHIVE, EXECUTABLE, OR OVERSIZED FILE INSPECTOR
  const getCategoryIcon = () => {
    if (isArchive) return <Archive className="size-8 text-amber-500" />;
    if (isExecutable) return <Cpu className="size-8 text-blue-500" />;
    if (isPdf) return <FileText className="size-8 text-red-500" />;
    return <File className="size-8 text-muted-foreground" />;
  };

  const getCategoryTitle = () => {
    if (document.isTooLarge) return "Large File";
    if (isArchive) return "Archive File";
    if (isExecutable) return "Executable / Binary";
    if (isPdf) return "PDF Document";
    return "Binary File";
  };

  const getCategoryDescription = () => {
    if (document.isTooLarge) {
      return "This file exceeds the 20MB safe editor threshold and cannot be opened directly in the text editor to maintain high performance.";
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

