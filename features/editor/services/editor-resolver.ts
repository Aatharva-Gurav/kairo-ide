import { getFileExtension, isImageFile } from "@/lib/tauri-ipc";

/**
 * Supported specialized editor surfaces in Kairo IDE.
 */
export type EditorKind =
  | "monaco"
  | "markdown"
  | "image"
  | "audio"
  | "video"
  | "binary"
  | "fallback";

export interface EditorResolutionMetadata {
  isBinary?: boolean;
  isTooLarge?: boolean;
  mimeType?: string;
}

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown"]);
const AUDIO_EXTENSIONS = new Set(["mp3", "wav", "ogg", "flac", "m4a", "aac"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "mkv", "avi"]);

/**
 * Centralized editor resolver.
 * Determines which editor/viewer surface should render a given file
 * based on path, extension, MIME type, and file metadata.
 */
export function resolveEditorType(
  filePath: string,
  metadata?: EditorResolutionMetadata
): EditorKind {
  const ext = getFileExtension(filePath).toLowerCase();
  const mime = metadata?.mimeType?.toLowerCase() ?? "";

  // 1. Recognized rich media viewers take precedence for media files
  if (isImageFile(filePath) || mime.startsWith("image/")) {
    return "image";
  }
  if (AUDIO_EXTENSIONS.has(ext) || mime.startsWith("audio/")) {
    return "audio";
  }
  if (VIDEO_EXTENSIONS.has(ext) || mime.startsWith("video/")) {
    return "video";
  }

  // 2. Binary or oversized files open in the Hex Binary Viewer
  if (metadata?.isBinary || metadata?.isTooLarge) {
    return "binary";
  }

  // 3. Dedicated Markdown editor for .md and .markdown files
  if (MARKDOWN_EXTENSIONS.has(ext) || mime === "text/markdown") {
    return "markdown";
  }

  // 4. Default to Monaco Editor for all source code and text files
  return "monaco";
}
