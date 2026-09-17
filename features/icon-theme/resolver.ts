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
  const { name, isDirectory = false, isExpanded = false } = options;

  if (!name) {
    return isDirectory
      ? isExpanded
        ? theme.defaultFolderExpanded
        : theme.defaultFolder
      : theme.defaultFile;
  }

  // Extract base name in case a full or relative path was passed
  const baseName = name.replace(/^.*[\\/]/, "").trim();
  const lowerName = baseName.toLowerCase();

  // Cache lookup
  const cacheKey = `${theme.id}:${isDirectory ? "dir" : "file"}:${isExpanded ? "open" : "closed"}:${lowerName}`;
  const cached = iconResolutionCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  let resolved: IconDefinition;

  if (isDirectory) {
    if (isExpanded) {
      resolved =
        theme.folderExpandedNames[lowerName] ??
        theme.folderNames[lowerName] ??
        theme.defaultFolderExpanded;
    } else {
      resolved =
        theme.folderNames[lowerName] ??
        theme.defaultFolder;
    }
  } else {
    // 1. Exact filename match
    if (theme.exactFiles[lowerName]) {
      resolved = theme.exactFiles[lowerName];
    } else {
      // 2. Pattern matching
      let patternMatch: IconDefinition | undefined;
      for (const rule of theme.filePatterns) {
        if (rule.pattern.test(lowerName)) {
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
          extMatch = theme.fileExtensions[multiExt];
        }

        if (!extMatch && parts.length > 1) {
          const singleExt = parts[parts.length - 1];
          extMatch = theme.fileExtensions[singleExt];
        }

        resolved = extMatch ?? theme.defaultFile;
      }
    }
  }

  iconResolutionCache.set(cacheKey, resolved);
  return resolved;
}

