/**
 * Offline Monaco Web Worker replacement.
 *
 * Monaco's editor-worker features (unicode highlighting, section headers,
 * word-based suggestions, links, default document colors, diffs) dispatch
 * over the SimpleWorker protocol to `esm/vs/editor/common/services/editorWebWorker.js`.
 * Bundling the real Monaco workers is not supported by the static-export +
 * Turbopack build, so this module installs a protocol-compliant worker stub.
 *
 * Every request is answered with the same empty-result shape the real
 * `EditorWorker` returns when its synced model is unavailable. The response
 * shape matters: callers dereference specific properties (e.g.
 * `DocumentUnicodeHighlighter` reads `info.hasMore`,
 * `SectionHeaders.updateDecorations` calls `sectionHeaders.filter(...)`),
 * so replying `null` for an unknown method produces unhandled rejections
 * such as "Cannot read properties of null (reading 'hasMore')".
 *
 * Language-service requests from the TypeScript/JSON/CSS/HTML workers are
 * dispatched via the `$fmr` (foreign module request) wrapper and are handled
 * with equivalent empty defaults.
 */

const MONACO_WORKER_SCRIPT = String.raw`
self.onmessage = function (e) {
  var data = e && e.data;
  if (!data || data.type !== 0) return;

  var method = data.method;
  var args = data.args || [];
  if (method === "$fmr" && Array.isArray(args) && typeof args[0] === "string") {
    method = args[0];
    args = args[1] || [];
  }

  var res = null;

  if (
    method === "$acceptNewModel" ||
    method === "$acceptModelChanged" ||
    method === "$acceptRemovedModel"
  ) {
    // Model-sync messages are fire-and-forget; reply to release the pending request.
    res = null;
  } else if (method === "$ping") {
    res = "pong";
  } else if (method === "$computeUnicodeHighlights") {
    res = {
      ranges: [],
      hasMore: false,
      ambiguousCharacterCount: 0,
      invisibleCharacterCount: 0,
      nonBasicAsciiCharacterCount: 0,
    };
  } else if (
    method === "$findSectionHeaders" ||
    method === "$computeLinks" ||
    method === "$computeDefaultDocumentColors"
  ) {
    res = [];
  } else if (method === "$textualSuggest") {
    res = { words: [], duration: 0 };
  } else if (method === "$computeWordRanges") {
    res = {};
  } else if (method === "$computeDiff") {
    res = { identical: true, quitEarly: false, changes: [], moves: [] };
  } else if (method === "$computeMoreMinimalEdits") {
    res = Array.isArray(args) ? args[1] || [] : [];
  } else if (
    method === "getSyntacticDiagnostics" ||
    method === "getSemanticDiagnostics" ||
    method === "getSuggestionDiagnostics" ||
    method === "getCompilerOptionsDiagnostics" ||
    method === "provideInlayHints" ||
    method === "getCodeFixesAtPosition" ||
    method === "findRenameLocations" ||
    method === "getDefinitionAtPosition" ||
    method === "getReferencesAtPosition" ||
    method === "getDocumentHighlights" ||
    method === "getFormattingEditsForRange" ||
    method === "getFormattingEditsForDocument" ||
    method === "getFormattingEditsAfterKeystroke" ||
    method === "doValidation" ||
    method === "findDocumentSymbols" ||
    method === "findDocumentColors" ||
    method === "getColorPresentations" ||
    method === "getFoldingRanges" ||
    method === "getSelectionRanges" ||
    method === "findDocumentHighlights" ||
    method === "findDefinition" ||
    method === "findReferences" ||
    method === "findDocumentLinks"
  ) {
    res = [];
  } else if (method === "getRenameInfo") {
    res = { canRename: false, localizedErrorMessage: "Rename is not supported." };
  }

  self.postMessage({ vsWorker: data.vsWorker, seq: data.req, type: 1, res: res });
};
`;

interface MonacoEnvironmentStub {
  getWorker: (moduleId: unknown, label: string) => Worker;
}

/**
 * Registers the worker stub under `window.MonacoEnvironment`.
 * Kept idempotent: the first caller wins so Monaco never spawns workers
 * with different behavior mid-session.
 */
export function installMonacoWorkerStub(): void {
  if (typeof window === "undefined") return;

  const globalObj = window as unknown as { MonacoEnvironment?: MonacoEnvironmentStub };
  if (globalObj.MonacoEnvironment) return;

  globalObj.MonacoEnvironment = {
    getWorker: () => {
      const workerBlob = new Blob([MONACO_WORKER_SCRIPT], { type: "application/javascript" });
      return new Worker(URL.createObjectURL(workerBlob));
    },
  };
}
