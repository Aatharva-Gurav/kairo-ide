import { describe, it, expect } from "vitest";
import { ContextBudgetManager } from "../context/budget-manager";
import type { ContextItem } from "../context/types";

describe("ContextBudgetManager", () => {
  it("assembles items within budget without truncation", () => {
    const manager = new ContextBudgetManager({ maxTotalTokens: 1000 });
    const items: ContextItem[] = [
      {
        id: "item1",
        section: "active_editor",
        title: "Active Editor: src/index.ts",
        content: "const a = 1;",
        tokenCount: 10,
        priority: 90,
      },
      {
        id: "item2",
        section: "diagnostics",
        title: "Diagnostics",
        content: "No problems found.",
        tokenCount: 10,
        priority: 80,
      },
    ];

    const assembled = manager.assembleContext(items);
    expect(assembled.truncated).toBe(false);
    expect(assembled.items.length).toBe(2);
    expect(assembled.formattedPrompt).toContain("# Workspace Context");
    expect(assembled.formattedPrompt).toContain("## Active Editor: src/index.ts");
    expect(assembled.formattedPrompt).toContain("## Diagnostics");
  });

  it("deduplicates multiple items referencing the same file, keeping higher priority", () => {
    const manager = new ContextBudgetManager({ maxTotalTokens: 2000 });
    const items: ContextItem[] = [
      {
        id: "mention-file",
        section: "mentions",
        title: "File: src/index.ts",
        filePath: "src/index.ts",
        content: "old file content",
        tokenCount: 15,
        priority: 80,
      },
      {
        id: "active-editor",
        section: "active_editor",
        title: "Active Editor: src/index.ts (Unsaved)",
        filePath: "src/index.ts",
        content: "newer unsaved buffer content",
        tokenCount: 20,
        priority: 95,
      },
    ];

    const assembled = manager.assembleContext(items);
    expect(assembled.items.length).toBe(1);
    expect(assembled.items[0].content).toContain("newer unsaved buffer content");
    expect(assembled.items[0].priority).toBe(95);
  });

  it("truncates items that exceed the remaining token budget with omission notice", () => {
    const manager = new ContextBudgetManager({
      maxTotalTokens: 100,
      sectionBudgets: { active_editor: 80 },
    });

    const lines = Array.from({ length: 100 }, (_, i) => `const line${i} = "data_${i}";`);
    const longContent = lines.join("\n");

    const items: ContextItem[] = [
      {
        id: "large-item",
        section: "active_editor",
        title: "Large File",
        content: longContent,
        tokenCount: 1500, // Exceeds 80 tokens
        priority: 90,
      },
    ];

    const assembled = manager.assembleContext(items);
    expect(assembled.truncated).toBe(true);
    expect(assembled.items.length).toBe(1);
    expect(assembled.items[0].content).toContain("lines omitted due to context budget");
  });

  it("respects section priorities when total budget is constrained", () => {
    const manager = new ContextBudgetManager({
      maxTotalTokens: 50,
      sectionBudgets: {
        instructions: 40,
        outline: 40,
      },
    });

    const items: ContextItem[] = [
      {
        id: "instructions-1",
        section: "instructions",
        title: "Project Rules",
        content: "Must follow code guidelines.",
        tokenCount: 20,
        priority: 100,
      },
      {
        id: "outline-1",
        section: "outline",
        title: "Codebase Outline",
        content: "Directory tree listing...",
        tokenCount: 45,
        priority: 60,
      },
    ];

    const assembled = manager.assembleContext(items);
    // Instructions (higher priority) should be included first
    expect(assembled.items.some((i) => i.section === "instructions")).toBe(true);
    expect(assembled.truncated).toBe(true);
  });
});
