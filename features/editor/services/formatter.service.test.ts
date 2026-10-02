import { describe, it, expect } from "vitest";
import { FormatterService, FormatterError } from "./formatter.service";

describe("FormatterService", () => {
  it("formats valid JSON content properly", async () => {
    const raw = '{"name":"kairo","version":"1.0","debug":true}';
    const formatted = await FormatterService.formatContent("json", raw, { tabSize: 2 });
    expect(formatted).toBe('{\n  "name": "kairo",\n  "version": "1.0",\n  "debug": true\n}');
  });

  it("throws FormatterError on invalid JSON without corrupting original code", async () => {
    const invalidJson = '{"name": "kairo", broken}';
    await expect(
      FormatterService.formatContent("json", invalidJson)
    ).rejects.toThrow(FormatterError);
  });

  it("returns unchanged content when no provider is registered for language", async () => {
    const raw = "SELECT * FROM users WHERE active = 1;";
    const formatted = await FormatterService.formatContent("sql", raw);
    expect(formatted).toBe(raw);
  });

  it("allows custom provider registration and unregistration", async () => {
    const customProvider = {
      id: "test-custom",
      name: "Custom Test Formatter",
      canFormat: (lang: string) => lang === "custom-lang",
      format: async (content: string) => content.toUpperCase(),
    };

    const unregister = FormatterService.registerProvider(customProvider);
    expect(FormatterService.getProvidersForLanguage("custom-lang").length).toBe(1);

    const formatted = await FormatterService.formatContent("custom-lang", "hello world");
    expect(formatted).toBe("HELLO WORLD");

    unregister();
    expect(FormatterService.getProvidersForLanguage("custom-lang").length).toBe(0);
  });
});

