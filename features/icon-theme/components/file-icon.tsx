"use client";

import React from "react";
import { useIconTheme } from "../context";
import { resolveIcon } from "../resolver";

export interface FileIconProps {
  name: string;
  isDirectory?: boolean;
  isExpanded?: boolean;
  className?: string;
  title?: string;
  style?: React.CSSProperties;
}

export function FileIcon({
  name,
  isDirectory = false,
  isExpanded = false,
  className = "size-4 shrink-0",
  title,
  style,
}: FileIconProps) {
  const iconThemeContext = useIconTheme();
  const iconDef = iconThemeContext
    ? iconThemeContext.resolveIcon({ name, isDirectory, isExpanded })
    : resolveIcon({ name, isDirectory, isExpanded });

  return (
    <>
      {iconDef.render({
        className,
        title: title ?? (isDirectory ? (isExpanded ? `${name} (Open folder)` : `${name} (Folder)`) : name),
        style,
      })}
    </>
  );
}

