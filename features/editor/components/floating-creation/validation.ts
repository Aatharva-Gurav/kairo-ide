import {
  validateFileName,
  normalizePath,
  joinPath,
  isDescendant,
} from "@/lib/tauri-ipc";
import { CreationValidationResult, CreationType } from "./types";

/**
 * Validates the file or folder name and target directory before creation.
 */
export function validateCreationInput(
  name: string,
  type: CreationType,
  targetDirPath: string,
  workspaceRootPath: string
): CreationValidationResult {
  const trimmed = name.trim();

  if (!trimmed) {
    return {
      valid: false,
      error: `Please enter a ${type === "file" ? "file" : "folder"} name.`,
    };
  }

  // Prevent slash or backslash in the item name
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return {
      valid: false,
      error: "Name cannot contain path separators (/ or \\).",
    };
  }

  // Prevent parent directory traversal
  if (trimmed === ".." || trimmed === ".") {
    return {
      valid: false,
      error: `Name cannot be "${trimmed}".`,
    };
  }

  // Standard OS validation (illegal characters, reserved device names)
  const baseValidation = validateFileName(trimmed);
  if (!baseValidation.valid) {
    return {
      valid: false,
      error: baseValidation.error || "Invalid name for this operating system.",
    };
  }

  // Verify that target directory is within workspace boundary
  const normRoot = normalizePath(workspaceRootPath).toLowerCase();
  const normTarget = normalizePath(targetDirPath).toLowerCase();

  if (normTarget !== normRoot && !isDescendant(workspaceRootPath, targetDirPath)) {
    return {
      valid: false,
      error: "Selected destination is outside the active workspace.",
    };
  }

  // Verify that combined path stays inside workspace
  const combined = joinPath(targetDirPath, trimmed);
  const normCombined = normalizePath(combined).toLowerCase();
  if (!normCombined.startsWith(normRoot.endsWith("/") ? normRoot : normRoot + "/")) {
    return {
      valid: false,
      error: "Target path escapes the active workspace boundary.",
    };
  }

  return { valid: true };
}

