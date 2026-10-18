import { describe, it, expect, beforeEach } from "vitest";
import {
  IntelliSenseService,
  ALL_SUPPORTED_LANGUAGES,
  BUILTIN_SNIPPETS,
  LANGUAGE_KEYWORDS,
} from "./intellisense.service";

describe("IntelliSenseService", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockMonaco: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let registeredProviders: Record<string, any>;

  beforeEach(() => {
    IntelliSenseService.resetForTesting();
    registeredProviders = {};
    mockMonaco = {
      languages: {
        CompletionItemKind: {
          Function: 1,
          Class: 5,
          Variable: 4,
          Keyword: 13,
          Snippet: 14,
        },
        CompletionItemInsertTextRule: {
          InsertAsSnippet: 4,
        },
        typescript: {
          typescriptDefaults: {
            setCompilerOptions: () => {},
            setDiagnosticsOptions: () => {},
          },
          javascriptDefaults: {
            setCompilerOptions: () => {},
            setDiagnosticsOptions: () => {},
          },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        registerCompletionItemProvider: (lang: string, provider: any) => {
          registeredProviders[lang] = provider;
        },
      },
    };
  });

  it("defines supported languages and built-in snippets", () => {
    expect(ALL_SUPPORTED_LANGUAGES.length).toBeGreaterThan(25);
    expect(ALL_SUPPORTED_LANGUAGES).toContain("python");
    expect(ALL_SUPPORTED_LANGUAGES).toContain("rust");
    expect(ALL_SUPPORTED_LANGUAGES).toContain("go");
    expect(ALL_SUPPORTED_LANGUAGES).toContain("html");
    expect(ALL_SUPPORTED_LANGUAGES).toContain("css");
    expect(ALL_SUPPORTED_LANGUAGES).toContain("sql");
    expect(ALL_SUPPORTED_LANGUAGES).toContain("dockerfile");
    expect(BUILTIN_SNIPPETS.length).toBeGreaterThan(15);
  });

  it("initializes and registers providers for all supported languages", () => {
    IntelliSenseService.init(mockMonaco);

    for (const lang of ALL_SUPPORTED_LANGUAGES) {
      expect(registeredProviders[lang]).toBeDefined();
      expect(registeredProviders[lang].provideCompletionItems).toBeTypeOf("function");
    }
  });

  it("provides code suggestions and snippets for Python", () => {
    IntelliSenseService.init(mockMonaco);
    const pythonProvider = registeredProviders["python"];
    expect(pythonProvider).toBeDefined();

    const mockModel = {
      getWordUntilPosition: () => ({ word: "pr", startColumn: 1, endColumn: 3 }),
      getLineCount: () => 3,
      getLineContent: (line: number) => {
        if (line === 1) return "def calculate_total(items):";
        if (line === 2) return "    total_amount = sum(items)";
        return "    return total_amount";
      },
    };

    const result = pythonProvider.provideCompletionItems(mockModel, { lineNumber: 3, column: 3 });
    expect(result).toBeDefined();
    expect(result.suggestions).toBeDefined();
    expect(result.suggestions.length).toBeGreaterThan(0);

    const labels = result.suggestions.map((s: { label: string }) => s.label);
    // Builtin functions and keywords
    expect(labels).toContain("print");
    expect(labels).toContain("def");
    // Document symbols
    expect(labels).toContain("calculate_total");
    expect(labels).toContain("total_amount");
  });

  it("provides code suggestions and snippets for Rust and Go", () => {
    IntelliSenseService.init(mockMonaco);

    // Rust
    const rustProvider = registeredProviders["rust"];
    const rustModel = {
      getWordUntilPosition: () => ({ word: "", startColumn: 1, endColumn: 1 }),
      getLineCount: () => 1,
      getLineContent: () => "let my_var = 10;",
    };
    const rustResult = rustProvider.provideCompletionItems(rustModel, { lineNumber: 1, column: 1 });
    const rustLabels = rustResult.suggestions.map((s: { label: string }) => s.label);
    expect(rustLabels).toContain("fn");
    expect(rustLabels).toContain("println!");

    // Go
    const goProvider = registeredProviders["go"];
    const goModel = {
      getWordUntilPosition: () => ({ word: "", startColumn: 1, endColumn: 1 }),
      getLineCount: () => 1,
      getLineContent: () => "package main",
    };
    const goResult = goProvider.provideCompletionItems(goModel, { lineNumber: 1, column: 1 });
    const goLabels = goResult.suggestions.map((s: { label: string }) => s.label);
    expect(goLabels).toContain("func");
    expect(goLabels).toContain("fmt.Println");
  });

  it("extracts document symbols and categorizes classes and functions", () => {
    IntelliSenseService.init(mockMonaco);
    const tsProvider = registeredProviders["typescript"];

    const mockModel = {
      getWordUntilPosition: () => ({ word: "", startColumn: 1, endColumn: 1 }),
      getLineCount: () => 4,
      getLineContent: (line: number) => {
        if (line === 1) return "class UserService {";
        if (line === 2) return "  getUserById(id: string) {";
        if (line === 3) return "    const activeUser = fetchUser(id);";
        return "    return activeUser; }";
      },
    };

    const result = tsProvider.provideCompletionItems(mockModel, { lineNumber: 4, column: 1 });
    const symbols = result.suggestions.filter((s: { detail: string }) =>
      s.detail.includes("(class)") || s.detail.includes("(function)") || s.detail.includes("(variable)")
    );

    const classSymbol = symbols.find((s: { label: string }) => s.label === "UserService");
    expect(classSymbol).toBeDefined();
    expect(classSymbol.detail).toBe("(class)");

    const functionSymbol = symbols.find((s: { label: string }) => s.label === "getUserById");
    expect(functionSymbol).toBeDefined();
    expect(functionSymbol.detail).toBe("(function)");
  });

  it("allows adding custom snippets dynamically", () => {
    IntelliSenseService.init(mockMonaco);
    IntelliSenseService.addSnippet({
      label: "customtest",
      detail: "Custom test snippet",
      documentation: "Documentation for custom test",
      insertText: "custom_code_here()",
      languages: ["python"],
    });

    const pythonProvider = registeredProviders["python"];
    const mockModel = {
      getWordUntilPosition: () => ({ word: "", startColumn: 1, endColumn: 1 }),
      getLineCount: () => 0,
      getLineContent: () => "",
    };

    const result = pythonProvider.provideCompletionItems(mockModel, { lineNumber: 1, column: 1 });
    const customSnippet = result.suggestions.find((s: { label: string }) => s.label === "customtest");
    expect(customSnippet).toBeDefined();
    expect(customSnippet.insertText).toBe("custom_code_here()");
  });
});
