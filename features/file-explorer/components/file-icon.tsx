"use client";

/**
 * Re-export FileIcon from the centralized icon-theme feature.
 * Preserves 100% backward compatibility for any existing explorer components.
 */
export { FileIcon } from "@/features/icon-theme";
export type { FileIconProps } from "@/features/icon-theme";
