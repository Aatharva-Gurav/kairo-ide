/**
 * Path Security Validator for Kairo AI Agent.
 *
 * Implements strict canonical path validation, symlink and junction escape detection,
 * Windows drive changes, UNC paths, case normalization, invalid encodings,
 * and sensitive file protection.
 */
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { PathValidationResult } from "../permissions/types";

// Blacklisted filenames and sensitive patterns
const SENSITIVE_FILE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /^\.git([\\/].+)?$/i,
  /^\.ssh([\\/].+)?$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /\.(pem|key|pfx|p12|pkcs12)$/i,
  /^\.aws([\\/].+)?$/i,
  /^\.azure([\\/].+)?$/i,
  /^\.gcloud([\\/].+)?$/i,
  /^\.kairo([\\/].+)?$/i, // Protected Kairo application storage
];

// Dangerous path encodings / invalid sequences
const DANGEROUS_ENCODING_PATTERNS = [
  /\0/, // Null byte injection
  /%2e/i, // URL-encoded dot
  /%2f/i, // URL-encoded slash
  /%5c/i, // URL-encoded backslash
  /%00/i, // URL-encoded null
];

export class PathValidator {
  private readonly isWindows: boolean;

  constructor() {
    this.isWindows = process.platform === "win32";
  }

  /**
   * Normalize path for safe comparison.
   * Strips Windows \\?\ prefix and normalizes separators and case.
   */
  public normalizeForComparison(targetPath: string): string {
    let p = path.normalize(targetPath);
    // Strip Windows Extended-Length Path prefix \\?\ or \\?\UNC\
    if (p.startsWith("\\\\?\\UNC\\")) {
      p = "\\\\" + p.slice(8);
    } else if (p.startsWith("\\\\?\\")) {
      p = p.slice(4);
    }

    // On Windows and macOS, paths are case-insensitive
    if (this.isWindows || process.platform === "darwin") {
      p = p.toLowerCase();
    }
    return p;
  }

  /**
   * Check if a path starts with or is a UNC network path.
   */
  public isUncPath(targetPath: string): boolean {
    const trimmed = targetPath.trim();
    return (
      trimmed.startsWith("\\\\") ||
      trimmed.startsWith("//") ||
      trimmed.startsWith("\\\\?\\UNC\\")
    );
  }

  /**
   * Check for dangerous encodings or invalid characters.
   */
  public hasDangerousEncodings(targetPath: string): { dangerous: boolean; reason?: string } {
    for (const pattern of DANGEROUS_ENCODING_PATTERNS) {
      if (pattern.test(targetPath)) {
        return { dangerous: true, reason: `Path contains invalid or dangerous encoding sequence (${pattern})` };
      }
    }

    // Windows alternate data streams (e.g., file.txt:hidden)
    if (this.isWindows) {
      // Allow drive letters like C:\ but reject trailing colons like file.txt:stream
      const afterDrive = targetPath.replace(/^[a-zA-Z]:[\\/]/, "");
      if (afterDrive.includes(":")) {
        return { dangerous: true, reason: "Path contains Windows alternate data stream syntax (':')" };
      }
    }

    return { dangerous: false };
  }

  /**
   * Check if the path targets a sensitive / protected file.
   */
  public isSensitivePath(relativePath: string): { sensitive: boolean; reason?: string } {
    const normalizedRelative = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
    const segments = normalizedRelative.split("/");

    for (const segment of segments) {
      for (const pattern of SENSITIVE_FILE_PATTERNS) {
        if (pattern.test(segment) || pattern.test(normalizedRelative)) {
          return {
            sensitive: true,
            reason: `Access to sensitive path '${normalizedRelative}' is prohibited by security policy.`,
          };
        }
      }
    }

    return { sensitive: false };
  }

  /**
   * Check if path targets protected Kairo directory (~/.kairo)
   */
  public isKairoInternalStorage(targetPath: string): boolean {
    const kairoHome = path.join(os.homedir(), ".kairo");
    const normalizedTarget = this.normalizeForComparison(targetPath);
    const normalizedKairo = this.normalizeForComparison(kairoHome);

    return (
      normalizedTarget === normalizedKairo ||
      normalizedTarget.startsWith(normalizedKairo + path.sep) ||
      normalizedTarget.startsWith(normalizedKairo + "/")
    );
  }

  /**
   * Validates a target path against a pinned workspace root.
   *
   * @param targetPath The path provided by the model or tool input.
   * @param workspaceRoot The pinned workspace root of the session.
   * @param allowReadSensitive If true, allows reading sensitive files (default: false).
   */
  public validate(
    targetPath: string,
    workspaceRoot: string,
    options: { allowReadSensitive?: boolean } = {}
  ): PathValidationResult {
    if (!targetPath || typeof targetPath !== "string") {
      return { valid: false, error: "Target path must be a non-empty string." };
    }
    if (!workspaceRoot || typeof workspaceRoot !== "string") {
      return { valid: false, error: "Workspace root must be a valid path." };
    }

    // 1. Check for dangerous encodings / null bytes
    const encodingCheck = this.hasDangerousEncodings(targetPath);
    if (encodingCheck.dangerous) {
      return { valid: false, error: encodingCheck.reason };
    }

    // 2. Reject UNC paths immediately
    if (this.isUncPath(targetPath)) {
      return { valid: false, error: "UNC network paths are prohibited." };
    }

    // 3. Reject Kairo internal storage tampering
    if (this.isKairoInternalStorage(targetPath)) {
      return { valid: false, error: "Access to Kairo internal storage (~/.kairo) is prohibited." };
    }

    // 4. Resolve workspace canonical path
    let canonicalWorkspace: string;
    try {
      canonicalWorkspace = fs.realpathSync.native
        ? fs.realpathSync.native(workspaceRoot)
        : fs.realpathSync(workspaceRoot);
    } catch {
      // If workspace directory resolution fails, resolve path strictly
      canonicalWorkspace = path.resolve(workspaceRoot);
    }

    // 5. Windows Drive change detection
    if (this.isWindows) {
      const targetDriveMatch = targetPath.match(/^([a-zA-Z]):/);
      const wsDriveMatch = canonicalWorkspace.match(/^([a-zA-Z]):/);
      if (targetDriveMatch && wsDriveMatch) {
        if (targetDriveMatch[1].toLowerCase() !== wsDriveMatch[1].toLowerCase()) {
          return {
            valid: false,
            error: `Drive change detected: path '${targetPath}' is on drive ${targetDriveMatch[1].toUpperCase()}:, but workspace is on drive ${wsDriveMatch[1].toUpperCase()}:.`,
          };
        }
      }
    }

    // 6. Absolute resolution relative to workspace
    const resolvedPath = path.isAbsolute(targetPath)
      ? path.normalize(targetPath)
      : path.resolve(canonicalWorkspace, targetPath);

    // 7. Canonicalize target path (handling symlinks, junctions, and uncreated files)
    let canonicalTarget: string;
    try {
      // File / dir exists: use realpath to resolve all symlinks and junctions
      canonicalTarget = fs.realpathSync.native
        ? fs.realpathSync.native(resolvedPath)
        : fs.realpathSync(resolvedPath);
    } catch {
      // File does not exist yet (e.g. creating a new file)
      // Climb up to the nearest existing ancestor directory
      let curr = path.dirname(resolvedPath);
      const missingSegments: string[] = [path.basename(resolvedPath)];

      while (curr && curr !== path.dirname(curr) && !fs.existsSync(curr)) {
        missingSegments.unshift(path.basename(curr));
        curr = path.dirname(curr);
      }

      if (fs.existsSync(curr)) {
        try {
          const canonicalAncestor = fs.realpathSync.native
            ? fs.realpathSync.native(curr)
            : fs.realpathSync(curr);
          canonicalTarget = path.join(canonicalAncestor, ...missingSegments);
        } catch {
          canonicalTarget = resolvedPath;
        }
      } else {
        canonicalTarget = resolvedPath;
      }
    }

    // 8. Re-check UNC after realpath resolution
    if (this.isUncPath(canonicalTarget)) {
      return { valid: false, error: "Resolved path is a UNC network path, which is prohibited." };
    }

    // 9. Boundary containment check (case-normalized)
    const normWorkspace = this.normalizeForComparison(canonicalWorkspace);
    const normTarget = this.normalizeForComparison(canonicalTarget);

    const isInside =
      normTarget === normWorkspace ||
      normTarget.startsWith(normWorkspace + (normWorkspace.endsWith(path.sep) ? "" : path.sep)) ||
      normTarget.startsWith(normWorkspace + (normWorkspace.endsWith("/") ? "" : "/"));

    if (!isInside) {
      return {
        valid: false,
        error: `Path traversal violation: path '${targetPath}' escapes workspace root '${workspaceRoot}'.`,
      };
    }

    // 10. Check relative path for traversal & sensitive files
    const relativePath = path.relative(canonicalWorkspace, canonicalTarget);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      return {
        valid: false,
        error: `Path escapes workspace root: relative path '${relativePath}' points outside root.`,
      };
    }

    // 11. Sensitive file check
    if (!options.allowReadSensitive) {
      const sensitiveCheck = this.isSensitivePath(relativePath);
      if (sensitiveCheck.sensitive) {
        return { valid: false, error: sensitiveCheck.reason };
      }
    }

    return {
      valid: true,
      canonicalPath: canonicalTarget,
      relativePath: relativePath.replace(/\\/g, "/"),
    };
  }
}
