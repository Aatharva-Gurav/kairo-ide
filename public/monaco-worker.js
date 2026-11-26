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
