"use client";

import React from "react";
import { useIconTheme } from "../context";
import { resolveIcon } from "../resolver";
import { cn } from "@/lib/utils";

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
  className,
  title,
  style,
}: FileIconProps) {
  const iconThemeContext = useIconTheme();
  const iconDef = iconThemeContext
    ? iconThemeContext.resolveIcon({ name, isDirectory, isExpanded })
    : resolveIcon({ name, isDirectory, isExpanded });

  let resolvedClass = className;
  if (isDirectory) {
    if (!resolvedClass) {
      resolvedClass = "w-[17px] h-[13.5px]";
    } else {
      // If className includes a square size class like size-3.5, size-4, or size-3, convert it to realistic proportional dimensions
      if (resolvedClass.includes("size-3.5")) {
        resolvedClass = resolvedClass.replace("size-3.5", "w-[17px] h-[13.5px]");
      } else if (resolvedClass.includes("size-4")) {
        resolvedClass = resolvedClass.replace("size-4", "w-[18px] h-[14.5px]");
      } else if (resolvedClass.includes("size-3")) {
        resolvedClass = resolvedClass.replace("size-3", "w-[15px] h-[12px]");
      } else if (!resolvedClass.includes("w-") && !resolvedClass.includes("h-")) {
        resolvedClass = cn("w-[17px] h-[13.5px]", resolvedClass);
      }
    }
  } else {
    if (!resolvedClass || (!resolvedClass.includes("size-") && !resolvedClass.includes("w-"))) {
      resolvedClass = cn("size-4", resolvedClass);
    }
  }

  return (
    <>
      {iconDef.render({
        className: cn(
          "shrink-0 inline-block align-middle transition-opacity duration-100",
          resolvedClass
        ),
        title:
          title ??
          (isDirectory
            ? isExpanded
              ? `${name} (Open folder)`
              : `${name} (Folder)`
            : name),
        style,
      })}
    </>
  );
}

