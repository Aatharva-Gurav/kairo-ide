import { describe, it, expect } from "vitest";
import { LanguageService } from "./language.service";

describe("LanguageService", () => {
  it("detects TypeScript and TSX files correctly", () => {
    expect(LanguageService.detectLanguage("src/App.tsx")).toBe("typescript");
    expect(LanguageService.detectLanguage("src/index.ts")).toBe("typescript");
    expect(LanguageService.detectLanguage("src/types.d.ts")).toBe("typescript");
    expect(LanguageService.detectLanguage("script.mts")).toBe("typescript");
  });

  it("detects JavaScript and JSX files correctly", () => {
    expect(LanguageService.detectLanguage("src/Component.jsx")).toBe("javascript");
    expect(LanguageService.detectLanguage("src/main.js")).toBe("javascript");
    expect(LanguageService.detectLanguage("bundle.mjs")).toBe("javascript");
    expect(LanguageService.detectLanguage("server.cjs")).toBe("javascript");
  });

  it("detects Web styles and documents", () => {
    expect(LanguageService.detectLanguage("index.html")).toBe("html");
    expect(LanguageService.detectLanguage("styles.css")).toBe("css");
    expect(LanguageService.detectLanguage("theme.scss")).toBe("scss");
    expect(LanguageService.detectLanguage("variables.less")).toBe("less");
    expect(LanguageService.detectLanguage("README.md")).toBe("markdown");
  });

  it("detects System and Backend languages", () => {
    expect(LanguageService.detectLanguage("src-tauri/src/main.rs")).toBe("rust");
    expect(LanguageService.detectLanguage("server.py")).toBe("python");
    expect(LanguageService.detectLanguage("main.go")).toBe("go");
    expect(LanguageService.detectLanguage("App.java")).toBe("java");
    expect(LanguageService.detectLanguage("program.c")).toBe("c");
    expect(LanguageService.detectLanguage("program.cpp")).toBe("cpp");
    expect(LanguageService.detectLanguage("script.sql")).toBe("sql");
  });

  it("detects configurations and special filenames", () => {
    expect(LanguageService.detectLanguage("package.json")).toBe("json");
    expect(LanguageService.detectLanguage("config.yaml")).toBe("yaml");
    expect(LanguageService.detectLanguage("Cargo.toml")).toBe("toml");
    expect(LanguageService.detectLanguage("icon.svg")).toBe("xml");
    expect(LanguageService.detectLanguage("Dockerfile")).toBe("dockerfile");
    expect(LanguageService.detectLanguage("Dockerfile.prod")).toBe("dockerfile");
    expect(LanguageService.detectLanguage("Makefile")).toBe("makefile");
    expect(LanguageService.detectLanguage(".env.local")).toBe("ini");
  });

  it("falls back to plaintext for unknown files", () => {
    expect(LanguageService.detectLanguage("LICENSE")).toBe("plaintext");
    expect(LanguageService.detectLanguage("data.unknown_ext")).toBe("plaintext");
    expect(LanguageService.detectLanguage("")).toBe("plaintext");
  });

  it("returns human friendly display names", () => {
    expect(LanguageService.getDisplayName("typescript")).toBe("TypeScript");
    expect(LanguageService.getDisplayName("rust")).toBe("Rust");
    expect(LanguageService.getDisplayName("python")).toBe("Python");
    expect(LanguageService.getDisplayName("plaintext")).toBe("Plain Text");
  });
});

