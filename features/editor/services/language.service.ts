import { basename, getFileExtension } from "@/lib/tauri-ipc";

/**
 * Maps common file extensions to standard Monaco language identifiers.
 */
const EXTENSION_MAP: Record<string, string> = {
  // TypeScript & JavaScript
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",

  // Web technologies
  html: "html",
  htm: "html",
  xhtml: "html",
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "less",

  // Data & Configurations
  json: "json",
  jsonc: "json",
  json5: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  svg: "xml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",

  // Documentation
  md: "markdown",
  markdown: "markdown",
  mdx: "markdown",
  txt: "plaintext",

  // Systems & Application languages
  rs: "rust",
  py: "python",
  pyw: "python",
  go: "go",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  hpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  swift: "swift",
  kt: "kotlin",
  kts: "kotlin",
  dart: "dart",
  lua: "lua",
  r: "r",

  // Shell & Scripts
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  ps1: "powershell",
  psm1: "powershell",
  bat: "bat",
  cmd: "bat",

  // Query & Database
  sql: "sql",
  graphql: "graphql",
  gql: "graphql",
};

/**
 * Exact filename overrides (case-insensitive)
 */
const FILENAME_MAP: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  gnumakefile: "makefile",
  gemfile: "ruby",
  rakefile: "ruby",
  vagrantfile: "ruby",
  cmakelists: "cmake",
};

/**
 * Human-readable language labels for status bar display
 */
const DISPLAY_NAMES: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  less: "Less",
  json: "JSON",
  yaml: "YAML",
  toml: "TOML",
  xml: "XML",
  markdown: "Markdown",
  rust: "Rust",
  python: "Python",
  go: "Go",
  java: "Java",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  php: "PHP",
  ruby: "Ruby",
  swift: "Swift",
  kotlin: "Kotlin",
  dart: "Dart",
  lua: "Lua",
  r: "R",
  shell: "Shell Script",
  powershell: "PowerShell",
  bat: "Batch",
  sql: "SQL",
  graphql: "GraphQL",
  dockerfile: "Dockerfile",
  makefile: "Makefile",
  plaintext: "Plain Text",
};

export class LanguageService {
  /**
   * Detects the Monaco-compatible language identifier from a file path or name.
   */
  static detectLanguage(filePath: string): string {
    if (!filePath) return "plaintext";

    const fileName = basename(filePath).toLowerCase();

    // 1. Check exact filename match
    if (FILENAME_MAP[fileName]) {
      return FILENAME_MAP[fileName];
    }

    // Check prefixed filenames like "Dockerfile.dev"
    if (fileName.startsWith("dockerfile.")) {
      return "dockerfile";
    }

    // 2. Check compound extensions (e.g., .d.ts)
    if (fileName.endsWith(".d.ts") || fileName.endsWith(".d.mts")) {
      return "typescript";
    }

    // 3. Standard file extension lookup
    const ext = getFileExtension(fileName);
    if (ext && EXTENSION_MAP[ext]) {
      return EXTENSION_MAP[ext];
    }

    // 4. Dotfiles
    if (fileName.startsWith(".env")) {
      return "ini";
    }
    if (fileName.endsWith("rc") && fileName.startsWith(".")) {
      return "json";
    }

    return "plaintext";
  }

  /**
   * Returns a friendly display name for a language identifier.
   */
  static getDisplayName(languageId: string): string {
    return DISPLAY_NAMES[languageId] || languageId.toUpperCase();
  }
}

