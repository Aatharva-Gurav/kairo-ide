import React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Folder01Icon,
  Folder02Icon,
  File01Icon,
  CodeIcon,
  FileCodeIcon,
  Image01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { getFileExtension } from "@/lib/tauri-ipc";

interface FileIconProps {
  name: string;
  isDirectory: boolean;
  isExpanded?: boolean;
  className?: string;
}

export function FileIcon({ name, isDirectory, isExpanded, className = "size-4 shrink-0" }: FileIconProps) {
  if (isDirectory) {
    return (
      <HugeiconsIcon
        icon={isExpanded ? Folder02Icon : Folder01Icon}
        className={`${className} text-amber-500/90 dark:text-amber-400`}
      />
    );
  }

  const ext = getFileExtension(name);
  const lowerName = name.toLowerCase();

  // Config and system dotfiles
  if (
    lowerName === "package.json" ||
    lowerName === "tsconfig.json" ||
    lowerName === "components.json" ||
    lowerName === "cargo.toml" ||
    lowerName === "tauri.conf.json" ||
    lowerName.startsWith(".env") ||
    lowerName.startsWith(".git")
  ) {
    return (
      <HugeiconsIcon
        icon={Settings01Icon}
        className={`${className} text-neutral-400 dark:text-neutral-500`}
      />
    );
  }

  // TypeScript / JavaScript
  if (ext === "ts" || ext === "tsx" || ext === "js" || ext === "jsx" || ext === "mjs") {
    return (
      <HugeiconsIcon
        icon={CodeIcon}
        className={`${className} text-blue-500 dark:text-blue-400`}
      />
    );
  }

  // Rust
  if (ext === "rs") {
    return (
      <HugeiconsIcon
        icon={CodeIcon}
        className={`${className} text-orange-500 dark:text-orange-400`}
      />
    );
  }

  // Stylesheet / CSS
  if (ext === "css" || ext === "scss" || ext === "less") {
    return (
      <HugeiconsIcon
        icon={FileCodeIcon}
        className={`${className} text-cyan-500 dark:text-cyan-400`}
      />
    );
  }

  // HTML / XML / SVG
  if (ext === "html" || ext === "svg" || ext === "xml") {
    return (
      <HugeiconsIcon
        icon={FileCodeIcon}
        className={`${className} text-amber-600 dark:text-amber-500`}
      />
    );
  }

  // Images
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "ico" || ext === "webp" || ext === "gif") {
    return (
      <HugeiconsIcon
        icon={Image01Icon}
        className={`${className} text-purple-500 dark:text-purple-400`}
      />
    );
  }

  // Markdown / Text / Default file
  return (
    <HugeiconsIcon
      icon={File01Icon}
      className={`${className} text-muted-foreground`}
    />
  );
}

