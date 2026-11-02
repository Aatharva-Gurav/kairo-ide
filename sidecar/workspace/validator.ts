import path from "node:path";
import { SidecarError, ERROR_CODES } from "../server/error";

export function validatePathInWorkspace(
  targetPath: string,
  workspaceRoot: string
): string {
  if (!workspaceRoot) {
    throw new SidecarError(
      ERROR_CODES.ERR_INVALID_CONFIG,
      "Workspace root is not configured"
    );
  }

  const resolvedRoot = path.resolve(workspaceRoot);
  const resolvedTarget = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(resolvedRoot, targetPath);

  const relative = path.relative(resolvedRoot, resolvedTarget);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new SidecarError(
      ERROR_CODES.ERR_UNAUTHORIZED,
      `Access denied: path "${targetPath}" escapes workspace root`
    );
  }

  return resolvedTarget;
}
