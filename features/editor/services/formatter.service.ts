import { FormatterProvider, FormatOptions } from "../types";

export class FormatterError extends Error {
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = "FormatterError";
  }
}

/**
 * Built-in JSON Formatter provider
 */
class JsonFormatterProvider implements FormatterProvider {
  id = "builtin-json";
  name = "Built-in JSON Formatter";

  canFormat(language: string): boolean {
    return language === "json";
  }

  async format(content: string, options?: FormatOptions): Promise<string> {
    const tabSize = options?.tabSize ?? 2;
    try {
      const parsed = JSON.parse(content);
      return JSON.stringify(parsed, null, tabSize);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid JSON syntax.";
      throw new FormatterError(`JSON Formatting failed: ${msg}`, err);
    }
  }
}

/**
 * Formatter Service orchestrating code formatting providers and Monaco actions.
 */
export class FormatterService {
  private static providers: FormatterProvider[] = [new JsonFormatterProvider()];

  /**
   * Registers a new custom formatter provider for future extensibility (e.g., Prettier, Biome).
   */
  static registerProvider(provider: FormatterProvider): () => void {
    this.providers.push(provider);
    return () => {
      this.providers = this.providers.filter((p) => p.id !== provider.id);
    };
  }

  /**
   * Returns all providers capable of formatting the given language.
   */
  static getProvidersForLanguage(language: string): FormatterProvider[] {
    return this.providers.filter((p) => p.canFormat(language));
  }

  /**
   * Formats raw code string using registered providers.
   * NEVER returns corrupted or empty code on failure.
   */
  static async formatContent(
    language: string,
    content: string,
    options?: FormatOptions
  ): Promise<string> {
    const provider = this.getProvidersForLanguage(language)[0];
    if (!provider) {
      return content;
    }

    try {
      const result = await provider.format(content, options);
      return result;
    } catch (error) {
      console.warn(`[FormatterService] Error formatting ${language}:`, error);
      throw error;
    }
  }

  /**
   * Runs the Monaco Editor's built-in formatDocument action.
   */
  static async formatMonacoDocument(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    editorInstance: any
  ): Promise<boolean> {
    if (!editorInstance) return false;

    try {
      const action = editorInstance.getAction("editor.action.formatDocument");
      if (action) {
        await action.run();
        return true;
      }
      return false;
    } catch (error) {
      console.warn("[FormatterService] Monaco formatDocument action error:", error);
      return false;
    }
  }
}

