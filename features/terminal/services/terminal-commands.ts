import { CommandRegistry } from "@/features/commands/command-registry";
import { ideEvents } from "@/lib/events";

/**
 * Registers all integrated terminal commands into the central CommandRegistry.
 * Returns an unregister cleanup function.
 */
export function registerTerminalCommands(): () => void {
  const unsubs = [
    CommandRegistry.register({
      id: "workbench.action.terminal.toggleTerminal",
      title: "Terminal: Toggle Integrated Terminal",
      description: "Open or close the integrated terminal panel",
      category: "workbench",
      keywords: ["terminal", "bash", "powershell", "cmd", "pty", "console", "shell", "toggle"],
      execute: () => {
        ideEvents.emit("terminal:toggle");
      },
    }),
    CommandRegistry.register({
      id: "workbench.action.terminal.new",
      title: "Terminal: Create New Terminal",
      description: "Spawn a new terminal session in the bottom panel",
      category: "workbench",
      keywords: ["terminal", "new", "create", "shell", "bash", "powershell"],
      execute: () => {
        ideEvents.emit("terminal:new");
      },
    }),
    CommandRegistry.register({
      id: "workbench.action.terminal.close",
      title: "Terminal: Close Terminal Session",
      description: "Close and terminate the active terminal session",
      category: "workbench",
      keywords: ["terminal", "close", "kill", "exit", "terminate"],
      execute: () => {
        ideEvents.emit("terminal:close");
      },
    }),
    CommandRegistry.register({
      id: "workbench.action.terminal.focus",
      title: "Terminal: Focus Terminal",
      description: "Focus the active integrated terminal canvas",
      category: "workbench",
      keywords: ["terminal", "focus", "select"],
      execute: () => {
        ideEvents.emit("terminal:focus");
      },
    }),
    CommandRegistry.register({
      id: "workbench.action.terminal.focusNext",
      title: "Terminal: Focus Next Terminal",
      description: "Switch focus to the next terminal session",
      category: "workbench",
      keywords: ["terminal", "next", "switch", "cycle"],
      execute: () => {
        ideEvents.emit("terminal:focus-next");
      },
    }),
    CommandRegistry.register({
      id: "workbench.action.terminal.focusPrevious",
      title: "Terminal: Focus Previous Terminal",
      description: "Switch focus to the previous terminal session",
      category: "workbench",
      keywords: ["terminal", "previous", "switch", "cycle", "prev"],
      execute: () => {
        ideEvents.emit("terminal:focus-previous");
      },
    }),
    CommandRegistry.register({
      id: "workbench.action.terminal.split",
      title: "Terminal: Split Terminal",
      description: "Split the current terminal session side by side",
      category: "workbench",
      keywords: ["terminal", "split", "horizontal", "vertical", "columns"],
      execute: () => {
        ideEvents.emit("terminal:split", "horizontal");
      },
    }),
    CommandRegistry.register({
      id: "workbench.action.terminal.toggleMaximize",
      title: "Terminal: Toggle Maximize Panel",
      description: "Maximize or restore the terminal bottom panel",
      category: "workbench",
      keywords: ["terminal", "maximize", "restore", "size", "full"],
      execute: () => {
        ideEvents.emit("terminal:maximize");
      },
    }),
    CommandRegistry.register({
      id: "workbench.action.terminal.clear",
      title: "Terminal: Clear Terminal",
      description: "Clear active terminal viewport screen",
      category: "workbench",
      keywords: ["terminal", "clear", "cls", "reset"],
      execute: () => {
        ideEvents.emit("terminal:clear");
      },
    }),
    CommandRegistry.register({
      id: "workbench.action.terminal.find",
      title: "Terminal: Find in Terminal",
      description: "Open the terminal in-viewport find search bar",
      category: "workbench",
      keywords: ["terminal", "find", "search", "query"],
      execute: () => {
        ideEvents.emit("terminal:find");
      },
    }),
  ];

  return () => {
    unsubs.forEach((u) => u());
  };
}
