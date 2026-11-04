import { describe, it, expect } from "vitest";
import { TerminalThemeService } from "./terminal-theme.service";

describe("TerminalThemeService", () => {
  it("generates dark theme colors for dark-modern", () => {
    const theme = TerminalThemeService.getTheme("dark-modern");
    expect(theme.background).toBeDefined();
    expect(theme.foreground).toBeDefined();
    expect(theme.cursor).toBeDefined();
    expect(theme.black).toBeDefined();
    expect(theme.red).toBeDefined();
    expect(theme.green).toBeDefined();
    expect(theme.yellow).toBeDefined();
    expect(theme.blue).toBeDefined();
    expect(theme.magenta).toBeDefined();
    expect(theme.cyan).toBeDefined();
    expect(theme.white).toBeDefined();
  });

  it("generates light theme colors for light-modern", () => {
    const theme = TerminalThemeService.getTheme("light-modern");
    expect(theme.background).toBe("#F8F8F8");
    expect(theme.cursor).toBe("#005FB8");
    expect(theme.foreground).toBe("#3B3B3B");
  });

  it("handles legacy theme migration seamlessly", () => {
    const darkTheme = TerminalThemeService.getTheme("github-dark");
    expect(darkTheme.background).toBeDefined();

    const lightTheme = TerminalThemeService.getTheme("light");
    expect(lightTheme.background).toBeDefined();
  });
});
