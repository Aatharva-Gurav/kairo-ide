/**
 * IntelliSense & Autocomplete Service for Monaco Editor.
 * Configures language defaults, compiler options, and code suggestions for all languages.
 */

export interface CustomSnippet {
  label: string;
  detail: string;
  documentation: string;
  insertText: string;
  languages: string[];
}

export interface SuggestionItem {
  label: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kind: any;
  detail: string;
  documentation: string;
  insertText: string;
  isSnippet?: boolean;
}

export const ALL_SUPPORTED_LANGUAGES = [
  "typescript",
  "javascript",
  "html",
  "css",
  "scss",
  "less",
  "json",
  "yaml",
  "toml",
  "xml",
  "markdown",
  "rust",
  "python",
  "go",
  "java",
  "c",
  "cpp",
  "csharp",
  "php",
  "ruby",
  "swift",
  "kotlin",
  "dart",
  "lua",
  "r",
  "shell",
  "powershell",
  "bat",
  "sql",
  "graphql",
  "dockerfile",
  "makefile",
  "ini",
  "plaintext",
];

export const BUILTIN_SNIPPETS: CustomSnippet[] = [
  // TypeScript & JavaScript
  {
    label: "rfc",
    detail: "React Functional Component",
    documentation: "Creates a typed React functional component with props",
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
    insertText: "const [${1:state}, set${1/(.*)/${1:/capitalize}/}] = React.useState(${2:initialValue});$0",
    languages: ["typescript", "javascript"],
  },
  {
    label: "usee",
    detail: "useEffect Hook",
    documentation: "Declares a React side-effect hook with dependency array",
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
    label: "usem",
    detail: "useMemo Hook",
    documentation: "Memoizes a computed value",
    insertText: "const ${1:memoizedValue} = React.useMemo(() => {\n  return ${2:compute()};\n}, [${3:deps}]);$0",
    languages: ["typescript", "javascript"],
  },
  {
    label: "usec",
    detail: "useCallback Hook",
    documentation: "Memoizes a callback function reference",
    insertText: "const ${1:memoizedCallback} = React.useCallback((${2:params}) => {\n  $0\n}, [${3:deps}]);",
    languages: ["typescript", "javascript"],
  },
  {
    label: "clg",
    detail: "console.log",
    documentation: "Logs values to console output",
    insertText: "console.log('${1:label}:', ${1:label});$0",
    languages: ["typescript", "javascript"],
  },
  {
    label: "cle",
    detail: "console.error",
    documentation: "Logs error message to console",
    insertText: "console.error('${1:Error}:', ${2:error});$0",
    languages: ["typescript", "javascript"],
  },
  {
    label: "trycatch",
    detail: "try / catch block",
    documentation: "Catches runtime exceptions with error handling",
    insertText: [
      "try {",
      "  $0",
      "} catch (error) {",
      "  console.error('${1:Error in operation}:', error);",
      "}",
    ].join("\n"),
    languages: ["typescript", "javascript"],
  },
  {
    label: "afn",
    detail: "Arrow function",
    documentation: "Creates an arrow function expression",
    insertText: "const ${1:name} = (${2:params}) => {\n  $0\n};",
    languages: ["typescript", "javascript"],
  },
  {
    label: "asyncfn",
    detail: "Async function",
    documentation: "Creates an async function expression",
    insertText: "async function ${1:name}(${2:params}): Promise<${3:void}> {\n  $0\n}",
    languages: ["typescript", "javascript"],
  },

  // Python
  {
    label: "def",
    detail: "def function",
    documentation: "Defines a Python function with docstring",
    insertText: "def ${1:function_name}(${2:params}):\n    \"\"\"${3:Docstring for $1}\"\"\"\n    $0",
    languages: ["python"],
  },
  {
    label: "adef",
    detail: "async def function",
    documentation: "Defines an asynchronous Python coroutine function",
    insertText: "async def ${1:function_name}(${2:params}):\n    \"\"\"${3:Docstring for $1}\"\"\"\n    $0",
    languages: ["python"],
  },
  {
    label: "class",
    detail: "class definition",
    documentation: "Defines a Python class with constructor",
    insertText: "class ${1:ClassName}:\n    \"\"\"${2:Class docstring}\"\"\"\n    def __init__(self, ${3:args}):\n        $0",
    languages: ["python"],
  },
  {
    label: "main",
    detail: "if __name__ == '__main__':",
    documentation: "Standard Python script entrypoint block",
    insertText: "if __name__ == '__main__':\n    ${1:main()}$0",
    languages: ["python"],
  },
  {
    label: "try",
    detail: "try / except block",
    documentation: "Handles Python exceptions gracefully",
    insertText: "try:\n    $1\nexcept ${2:Exception} as ${3:e}:\n    ${4:print(f\"Error: {e}\")}$0",
    languages: ["python"],
  },
  {
    label: "with",
    detail: "with open(...) as f:",
    documentation: "Opens and processes a file resource with context manager",
    insertText: "with open(${1:'filename.txt'}, '${2:r}', encoding='${3:utf-8}') as ${4:f}:\n    ${5:content = f.read()}$0",
    languages: ["python"],
  },

  // Rust
  {
    label: "fn",
    detail: "fn name()",
    documentation: "Defines a Rust function",
    insertText: "fn ${1:name}(${2:params}) -> ${3:Result<(), Box<dyn std::error::Error>>} {\n    $0\n}",
    languages: ["rust"],
  },
  {
    label: "struct",
    detail: "pub struct",
    documentation: "Defines a public Rust struct with derive attributes",
    insertText: "#[derive(Debug, Clone)]\npub struct ${1:Name} {\n    pub ${2:field}: ${3:String},\n}$0",
    languages: ["rust"],
  },
  {
    label: "enum",
    detail: "pub enum",
    documentation: "Defines a public Rust enum",
    insertText: "#[derive(Debug, Clone, PartialEq)]\npub enum ${1:Name} {\n    ${2:Variant},\n}$0",
    languages: ["rust"],
  },
  {
    label: "impl",
    detail: "impl Struct",
    documentation: "Implements methods for a Rust type",
    insertText: "impl ${1:Type} {\n    pub fn new(${2:params}) -> Self {\n        Self {\n            $0\n        }\n    }\n}",
    languages: ["rust"],
  },
  {
    label: "test",
    detail: "Rust unit test",
    documentation: "Defines a unit test module function",
    insertText: "#[test]\nfn test_${1:feature}() {\n    assert_eq!(${2:actual}, ${3:expected});$0\n}",
    languages: ["rust"],
  },

  // Go
  {
    label: "fn",
    detail: "func name()",
    documentation: "Defines a Go function",
    insertText: "func ${1:name}(${2:params}) ${3:error} {\n\t$0\n\treturn nil\n}",
    languages: ["go"],
  },
  {
    label: "main",
    detail: "package main / func main()",
    documentation: "Executable Go package entrypoint",
    insertText: "package main\n\nimport (\n\t\"fmt\"\n)\n\nfunc main() {\n\tfmt.Println(\"${1:Hello, Kairo!}\")$0\n}",
    languages: ["go"],
  },
  {
    label: "iferr",
    detail: "if err != nil",
    documentation: "Standard Go error check and handling",
    insertText: "if err != nil {\n\treturn ${1:nil, err}$0\n}",
    languages: ["go"],
  },
  {
    label: "struct",
    detail: "type Struct struct",
    documentation: "Defines a Go struct type with json tags",
    insertText: "type ${1:Name} struct {\n\t${2:Field} ${3:string} `json:\"${4:field}\"`$0\n}",
    languages: ["go"],
  },

  // HTML
  {
    label: "html5",
    detail: "HTML5 Boilerplate",
    documentation: "Complete HTML5 page structure with meta tags",
    insertText: [
      "<!DOCTYPE html>",
      "<html lang=\"en\">",
      "<head>",
      "  <meta charset=\"UTF-8\" />",
      "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />",
      "  <title>${1:Document}</title>",
      "</head>",
      "<body>",
      "  $0",
      "</body>",
      "</html>",
    ].join("\n"),
    languages: ["html"],
  },
  {
    label: "div",
    detail: "<div class=\"...\">",
    documentation: "HTML division element container",
    insertText: "<div className=\"${1:container}\">\n  $0\n</div>",
    languages: ["html"],
  },
  {
    label: "btn",
    detail: "<button>",
    documentation: "HTML button element",
    insertText: "<button type=\"${1:button}\" class=\"${2:btn}\">\n  ${3:Click me}\n</button>$0",
    languages: ["html"],
  },

  // CSS / SCSS
  {
    label: "flexcenter",
    detail: "Flexbox Centering",
    documentation: "Centers child elements vertically and horizontally",
    insertText: "display: flex;\nalign-items: center;\njustify-content: center;$0",
    languages: ["css", "scss", "less"],
  },
  {
    label: "gridauto",
    detail: "Responsive Grid Layout",
    documentation: "Auto-fit responsive grid columns template",
    insertText: "display: grid;\ngrid-template-columns: repeat(auto-fit, minmax(${1:240px}, 1fr));\ngap: ${2:1rem};$0",
    languages: ["css", "scss", "less"],
  },
  {
    label: "mq",
    detail: "@media query",
    documentation: "Responsive CSS media query breakpoint",
    insertText: "@media (max-width: ${1:768px}) {\n  $0\n}",
    languages: ["css", "scss", "less"],
  },

  // C / C++
  {
    label: "main",
    detail: "int main()",
    documentation: "C/C++ main entrypoint function",
    insertText: "#include <iostream>\n\nint main(int argc, char* argv[]) {\n    std::cout << \"${1:Hello, World!}\" << std::endl;\n    $0\n    return 0;\n}",
    languages: ["c", "cpp"],
  },
  {
    label: "inc",
    detail: "#include <...>",
    documentation: "Standard library include header",
    insertText: "#include <${1:iostream}>$0",
    languages: ["c", "cpp"],
  },

  // Java
  {
    label: "main",
    detail: "public static void main",
    documentation: "Java application main entrypoint",
    insertText: "public static void main(String[] args) {\n    System.out.println(\"${1:Hello, World!}\");$0\n}",
    languages: ["java"],
  },
  {
    label: "sout",
    detail: "System.out.println",
    documentation: "Prints output line to stdout",
    insertText: "System.out.println(${1:\"message\"});$0",
    languages: ["java"],
  },

  // C#
  {
    label: "cw",
    detail: "Console.WriteLine",
    documentation: "Writes a line of text to console output",
    insertText: "Console.WriteLine(${1:\"message\"});$0",
    languages: ["csharp"],
  },
  {
    label: "prop",
    detail: "Auto-implemented Property",
    documentation: "Defines a C# auto property with getter and setter",
    insertText: "public ${1:string} ${2:PropertyName} { get; set; }$0",
    languages: ["csharp"],
  },

  // SQL
  {
    label: "select",
    detail: "SELECT query",
    documentation: "Selects columns from a table with where filter",
    insertText: "SELECT ${1:*}\nFROM ${2:table_name}\nWHERE ${3:condition}\nORDER BY ${4:id} DESC;$0",
    languages: ["sql"],
  },
  {
    label: "insert",
    detail: "INSERT INTO",
    documentation: "Inserts a new record into a table",
    insertText: "INSERT INTO ${1:table_name} (${2:columns})\nVALUES (${3:values});$0",
    languages: ["sql"],
  },
  {
    label: "createtable",
    detail: "CREATE TABLE",
    documentation: "Creates a new relational table schema",
    insertText: "CREATE TABLE ${1:table_name} (\n    id SERIAL PRIMARY KEY,\n    ${2:name} VARCHAR(255) NOT NULL,\n    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP\n);$0",
    languages: ["sql"],
  },

  // Dockerfile
  {
    label: "node-docker",
    detail: "Node.js Dockerfile",
    documentation: "Multi-stage production build for Node.js / Next.js",
    insertText: [
      "FROM node:20-alpine AS base",
      "WORKDIR /app",
      "COPY package*.json ./",
      "RUN npm ci",
      "COPY . .",
      "RUN npm run build",
      "EXPOSE 3000",
      "CMD [\"npm\", \"start\"]",
    ].join("\n"),
    languages: ["dockerfile"],
  },

  // Shell / Bash
  {
    label: "shebang",
    detail: "#!/usr/bin/env bash",
    documentation: "Safe bash script header with strict error checking",
    insertText: "#!/usr/bin/env bash\nset -euo pipefail\n\n$0",
    languages: ["shell"],
  },

  // Markdown
  {
    label: "table",
    detail: "Markdown Table",
    documentation: "Generates a structured markdown table",
    insertText: "| ${1:Header 1} | ${2:Header 2} |\n| :--- | :--- |\n| ${3:Row 1} | ${4:Value 1} |$0",
    languages: ["markdown"],
  },
];

// Rich language keyword & standard symbol catalog for instant autocompletion
export const LANGUAGE_KEYWORDS: Record<string, { keywords: string[]; functions: string[] }> = {
  python: {
    keywords: [
      "def", "class", "import", "from", "if", "elif", "else", "while", "for", "in",
      "try", "except", "finally", "with", "as", "lambda", "yield", "return", "pass",
      "break", "continue", "async", "await", "global", "nonlocal", "assert", "raise",
      "is", "not", "and", "or", "True", "False", "None",
    ],
    functions: [
      "print", "len", "range", "enumerate", "zip", "isinstance", "issubclass", "map",
      "filter", "sorted", "reversed", "open", "input", "str", "int", "float", "bool",
      "list", "dict", "set", "tuple", "super", "self", "type", "hasattr", "getattr",
      "setattr", "any", "all", "min", "max", "sum", "abs", "round",
    ],
  },
  rust: {
    keywords: [
      "fn", "let", "mut", "pub", "struct", "enum", "impl", "trait", "type", "match",
      "if", "else", "for", "while", "loop", "break", "continue", "return", "async",
      "await", "use", "mod", "as", "const", "static", "where", "unsafe", "crate",
      "super", "self", "Self", "dyn", "ref", "move", "true", "false",
    ],
    functions: [
      "println!", "eprintln!", "format!", "panic!", "vec!", "todo!", "unimplemented!",
      "Vec", "String", "Option", "Result", "Some", "None", "Ok", "Err", "Box", "Rc",
      "Arc", "Mutex", "Default", "Clone", "Copy", "Debug", "PartialEq", "Eq",
    ],
  },
  go: {
    keywords: [
      "func", "package", "import", "type", "struct", "interface", "var", "const",
      "return", "if", "else", "for", "range", "switch", "case", "default", "select",
      "go", "defer", "chan", "map", "break", "continue", "fallthrough", "true", "false", "nil",
    ],
    functions: [
      "fmt.Println", "fmt.Printf", "fmt.Sprintf", "fmt.Errorf", "log.Println", "make",
      "new", "append", "len", "cap", "panic", "recover", "close", "copy", "delete",
      "string", "int", "int64", "float64", "bool", "byte", "rune", "error",
    ],
  },
  html: {
    keywords: [
      "doctype", "html", "head", "title", "body", "div", "span", "p", "a", "button",
      "input", "form", "label", "select", "option", "textarea", "header", "nav",
      "main", "section", "article", "footer", "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "table", "tr", "td", "th", "img", "svg", "video", "audio",
      "link", "meta", "script", "style",
    ],
    functions: [
      "class", "id", "href", "src", "alt", "type", "value", "placeholder", "name",
      "target", "rel", "onclick", "disabled", "required", "style", "width", "height",
    ],
  },
  css: {
    keywords: [
      "display", "flex", "grid", "position", "relative", "absolute", "fixed", "sticky",
      "top", "right", "bottom", "left", "z-index", "width", "height", "min-width",
      "max-width", "margin", "padding", "background", "background-color", "color",
      "font-size", "font-weight", "font-family", "line-height", "text-align",
      "border", "border-radius", "box-shadow", "opacity", "overflow", "cursor",
      "transition", "transform", "animation", "backdrop-filter", "gap", "justify-content",
      "align-items", "flex-direction", "flex-wrap", "grid-template-columns",
    ],
    functions: [
      "calc", "var", "rgb", "rgba", "hsl", "oklch", "linear-gradient", "radial-gradient",
      "url", "min", "max", "clamp", "translate", "scale", "rotate",
    ],
  },
  sql: {
    keywords: [
      "SELECT", "FROM", "WHERE", "INSERT INTO", "VALUES", "UPDATE", "SET", "DELETE FROM",
      "INNER JOIN", "LEFT JOIN", "RIGHT JOIN", "FULL JOIN", "ON", "GROUP BY", "HAVING",
      "ORDER BY", "ASC", "DESC", "LIMIT", "OFFSET", "UNION", "CREATE TABLE", "ALTER TABLE",
      "DROP TABLE", "PRIMARY KEY", "FOREIGN KEY", "NOT NULL", "DEFAULT", "DISTINCT",
      "AS", "AND", "OR", "IN", "NOT IN", "BETWEEN", "LIKE", "IS NULL", "IS NOT NULL",
    ],
    functions: [
      "COUNT", "SUM", "AVG", "MIN", "MAX", "COALESCE", "NOW", "DATE", "CONCAT",
      "LOWER", "UPPER", "ROUND", "CAST", "EXISTS", "CASE", "WHEN", "THEN", "ELSE",
    ],
  },
  c: {
    keywords: [
      "int", "char", "float", "double", "void", "short", "long", "signed", "unsigned",
      "const", "static", "struct", "union", "enum", "typedef", "sizeof", "return",
      "if", "else", "for", "while", "do", "switch", "case", "default", "break",
      "continue", "goto", "#include", "#define", "#ifdef", "#ifndef", "#endif",
    ],
    functions: [
      "printf", "scanf", "malloc", "calloc", "realloc", "free", "exit", "strlen",
      "strcpy", "strcmp", "memcpy", "memset", "fopen", "fclose", "fread", "fwrite",
    ],
  },
  cpp: {
    keywords: [
      "class", "public", "private", "protected", "virtual", "override", "template",
      "typename", "namespace", "using", "constexpr", "nullptr", "new", "delete",
      "try", "catch", "throw", "auto", "std", "decltype", "noexcept", "friend",
    ],
    functions: [
      "std::cout", "std::cin", "std::endl", "std::vector", "std::string", "std::map",
      "std::unique_ptr", "std::shared_ptr", "std::make_unique", "std::make_shared",
      "std::sort", "std::find", "std::move",
    ],
  },
  java: {
    keywords: [
      "public", "private", "protected", "class", "interface", "extends", "implements",
      "static", "final", "abstract", "void", "int", "boolean", "double", "String",
      "new", "return", "if", "else", "for", "while", "switch", "case", "try", "catch",
      "finally", "throw", "throws", "import", "package", "this", "super", "instanceof",
    ],
    functions: [
      "System.out.println", "System.err.println", "List", "ArrayList", "Map", "HashMap",
      "Set", "HashSet", "Optional", "Arrays.asList", "Collections.sort", "Objects.requireNonNull",
    ],
  },
  csharp: {
    keywords: [
      "namespace", "using", "public", "private", "protected", "internal", "class",
      "interface", "record", "struct", "async", "await", "Task", "var", "string",
      "int", "bool", "void", "return", "if", "else", "foreach", "while", "switch",
      "try", "catch", "finally", "throw", "new", "get", "set", "init", "override",
    ],
    functions: [
      "Console.WriteLine", "Console.ReadLine", "string.IsNullOrEmpty", "string.Format",
      "List", "Dictionary", "Task.FromResult", "Task.Run", "Enumerable.Where", "Enumerable.Select",
    ],
  },
  dockerfile: {
    keywords: [
      "FROM", "WORKDIR", "COPY", "ADD", "RUN", "CMD", "ENTRYPOINT", "ENV", "ARG",
      "EXPOSE", "VOLUME", "USER", "LABEL", "HEALTHCHECK", "SHELL", "STOPSIGNAL",
    ],
    functions: ["as", "alpine", "latest", "node", "python", "golang", "rust", "ubuntu"],
  },
  shell: {
    keywords: [
      "if", "then", "elif", "else", "fi", "for", "in", "do", "done", "while", "until",
      "case", "esac", "function", "return", "exit", "echo", "printf", "read", "export",
      "source", "local", "alias", "shift", "trap",
    ],
    functions: [
      "grep", "sed", "awk", "find", "cat", "curl", "wget", "chmod", "chown", "mkdir",
      "rm", "cp", "mv", "touch", "ls", "tar", "git",
    ],
  },
};

export class IntelliSenseService {
  private static isConfigured = false;
  private static registeredLanguages = new Set<string>();
  private static registeredSnippets: CustomSnippet[] = [...BUILTIN_SNIPPETS];

  static resetForTesting() {
    this.isConfigured = false;
    this.registeredLanguages.clear();
    this.registeredSnippets = [...BUILTIN_SNIPPETS];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static init(monaco: any) {
    if (!monaco) return;

    if (!this.isConfigured) {
      this.isConfigured = true;
      this.configureTypeScriptDefaults(monaco);
    }

    // Register completions for all supported languages
    for (const lang of ALL_SUPPORTED_LANGUAGES) {
      this.registerLanguageProvider(monaco, lang);
    }
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
  static registerLanguageProvider(monaco: any, language: string) {
    if (!monaco.languages?.registerCompletionItemProvider) return;
    if (this.registeredLanguages.has(language)) return;
    this.registeredLanguages.add(language);

    const triggerCharacters = [".", ":", '"', "'", "/", "<", "@", "$", "#", "-", ">", "*", "~", "`", "_"];

    monaco.languages.registerCompletionItemProvider(language, {
      triggerCharacters,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      provideCompletionItems: (model: any, position: any) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const currentWord = word.word.toLowerCase();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const suggestions: any[] = [];
        const seenLabels = new Set<string>();

        // 1. Language Snippets
        const matchingSnippets = this.registeredSnippets.filter(
          (s) => s.languages.includes(language) || s.languages.includes("*")
        );

        for (const snippet of matchingSnippets) {
          if (!seenLabels.has(snippet.label)) {
            seenLabels.add(snippet.label);
            suggestions.push({
              label: snippet.label,
              kind: monaco.languages.CompletionItemKind.Snippet,
              detail: snippet.detail,
              documentation: snippet.documentation,
              insertText: snippet.insertText,
              insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
              range,
              sortText: "0_" + snippet.label,
            });
          }
        }

        // 2. Language Keywords & Standard Functions
        const langData = LANGUAGE_KEYWORDS[language];
        if (langData) {
          if (langData.keywords) {
            for (const kw of langData.keywords) {
              if (!seenLabels.has(kw)) {
                seenLabels.add(kw);
                suggestions.push({
                  label: kw,
                  kind: monaco.languages.CompletionItemKind.Keyword,
                  detail: "(keyword)",
                  documentation: `Language keyword \`${kw}\``,
                  insertText: kw,
                  range,
                  sortText: "1_" + kw,
                });
              }
            }
          }

          if (langData.functions) {
            for (const fn of langData.functions) {
              if (!seenLabels.has(fn)) {
                seenLabels.add(fn);
                suggestions.push({
                  label: fn,
                  kind: monaco.languages.CompletionItemKind.Function,
                  detail: "(builtin)",
                  documentation: `Built-in function/symbol \`${fn}\``,
                  insertText: fn,
                  range,
                  sortText: "2_" + fn,
                });
              }
            }
          }
        }

        // 3. Document Words & Symbol Extractor
        // Collect identifiers already present in the active document for contextual autocomplete
        const docWords = this.extractDocumentSymbols(model, position.lineNumber);
        for (const docSymbol of docWords) {
          if (!seenLabels.has(docSymbol.word) && docSymbol.word.toLowerCase() !== currentWord) {
            seenLabels.add(docSymbol.word);
            suggestions.push({
              label: docSymbol.word,
              kind: docSymbol.kind === "function"
                ? monaco.languages.CompletionItemKind.Function
                : docSymbol.kind === "class"
                ? monaco.languages.CompletionItemKind.Class
                : monaco.languages.CompletionItemKind.Variable,
              detail: `(${docSymbol.kind})`,
              documentation: `Identified ${docSymbol.kind} from current document`,
              insertText: docSymbol.word,
              range,
              sortText: "3_" + docSymbol.word,
            });
          }
        }

        return { suggestions };
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private static extractDocumentSymbols(model: any, currentLine: number): Array<{ word: string; kind: string }> {
    const symbols: Array<{ word: string; kind: string }> = [];
    try {
      const lineCount = Math.min(model.getLineCount(), 1000); // Guard for extreme file sizes
      const idRegex = /\b[A-Za-z_$][A-Za-z0-9_$]{2,}\b/g;
      const seen = new Set<string>();

      for (let i = 1; i <= lineCount; i++) {
        const lineContent = model.getLineContent(i);
        let match: RegExpExecArray | null;

        while ((match = idRegex.exec(lineContent)) !== null) {
          const w = match[0];
          if (!seen.has(w)) {
            seen.add(w);
            let kind = "variable";

            // Simple heuristic for symbol kind
            if (/^[A-Z][a-zA-Z0-9]+$/.test(w)) {
              kind = "class";
            } else if (lineContent.includes(`${w}(`)) {
              kind = "function";
            }

            symbols.push({ word: w, kind });
          }
        }
      }
    } catch {
      // Fallback gracefully on parsing errors
    }
    return symbols;
  }

  static addSnippet(snippet: CustomSnippet) {
    this.registeredSnippets.push(snippet);
  }
}
