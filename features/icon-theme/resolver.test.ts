import { describe, it, expect, beforeEach } from "vitest";
import { resolveIcon, clearIconCache } from "./resolver";
import { setiTheme } from "./themes/seti";

describe("Seti Icon Resolver", () => {
  beforeEach(() => {
    clearIconCache();
  });

  describe("Exact Filename Resolution", () => {
    it("resolves package.json and lockfiles", () => {
      expect(resolveIcon({ name: "package.json" }).id).toBe("seti-npm");
      expect(resolveIcon({ name: "PACKAGE.JSON" }).id).toBe("seti-npm");
      expect(resolveIcon({ name: "yarn.lock" }).id).toBe("seti-yarn");
      expect(resolveIcon({ name: "pnpm-lock.yaml" }).id).toBe("seti-pnpm");
    });

    it("resolves configuration files", () => {
      expect(resolveIcon({ name: "tsconfig.json" }).id).toBe("seti-typescript");
      expect(resolveIcon({ name: "vite.config.ts" }).id).toBe("seti-vite");
      expect(resolveIcon({ name: "next.config.mjs" }).id).toBe("seti-nextjs");
      expect(resolveIcon({ name: "tailwind.config.ts" }).id).toBe("seti-tailwind");
      expect(resolveIcon({ name: "eslint.config.js" }).id).toBe("seti-eslint");
      expect(resolveIcon({ name: ".eslintrc.json" }).id).toBe("seti-eslint");
      expect(resolveIcon({ name: ".gitignore" }).id).toBe("seti-git");
      expect(resolveIcon({ name: ".env" }).id).toBe("seti-env");
      expect(resolveIcon({ name: ".env.local" }).id).toBe("seti-env");
      expect(resolveIcon({ name: "tauri.conf.json" }).id).toBe("seti-settings");
      expect(resolveIcon({ name: "cargo.toml" }).id).toBe("seti-rust");
    });

    it("resolves docker and documentation files", () => {
      expect(resolveIcon({ name: "Dockerfile" }).id).toBe("seti-docker");
      expect(resolveIcon({ name: "docker-compose.yml" }).id).toBe("seti-docker");
      expect(resolveIcon({ name: "README.md" }).id).toBe("seti-markdown");
      expect(resolveIcon({ name: "LICENSE" }).id).toBe("seti-license");
      expect(resolveIcon({ name: "license.txt" }).id).toBe("seti-license");
    });
  });

  describe("Pattern Matching", () => {
    it("resolves environment patterns", () => {
      expect(resolveIcon({ name: ".env.staging" }).id).toBe("seti-env");
      expect(resolveIcon({ name: ".env.production.local" }).id).toBe("seti-env");
    });

    it("resolves Docker variations", () => {
      expect(resolveIcon({ name: "dockerfile.dev" }).id).toBe("seti-docker");
      expect(resolveIcon({ name: "docker-compose.staging.yaml" }).id).toBe("seti-docker");
    });

    it("resolves License variations", () => {
      expect(resolveIcon({ name: "LICENSE.md" }).id).toBe("seti-license");
      expect(resolveIcon({ name: "LICENCE" }).id).toBe("seti-license");
    });
  });

  describe("File Extension Matching", () => {
    it("resolves programming language extensions", () => {
      expect(resolveIcon({ name: "index.ts" }).id).toBe("seti-typescript");
      expect(resolveIcon({ name: "App.tsx" }).id).toBe("seti-react-ts");
      expect(resolveIcon({ name: "utils.js" }).id).toBe("seti-javascript");
      expect(resolveIcon({ name: "Widget.jsx" }).id).toBe("seti-react-js");
      expect(resolveIcon({ name: "script.py" }).id).toBe("seti-python");
      expect(resolveIcon({ name: "main.rs" }).id).toBe("seti-rust");
      expect(resolveIcon({ name: "server.go" }).id).toBe("seti-go");
      expect(resolveIcon({ name: "App.java" }).id).toBe("seti-java");
      expect(resolveIcon({ name: "main.cpp" }).id).toBe("seti-cpp");
      expect(resolveIcon({ name: "main.c" }).id).toBe("seti-c");
      expect(resolveIcon({ name: "Program.cs" }).id).toBe("seti-csharp");
      expect(resolveIcon({ name: "index.php" }).id).toBe("seti-php");
      expect(resolveIcon({ name: "app.rb" }).id).toBe("seti-ruby");
      expect(resolveIcon({ name: "App.swift" }).id).toBe("seti-swift");
      expect(resolveIcon({ name: "Main.kt" }).id).toBe("seti-kotlin");
      expect(resolveIcon({ name: "main.dart" }).id).toBe("seti-dart");
      expect(resolveIcon({ name: "query.sql" }).id).toBe("seti-sql");
      expect(resolveIcon({ name: "run.sh" }).id).toBe("seti-shell");
      expect(resolveIcon({ name: "deploy.ps1" }).id).toBe("seti-shell");
    });

    it("resolves web, style, and data extensions", () => {
      expect(resolveIcon({ name: "index.html" }).id).toBe("seti-html");
      expect(resolveIcon({ name: "styles.css" }).id).toBe("seti-css");
      expect(resolveIcon({ name: "styles.scss" }).id).toBe("seti-sass");
      expect(resolveIcon({ name: "styles.sass" }).id).toBe("seti-sass");
      expect(resolveIcon({ name: "data.json" }).id).toBe("seti-json");
      expect(resolveIcon({ name: "manifest.jsonc" }).id).toBe("seti-json");
      expect(resolveIcon({ name: "workflow.yaml" }).id).toBe("seti-yaml");
      expect(resolveIcon({ name: "workflow.yml" }).id).toBe("seti-yaml");
      expect(resolveIcon({ name: "notes.md" }).id).toBe("seti-markdown");
    });

    it("resolves media and archive formats", () => {
      expect(resolveIcon({ name: "logo.svg" }).id).toBe("seti-image");
      expect(resolveIcon({ name: "avatar.png" }).id).toBe("seti-image");
      expect(resolveIcon({ name: "banner.jpg" }).id).toBe("seti-image");
      expect(resolveIcon({ name: "clip.mp4" }).id).toBe("seti-video");
      expect(resolveIcon({ name: "sound.mp3" }).id).toBe("seti-audio");
      expect(resolveIcon({ name: "bundle.zip" }).id).toBe("seti-archive");
      expect(resolveIcon({ name: "archive.tar.gz" }).id).toBe("seti-archive");
    });
  });

  describe("Fallback Behavior", () => {
    it("returns default file icon for unrecognized extensions or files without extension", () => {
      expect(resolveIcon({ name: "unknown.xyz" }).id).toBe("seti-default-file");
      expect(resolveIcon({ name: "MY_RANDOM_FILE" }).id).toBe("seti-default-file");
      expect(resolveIcon({ name: "" }).id).toBe("seti-default-file");
    });
  });

  describe("Folder Resolution", () => {
    it("resolves specialized closed folders", () => {
      expect(resolveIcon({ name: "src", isDirectory: true }).id).toBe("seti-folder-src");
      expect(resolveIcon({ name: "app", isDirectory: true }).id).toBe("seti-folder-app");
      expect(resolveIcon({ name: "components", isDirectory: true }).id).toBe("seti-folder-components");
      expect(resolveIcon({ name: "public", isDirectory: true }).id).toBe("seti-folder-public");
      expect(resolveIcon({ name: "assets", isDirectory: true }).id).toBe("seti-folder-assets");
      expect(resolveIcon({ name: "tests", isDirectory: true }).id).toBe("seti-folder-test");
      expect(resolveIcon({ name: "node_modules", isDirectory: true }).id).toBe("seti-folder-node-modules");
      expect(resolveIcon({ name: ".git", isDirectory: true }).id).toBe("seti-folder-git");
      expect(resolveIcon({ name: ".vscode", isDirectory: true }).id).toBe("seti-folder-vscode");
    });

    it("resolves specialized open folders", () => {
      expect(resolveIcon({ name: "src", isDirectory: true, isExpanded: true }).id).toBe("seti-folder-src-open");
      expect(resolveIcon({ name: "components", isDirectory: true, isExpanded: true }).id).toBe("seti-folder-components-open");
      expect(resolveIcon({ name: "tests", isDirectory: true, isExpanded: true }).id).toBe("seti-folder-test-open");
      expect(resolveIcon({ name: "node_modules", isDirectory: true, isExpanded: true }).id).toBe("seti-folder-node-modules-open");
    });

    it("falls back to generic folder icons for unknown folders", () => {
      expect(resolveIcon({ name: "my-custom-folder", isDirectory: true }).id).toBe("seti-default-folder");
      expect(resolveIcon({ name: "my-custom-folder", isDirectory: true, isExpanded: true }).id).toBe("seti-default-folder-expanded");
    });
  });

  describe("Path Parsing & Cache", () => {
    it("extracts base filename from relative and absolute paths", () => {
      expect(resolveIcon({ name: "src/components/Header.tsx" }).id).toBe("seti-react-ts");
      expect(resolveIcon({ name: "C:\\projects\\app\\package.json" }).id).toBe("seti-npm");
      expect(resolveIcon({ name: "/var/www/src", isDirectory: true, isExpanded: true }).id).toBe("seti-folder-src-open");
    });

    it("memoizes resolution results", () => {
      const first = resolveIcon({ name: "App.tsx" });
      const second = resolveIcon({ name: "App.tsx" });
      expect(first).toBe(second);
    });

    it("supports passing theme explicitly", () => {
      const icon = resolveIcon({ name: "main.rs" }, setiTheme);
      expect(icon.id).toBe("seti-rust");
    });
  });
});
