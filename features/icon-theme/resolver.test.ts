import { describe, it, expect, beforeEach } from "vitest";
import { resolveIcon, clearIconCache } from "./resolver";
import { simpleIconsTheme } from "./themes/simple-icons";

describe("Simple Icons Resolver", () => {
  beforeEach(() => {
    clearIconCache();
  });

  describe("Exact Filename Resolution", () => {
    it("resolves package.json and lockfiles", () => {
      expect(resolveIcon({ name: "package.json" }).id).toBe("simple-icons-npm");
      expect(resolveIcon({ name: "PACKAGE.JSON" }).id).toBe("simple-icons-npm");
      expect(resolveIcon({ name: "yarn.lock" }).id).toBe("simple-icons-yarn");
      expect(resolveIcon({ name: "pnpm-lock.yaml" }).id).toBe("simple-icons-pnpm");
      expect(resolveIcon({ name: "bun.lockb" }).id).toBe("simple-icons-bun");
    });

    it("resolves configuration files", () => {
      expect(resolveIcon({ name: "tsconfig.json" }).id).toBe("simple-icons-typescript");
      expect(resolveIcon({ name: "vite.config.ts" }).id).toBe("simple-icons-vite");
      expect(resolveIcon({ name: "next.config.mjs" }).id).toBe("simple-icons-nextjs");
      expect(resolveIcon({ name: "tailwind.config.ts" }).id).toBe("simple-icons-tailwind");
      expect(resolveIcon({ name: "eslint.config.js" }).id).toBe("simple-icons-eslint");
      expect(resolveIcon({ name: ".eslintrc.json" }).id).toBe("simple-icons-eslint");
      expect(resolveIcon({ name: ".gitignore" }).id).toBe("simple-icons-git");
      expect(resolveIcon({ name: ".env" }).id).toBe("simple-icons-env");
      expect(resolveIcon({ name: ".env.local" }).id).toBe("simple-icons-env");
      expect(resolveIcon({ name: "tauri.conf.json" }).id).toBe("simple-icons-tauri");
      expect(resolveIcon({ name: "cargo.toml" }).id).toBe("simple-icons-rust");
    });

    it("resolves docker and documentation files", () => {
      expect(resolveIcon({ name: "Dockerfile" }).id).toBe("simple-icons-docker");
      expect(resolveIcon({ name: "docker-compose.yml" }).id).toBe("simple-icons-docker");
      expect(resolveIcon({ name: "README.md" }).id).toBe("simple-icons-markdown");
      expect(resolveIcon({ name: "LICENSE" }).id).toBe("simple-icons-license");
      expect(resolveIcon({ name: "license.txt" }).id).toBe("simple-icons-license");
    });
  });

  describe("Pattern Matching", () => {
    it("resolves environment patterns", () => {
      expect(resolveIcon({ name: ".env.staging" }).id).toBe("simple-icons-env");
      expect(resolveIcon({ name: ".env.production.local" }).id).toBe("simple-icons-env");
    });

    it("resolves Docker variations", () => {
      expect(resolveIcon({ name: "dockerfile.dev" }).id).toBe("simple-icons-docker");
      expect(resolveIcon({ name: "docker-compose.staging.yaml" }).id).toBe("simple-icons-docker");
    });

    it("resolves License variations", () => {
      expect(resolveIcon({ name: "LICENSE.md" }).id).toBe("simple-icons-license");
      expect(resolveIcon({ name: "LICENCE" }).id).toBe("simple-icons-license");
    });
  });

  describe("File Extension Matching", () => {
    it("resolves programming language extensions", () => {
      expect(resolveIcon({ name: "index.ts" }).id).toBe("simple-icons-typescript");
      expect(resolveIcon({ name: "App.tsx" }).id).toBe("simple-icons-react-ts");
      expect(resolveIcon({ name: "utils.js" }).id).toBe("simple-icons-javascript");
      expect(resolveIcon({ name: "Widget.jsx" }).id).toBe("simple-icons-react-js");
      expect(resolveIcon({ name: "script.py" }).id).toBe("simple-icons-python");
      expect(resolveIcon({ name: "main.rs" }).id).toBe("simple-icons-rust");
      expect(resolveIcon({ name: "server.go" }).id).toBe("simple-icons-go");
      expect(resolveIcon({ name: "App.java" }).id).toBe("simple-icons-java");
      expect(resolveIcon({ name: "main.cpp" }).id).toBe("simple-icons-cpp");
      expect(resolveIcon({ name: "main.c" }).id).toBe("simple-icons-c");
      expect(resolveIcon({ name: "Program.cs" }).id).toBe("simple-icons-csharp");
      expect(resolveIcon({ name: "index.php" }).id).toBe("simple-icons-php");
      expect(resolveIcon({ name: "app.rb" }).id).toBe("simple-icons-ruby");
      expect(resolveIcon({ name: "App.swift" }).id).toBe("simple-icons-swift");
      expect(resolveIcon({ name: "Main.kt" }).id).toBe("simple-icons-kotlin");
      expect(resolveIcon({ name: "main.dart" }).id).toBe("simple-icons-dart");
      expect(resolveIcon({ name: "query.sql" }).id).toBe("simple-icons-sql");
      expect(resolveIcon({ name: "run.sh" }).id).toBe("simple-icons-shell");
      expect(resolveIcon({ name: "deploy.ps1" }).id).toBe("simple-icons-shell");
      expect(resolveIcon({ name: "app.vue" }).id).toBe("simple-icons-vue");
      expect(resolveIcon({ name: "component.svelte" }).id).toBe("simple-icons-svelte");
      expect(resolveIcon({ name: "page.astro" }).id).toBe("simple-icons-astro");
    });

    it("resolves web, style, and data extensions", () => {
      expect(resolveIcon({ name: "index.html" }).id).toBe("simple-icons-html");
      expect(resolveIcon({ name: "styles.css" }).id).toBe("simple-icons-css");
      expect(resolveIcon({ name: "styles.scss" }).id).toBe("simple-icons-sass");
      expect(resolveIcon({ name: "styles.sass" }).id).toBe("simple-icons-sass");
      expect(resolveIcon({ name: "data.json" }).id).toBe("simple-icons-json");
      expect(resolveIcon({ name: "manifest.jsonc" }).id).toBe("simple-icons-json");
      expect(resolveIcon({ name: "workflow.yaml" }).id).toBe("simple-icons-yaml");
      expect(resolveIcon({ name: "workflow.yml" }).id).toBe("simple-icons-yaml");
      expect(resolveIcon({ name: "notes.md" }).id).toBe("simple-icons-markdown");
      expect(resolveIcon({ name: "blog.mdx" }).id).toBe("simple-icons-mdx");
      expect(resolveIcon({ name: "schema.prisma" }).id).toBe("simple-icons-prisma");
      expect(resolveIcon({ name: "query.graphql" }).id).toBe("simple-icons-graphql");
    });

    it("resolves media and archive formats", () => {
      expect(resolveIcon({ name: "logo.svg" }).id).toBe("simple-icons-svg");
      expect(resolveIcon({ name: "avatar.png" }).id).toBe("simple-icons-image");
      expect(resolveIcon({ name: "banner.jpg" }).id).toBe("simple-icons-image");
      expect(resolveIcon({ name: "bundle.zip" }).id).toBe("simple-icons-archive");
      expect(resolveIcon({ name: "archive.tar.gz" }).id).toBe("simple-icons-archive");
      expect(resolveIcon({ name: "data.7z" }).id).toBe("simple-icons-archive");
    });
  });

  describe("Fallback Behavior", () => {
    it("returns default file icon for unrecognized extensions or files without extension", () => {
      expect(resolveIcon({ name: "unknown.xyz" }).id).toBe("default-file");
      expect(resolveIcon({ name: "MY_RANDOM_FILE" }).id).toBe("default-file");
      expect(resolveIcon({ name: "" }).id).toBe("default-file");
    });
  });

  describe("Folder Resolution", () => {
    it("resolves specialized closed folders", () => {
      expect(resolveIcon({ name: "src", isDirectory: true }).id).toBe("folder-src");
      expect(resolveIcon({ name: "app", isDirectory: true }).id).toBe("folder-app");
      expect(resolveIcon({ name: "components", isDirectory: true }).id).toBe("folder-components");
      expect(resolveIcon({ name: "public", isDirectory: true }).id).toBe("folder-public");
      expect(resolveIcon({ name: "assets", isDirectory: true }).id).toBe("folder-assets");
      expect(resolveIcon({ name: "tests", isDirectory: true }).id).toBe("folder-test");
      expect(resolveIcon({ name: "node_modules", isDirectory: true }).id).toBe("folder-node-modules");
      expect(resolveIcon({ name: ".git", isDirectory: true }).id).toBe("folder-git");
      expect(resolveIcon({ name: ".vscode", isDirectory: true }).id).toBe("folder-vscode");
    });

    it("resolves specialized open folders", () => {
      expect(resolveIcon({ name: "src", isDirectory: true, isExpanded: true }).id).toBe("folder-src-open");
      expect(resolveIcon({ name: "components", isDirectory: true, isExpanded: true }).id).toBe("folder-components-open");
      expect(resolveIcon({ name: "tests", isDirectory: true, isExpanded: true }).id).toBe("folder-test-open");
      expect(resolveIcon({ name: "node_modules", isDirectory: true, isExpanded: true }).id).toBe("folder-node-modules-open");
    });

    it("falls back to generic folder icons for unknown folders", () => {
      expect(resolveIcon({ name: "my-custom-folder", isDirectory: true }).id).toBe("default-folder");
      expect(resolveIcon({ name: "my-custom-folder", isDirectory: true, isExpanded: true }).id).toBe("default-folder-expanded");
    });
  });

  describe("Path Parsing & Cache", () => {
    it("extracts base filename from relative and absolute paths", () => {
      expect(resolveIcon({ name: "src/components/Header.tsx" }).id).toBe("simple-icons-react-ts");
      expect(resolveIcon({ name: "C:\\projects\\app\\package.json" }).id).toBe("simple-icons-npm");
      expect(resolveIcon({ name: "/var/www/src", isDirectory: true, isExpanded: true }).id).toBe("folder-src-open");
    });

    it("memoizes resolution results", () => {
      const first = resolveIcon({ name: "App.tsx" });
      const second = resolveIcon({ name: "App.tsx" });
      expect(first).toBe(second);
    });

    it("supports passing theme explicitly", () => {
      const icon = resolveIcon({ name: "main.rs" }, simpleIconsTheme);
      expect(icon.id).toBe("simple-icons-rust");
    });
  });
});
