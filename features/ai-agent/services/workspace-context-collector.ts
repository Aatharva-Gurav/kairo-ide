/**
 * Workspace Context Collector for Kairo IDE.
 *
 * Reuses existing Kairo services (Workspace, Editor, Monaco Models, Diagnostics)
 * to package a live workspace snapshot for the AI agent without duplicating
 * workspace or file explorer managers.
 */
import type { Workspace } from "@/features/workspace/types";
import type { EditorDocument } from "@/features/editor/types";
import type {
  WorkspaceContextPayload,
  ActiveDocumentContext,
  OpenDocumentContext,
  DiagnosticItem,
} from "@/lib/ai-agent/types";

export interface CollectContextOptions {
  workspace: Workspace | null;
  editorDocuments?: EditorDocument[];
  activeDocument?: EditorDocument | null;
  activeSelection?: string;
  terminalOutput?: string;
  diagnostics?: DiagnosticItem[];
  projectDependencies?: Record<string, string>;
}

export class WorkspaceContextCollector {
  /**
   * Reads Monaco markers (diagnostics/compiler errors) from the global Monaco instance if available.
   */
  public static extractMonacoDiagnostics(): DiagnosticItem[] {
    if (typeof window === "undefined") return [];

    try {
      const monaco = (window as unknown as { monaco?: { editor?: { getModelMarkers?: (filter: unknown) => unknown[] } } })
        .monaco;
      if (!monaco?.editor?.getModelMarkers) {
        return [];
      }

      const markers = monaco.editor.getModelMarkers({}) as Array<{
        resource?: { fsPath?: string; path?: string };
        message?: string;
        severity?: number;
        startLineNumber?: number;
        startColumn?: number;
        source?: string;
      }>;

      return markers.map((m) => {
        const filePath = m.resource?.fsPath || m.resource?.path || "";
        // Monaco MarkerSeverity: 8 = Error, 4 = Warning, 2 = Info, 1 = Hint
        let severity: "error" | "warning" | "info" | "hint" = "info";
        if (m.severity === 8) severity = "error";
        else if (m.severity === 4) severity = "warning";
        else if (m.severity === 1) severity = "hint";

        return {
          filePath,
          message: m.message || "",
          severity,
          line: m.startLineNumber || 1,
          column: m.startColumn || 1,
          source: m.source,
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * Collects and packages a live workspace context snapshot.
   */
  public static collect(options: CollectContextOptions): WorkspaceContextPayload | null {
    const { workspace } = options;
    if (!workspace || !workspace.rootPath) {
      return null;
    }

    // 1. Active document with unsaved editor content priority
    let activeDocContext: ActiveDocumentContext | undefined;
    if (options.activeDocument) {
      const doc = options.activeDocument;
      activeDocContext = {
        path: doc.path,
        language: doc.language,
        content: doc.content, // Active in-memory content (dirty or clean)
        isDirty: doc.isDirty,
        cursorPosition: doc.cursorPosition
          ? { line: doc.cursorPosition.lineNumber, column: doc.cursorPosition.column }
          : undefined,
        selection: options.activeSelection,
      };
    }

    // 2. Open document tabs (with unsaved contents if dirty)
    const openDocsContext: OpenDocumentContext[] = (options.editorDocuments || []).map((doc) => ({
      path: doc.path,
      title: doc.title,
      language: doc.language,
      isDirty: doc.isDirty,
      content: doc.isDirty ? doc.content : undefined, // Provide in-memory buffer if dirty
    }));

    // 3. Diagnostics
    const diagnostics =
      options.diagnostics && options.diagnostics.length > 0
        ? options.diagnostics
        : this.extractMonacoDiagnostics();

    return {
      workspaceRoot: workspace.rootPath,
      workspaceName: workspace.name,
      activeDocument: activeDocContext,
      openDocuments: openDocsContext,
      diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
      terminalOutput: options.terminalOutput,
      projectMetadata: {
        projectTypes: workspace.projectTypes,
        dependencies: options.projectDependencies,
      },
    };
  }
}
