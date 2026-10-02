import {
  readFileContent,
  writeFileContent,
  normalizePath,
  basename,
  FileContentResult,
} from "@/lib/tauri-ipc";
import { EditorDocument } from "../types";
import { LanguageService } from "./language.service";

export class EditorService {
  /**
   * Opens and loads a file from the filesystem.
   */
  static async loadDocument(filePath: string): Promise<EditorDocument> {
    const normPath = normalizePath(filePath);
    const title = basename(normPath);
    const language = LanguageService.detectLanguage(normPath);

    try {
      const fileData: FileContentResult = await readFileContent(normPath);

      if (fileData.isBinary) {
        return {
          id: normPath,
          path: normPath,
          title,
          language,
          content: "",
          savedContent: "",
          isDirty: false,
          isBinary: true,
          readonly: fileData.readonly,
        };
      }

      return {
        id: normPath,
        path: normPath,
        title,
        language,
        content: fileData.content,
        savedContent: fileData.content,
        isDirty: false,
        isBinary: false,
        readonly: fileData.readonly,
      };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : "Failed to read file.";
      const isLarge = msg.toLowerCase().includes("too large");

      return {
        id: normPath,
        path: normPath,
        title,
        language,
        content: "",
        savedContent: "",
        isDirty: false,
        isTooLarge: isLarge,
        error: msg,
      };
    }
  }

  /**
   * Saves document content to disk.
   */
  static async saveDocument(filePath: string, content: string): Promise<void> {
    const normPath = normalizePath(filePath);
    await writeFileContent(normPath, content);
  }

  /**
   * Saves all dirty documents concurrently, isolating failures so valid documents are not blocked.
   */
  static async saveAllDocuments(
    documents: EditorDocument[]
  ): Promise<{ saved: string[]; failed: Array<{ path: string; error: string }> }> {
    const dirtyDocs = documents.filter((doc) => doc.isDirty && !doc.isBinary && !doc.readonly);
    const saved: string[] = [];
    const failed: Array<{ path: string; error: string }> = [];

    await Promise.all(
      dirtyDocs.map(async (doc) => {
        try {
          await this.saveDocument(doc.path, doc.content);
          saved.push(doc.path);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Save failed";
          failed.push({ path: doc.path, error: msg });
        }
      })
    );

    return { saved, failed };
  }
}

