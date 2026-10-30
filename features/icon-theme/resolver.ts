import { IconDefinition, IconResolveOptions, IconTheme } from "./types";
import { defaultTheme } from "./themes";

const iconResolutionCache = new Map<string, IconDefinition>();

/**
 * Clear the resolution cache (useful for testing or dynamic theme changes)
 */
export function clearIconCache(): void {
  iconResolutionCache.clear();
}

/**
 * Resolves an icon definition for a file or folder given its name and directory state.
 * Resolution Priority:
 * 1. Directory:
 *    a. Expanded folder name match
 *    b. Closed folder name match
 *    c. Expanded / closed default folder fallback
 * 2. File:
 *    a. Exact filename match (case-insensitive)
 *    b. Filename pattern match (regex)
 *    c. Multi-part extension match (e.g., .d.ts)
 *    d. Standard extension match (.ts, .tsx, .json)
 *    e. Default file fallback
 */
export function resolveIcon(
  options: IconResolveOptions,
  theme: IconTheme = defaultTheme
): IconDefinition {
  const currentTheme = theme || defaultTheme;
  const { name, isDirectory = false, isExpanded = false } = options || {};

  if (!name || typeof name !== "string") {
    return isDirectory
      ? isExpanded
        ? currentTheme.defaultFolderExpanded
        : currentTheme.defaultFolder
      : currentTheme.defaultFile;
  }

  // Extract base name in case a full or relative path was passed
  const baseName = name.replace(/^.*[\\/]/, "").trim();
  const lowerName = baseName.toLowerCase();

  // Cache lookup
  const cacheKey = `${currentTheme.id}:${isDirectory ? "dir" : "file"}:${isExpanded ? "open" : "closed"}:${lowerName}`;
  const cached = iconResolutionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Keep cache bounded to prevent memory leaks in large workspaces
  if (iconResolutionCache.size > 2000) {
    iconResolutionCache.clear();
  }

  let resolved: IconDefinition;

  if (isDirectory) {
    if (isExpanded) {
      resolved =
        currentTheme.folderExpandedNames?.[lowerName] ??
        currentTheme.folderNames?.[lowerName] ??
        currentTheme.defaultFolderExpanded;
    } else {
      resolved =
        currentTheme.folderNames?.[lowerName] ??
        currentTheme.defaultFolder;
    }
  } else {
    // 1. Exact filename match
    if (currentTheme.exactFiles?.[lowerName]) {
      resolved = currentTheme.exactFiles[lowerName];
    } else {
      // 2. Pattern matching
      let patternMatch: IconDefinition | undefined;
      const patterns = currentTheme.filePatterns || [];
      for (const rule of patterns) {
        if (rule?.pattern && rule.pattern.test(lowerName)) {
          patternMatch = rule.icon;
          break;
        }
      }

      if (patternMatch) {
        resolved = patternMatch;
      } else {
        // 3. Extension matching
        const parts = lowerName.split(".");
        let extMatch: IconDefinition | undefined;

        if (parts.length > 2) {
          // Check multi-part extension first (e.g., "d.ts")
          const multiExt = parts.slice(-2).join(".");
          extMatch = currentTheme.fileExtensions?.[multiExt];
        }

        if (!extMatch && parts.length > 1) {
          const singleExt = parts[parts.length - 1];
          extMatch = currentTheme.fileExtensions?.[singleExt];
        }

        resolved = extMatch ?? currentTheme.defaultFile;
      }
    }
  }

  iconResolutionCache.set(cacheKey, resolved);
  return resolved;
}
