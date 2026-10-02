/**
 * IntelliSense & Autocomplete Service for Monaco Editor.
 * Configures language defaults, compiler options, and code snippets.
 */

let isConfigured = false;

export interface CustomSnippet {
  label: string;
  detail: string;
  documentation: string;
  insertText: string;
  languages: string[];
}

export const BUILTIN_SNIPPETS: CustomSnippet[] = [
  {
    label: "rfc",
    detail: "React Functional Component",
    documentation: "Creates a typed React functional component",
    insertText: [
      "import React from 'react';",
      "",
      "interface ${1:ComponentName}Props {",
      "  $0",
      "}",
      "",
      "export function ${1:ComponentName}({ }: ${1:ComponentName}Props) {",
      "  return (",
      "    <div>",
      "      ${1:ComponentName}",
      "    </div>",
      "  );",
      "}",
    ].join("\n"),
    languages: ["typescript", "javascript"],
  },
  {
    label: "uses",
    detail: "useState Hook",
    documentation: "Declares a React state hook variable",
    insertText: "const [${1:state}, set${1/(.*)/${1:/capitalize}/}] = React.useState(${2:initialValue});",
    languages: ["typescript", "javascript"],
  },
  {
    label: "usee",
    detail: "useEffect Hook",
    documentation: "Declares a React side-effect hook",
    insertText: [
      "React.useEffect(() => {",
      "  $0",
      "  return () => {",
      "    ",
      "  };",
      "}, [${1:deps}]);",
    ].join("\n"),
    languages: ["typescript", "javascript"],
  },
  {
    label: "clg",
    detail: "console.log",
    documentation: "Logs output to console",
    insertText: "console.log('${1:label}:', ${1:label});$0",
    languages: ["typescript", "javascript", "rust", "python"],
  },
  {
    label: "trycatch",
    detail: "try / catch block",
    documentation: "Catches asynchronous or runtime exceptions",
    insertText: [
      "try {",
      "  $0",
      "} catch (error) {",
      "  console.error('${1:Error message}:', error);",
      "}",
    ].join("\n"),
    languages: ["typescript", "javascript"],
  },
];

export class IntelliSenseService {
  private static registeredSnippets: CustomSnippet[] = [...BUILTIN_SNIPPETS];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static init(monaco: any) {
    if (!monaco || isConfigured) return;
    isConfigured = true;

    this.configureTypeScriptDefaults(monaco);
    this.registerSnippets(monaco);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static configureTypeScriptDefaults(monaco: any) {
    if (!monaco.languages?.typescript) return;

    const { typescriptDefaults, javascriptDefaults, ModuleResolutionKind, JsxEmit } =
      monaco.languages.typescript;

    const compilerOptions = {
      target: monaco.languages.typescript.ScriptTarget?.ES2022 ?? 99,
      allowNonTextExtensions: true,
      allowJs: true,
      noEmit: true,
      moduleResolution: ModuleResolutionKind?.NodeJs ?? 2,
      module: monaco.languages.typescript.ModuleKind?.CommonJS ?? 1,
      typeRoots: ["node_modules/@types"],
      jsx: JsxEmit?.ReactJSX ?? 4,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
    };

    typescriptDefaults?.setCompilerOptions(compilerOptions);
    javascriptDefaults?.setCompilerOptions(compilerOptions);

    typescriptDefaults?.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });

    javascriptDefaults?.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static registerSnippets(monaco: any) {
    if (!monaco.languages?.registerCompletionItemProvider) return;

    const languages = ["typescript", "javascript"];

    for (const lang of languages) {
      monaco.languages.registerCompletionItemProvider(lang, {
        provideCompletionItems: (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          _model: any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          position: any
        ) => {
          const word = _model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions = this.registeredSnippets
            .filter((s) => s.languages.includes(lang))
            .map((s) => ({
              label: s.label,
              kind: monaco.languages.CompletionItemKind.Snippet,
              documentation: s.documentation,
              detail: s.detail,
              insertText: s.insertText,
              insertTextRules:
                monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range,
            }));

          return { suggestions };
        },
      });
    }
  }

  static addSnippet(snippet: CustomSnippet) {
    this.registeredSnippets.push(snippet);
  }
}

