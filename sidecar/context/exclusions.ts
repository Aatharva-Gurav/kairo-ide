/**
 * Exclusions & Sensitive File Filter for Kairo Workspace Context.
 *
 * Enforces hard exclusion of sensitive credentials, secrets, tokens,
 * build artifacts, binary files, and large files.
 */
import path from "node:path";
import fs from "node:fs";

// Sensitive files that must NEVER be automatically ingested into agent context
export const SENSITIVE_FILENAME_PATTERNS: RegExp[] = [
  /^\.env(\..+)?$/i,
  /\.(pem|key|pfx|p12|pkcs12)$/i,
  /^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/i,
  /^\.aws([\\/].+)?$/i,
  /^\.azure([\\/].+)?$/i,
  /^\.gcloud([\\/].+)?$/i,
  /\.(kdbx|vault)$/i,
  /credentials\.json$/i,
  /token\.json$/i,
  /auth_token/i,
  /^\.kairo([\\/].+)?$/i,
];

// Directories and generated artifacts to ignore by default
export const IGNORED_DIRECTORIES: Set<string> = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  ".cache",
  "dist",
  "build",
  "out",
  "target",
  "coverage",
  ".kairo",
  ".venv",
  "venv",
  "__pycache__",
  ".idea",
  ".vscode",
]);

// Binary file extensions that should not be read as text
export const BINARY_EXTENSIONS: Set<string> = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".webp", ".tiff", ".svg",
  ".mp3", ".wav", ".ogg", ".mp4", ".mov", ".avi", ".mkv", ".webm",
  ".zip", ".tar", ".gz", ".7z", ".rar", ".bz2", ".xz",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".exe", ".dll", ".so", ".dylib", ".bin", ".iso", ".dmg", ".wasm",
  ".class", ".pyc", ".pyo", ".jar", ".war", ".ear",
  ".sqlite", ".db", ".sqlite3",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
]);

// Large lockfiles to deprioritize/exclude from full context injection
export const LOCKFILES: Set<string> = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock",
  "cargo.lock",
  "poetry.lock",
  "composer.lock",
  "gemfile.lock",
]);

export const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1 MB
export const MAX_FILE_CHARACTERS = 50000;

export class ExclusionsManager {
  private readonly customIgnorePatterns: string[] = [];

  constructor(workspaceRoot?: string) {
    if (workspaceRoot) {
      this.loadWorkspaceIgnores(workspaceRoot);
    }
  }

  private loadWorkspaceIgnores(workspaceRoot: string): void {
    const candidates = [".gitignore", ".kairoignore", ".clineignore"];
    for (const cand of candidates) {
      const fullPath = path.join(workspaceRoot, cand);
      try {
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, "utf8");
          const lines = content
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 0 && !l.startsWith("#"));
          this.customIgnorePatterns.push(...lines);
        }
      } catch {
        // Ignore read errors
      }
    }
  }

  /**
   * Returns true if the file or relative path is sensitive and must NEVER be read automatically.
   */
  public isSensitive(relativePathOrName: string): boolean {
    const normalized = relativePathOrName.replace(/\\/g, "/").replace(/^\.\//, "");
    const base = path.basename(normalized);
    const segments = normalized.split("/");

    for (const pattern of SENSITIVE_FILENAME_PATTERNS) {
      if (pattern.test(base) || pattern.test(normalized)) {
        return true;
      }
      for (const seg of segments) {
        if (pattern.test(seg)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Returns true if the directory name should be skipped during search/indexing.
   */
  public isIgnoredDirectory(dirName: string): boolean {
    const clean = dirName.replace(/[\\/]/g, "").toLowerCase();
    return IGNORED_DIRECTORIES.has(clean);
  }

  /**
   * Returns true if the file is binary based on extension or null-byte buffer test.
   */
  public isBinaryFile(filePath: string, buffer?: Buffer): boolean {
    const ext = path.extname(filePath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      return true;
    }

    if (buffer && buffer.length > 0) {
      // Check first 512 bytes for null bytes
      const sample = buffer.subarray(0, Math.min(buffer.length, 512));
      for (let i = 0; i < sample.length; i++) {
        if (sample[i] === 0) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Returns true if file is a heavy lockfile.
   */
  public isLockfile(fileName: string): boolean {
    return LOCKFILES.has(path.basename(fileName).toLowerCase());
  }

  /**
   * Returns true if the file exceeds the maximum allowed size.
   */
  public isOversized(sizeInBytes: number): boolean {
    return sizeInBytes > MAX_FILE_SIZE_BYTES;
  }

  /**
   * Comprehensive check: returns whether a file should be excluded from automatic context.
   */
  public shouldExclude(
    relativePath: string,
    options: {
      fileSizeBytes?: number;
      allowLockfiles?: boolean;
    } = {}
  ): { exclude: boolean; reason?: string } {
    // 1. Sensitive file check
    if (this.isSensitive(relativePath)) {
      return { exclude: true, reason: "Sensitive credential or configuration file." };
    }

    // 2. Binary extension check
    if (this.isBinaryFile(relativePath)) {
      return { exclude: true, reason: "Binary non-text file." };
    }

    // 3. Ignored directory segment check
    const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
    const segments = normalized.split("/");
    for (const seg of segments.slice(0, -1)) {
      if (this.isIgnoredDirectory(seg)) {
        return { exclude: true, reason: `Inside ignored directory '${seg}'.` };
      }
    }

    // 4. Lockfile check
    if (!options.allowLockfiles && this.isLockfile(segments[segments.length - 1])) {
      return { exclude: true, reason: "Generated package lockfile." };
    }

    // 5. Size check
    if (options.fileSizeBytes && this.isOversized(options.fileSizeBytes)) {
      return { exclude: true, reason: "File exceeds 1 MB size limit." };
    }

    // 6. Custom gitignore / kairoignore pattern match
    for (const pattern of this.customIgnorePatterns) {
      if (normalized === pattern || normalized.endsWith("/" + pattern) || normalized.includes(pattern)) {
        return { exclude: true, reason: `Matched ignore rule '${pattern}'.` };
      }
    }

    return { exclude: false };
  }
}
