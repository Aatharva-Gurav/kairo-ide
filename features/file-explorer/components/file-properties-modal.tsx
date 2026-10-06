"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useFileExplorer } from "../store";
import { FileExplorerService } from "../service";
import { ItemProperties } from "../types";
import { formatBytes, copyToClipboard } from "@/lib/tauri-ipc";
import { Button } from "@/components/ui/button";
import { FileIcon } from "./file-icon";
import { X, CheckCircle2, Copy } from "lucide-react";

export function FilePropertiesModal() {
  const { propertiesCandidate, closeProperties } = useFileExplorer();
  const isOpen = propertiesCandidate !== null;

  const [properties, setProperties] = useState<ItemProperties | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (propertiesCandidate) {
      setLoading(true);
      FileExplorerService.getItemProperties(propertiesCandidate)
        .then((props) => {
          if (isMounted) {
            setProperties(props);
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error("Failed to load properties:", err);
          if (isMounted) setLoading(false);
        });
    } else {
      setProperties(null);
    }
    return () => {
      isMounted = false;
    };
  }, [propertiesCandidate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeProperties();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, closeProperties]);

  const handleCopy = async (text: string, fieldName: string) => {
    await copyToClipboard(text);
    setCopiedField(fieldName);
    setTimeout(() => {
      setCopiedField(null);
    }, 1500);
  };

  if (!isOpen || !propertiesCandidate || typeof document === "undefined") {
    return null;
  }

  const isDirectory = propertiesCandidate.type === "directory";

  const formatDate = (ms?: number) => {
    if (!ms) return "Unknown";
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "medium",
    });
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in-0 duration-150 ease-out">
      <div
        className="w-full max-w-md rounded-xl border border-border/80 bg-card p-5 shadow-2xl text-card-foreground animate-in zoom-in-95 duration-150 ease-out flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="properties-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <FileIcon
                name={propertiesCandidate.name}
                isDirectory={isDirectory}
                className="size-4"
              />
            </div>
            <div>
              <h3 id="properties-modal-title" className="text-sm font-semibold tracking-tight text-foreground">
                {propertiesCandidate.name}
              </h3>
              <p className="text-[11px] text-muted-foreground capitalize">
                {propertiesCandidate.type} Properties
              </p>
            </div>
          </div>
          <button
            onClick={closeProperties}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-8 flex flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
            <div className="size-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <span>Calculating properties...</span>
          </div>
        ) : properties ? (
          <div className="py-3 space-y-2.5 text-xs">
            {/* Location */}
            <div>
              <div className="flex items-center justify-between text-muted-foreground text-[11px] mb-0.5">
                <span>Location</span>
                <button
                  type="button"
                  onClick={() => handleCopy(properties.path, "path")}
                  className="flex items-center gap-1 text-[10px] text-primary hover:underline cursor-pointer"
                >
                  {copiedField === "path" ? (
                    <CheckCircle2 className="size-3" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                  <span>{copiedField === "path" ? "Copied" : "Copy Path"}</span>
                </button>
              </div>
              <div className="p-2 rounded bg-muted/30 border border-border/60 font-mono text-[11px] text-foreground break-all select-all">
                {properties.path}
              </div>
            </div>

            {/* Size & Contains */}
            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
              <div>
                <span className="text-[11px] text-muted-foreground block">Size</span>
                <span className="font-semibold text-foreground font-mono">
                  {formatBytes(properties.size)}
                </span>
                <span className="text-[10px] text-muted-foreground block font-mono">
                  ({properties.size.toLocaleString()} bytes)
                </span>
              </div>
              {isDirectory && (
                <div>
                  <span className="text-[11px] text-muted-foreground block">Contains</span>
                  <span className="font-semibold text-foreground">
                    {properties.fileCount.toLocaleString()} files, {properties.folderCount.toLocaleString()} folders
                  </span>
                </div>
              )}
            </div>

            {/* Timestamps */}
            <div className="space-y-1.5 pt-1 border-t border-border/40">
              {properties.createdAt && (
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-muted-foreground">Created:</span>
                  <span className="text-foreground font-mono">
                    {formatDate(properties.createdAt)}
                  </span>
                </div>
              )}
              {properties.modifiedAt && (
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-muted-foreground">Modified:</span>
                  <span className="text-foreground font-mono">
                    {formatDate(properties.modifiedAt)}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center text-[11px]">
                <span className="text-muted-foreground">Attributes:</span>
                <span className="text-foreground">
                  {properties.isReadonly ? "Read-only" : "Read & Write"}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Unable to load properties for this item.
          </div>
        )}

        {/* Footer */}
        <div className="pt-3 flex justify-end border-t border-border/60">
          <Button
            type="button"
            size="sm"
            onClick={closeProperties}
            className="cursor-pointer"
          >
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}

