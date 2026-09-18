import { Command, CommandCategory } from "./types";

export type CommandRegistryListener = () => void;

export class CommandRegistry {
  private static commands = new Map<string, Command>();
  private static executingCommands = new Set<string>();
  private static listeners = new Set<CommandRegistryListener>();

  /**
   * Registers a command into the global registry.
   * Returns an unregister cleanup function.
   */
  static register(command: Command): () => void {
    this.commands.set(command.id, command);
    this.notifyListeners();

    return () => {
      this.unregister(command.id);
    };
  }

  /**
   * Unregisters a command by ID.
   */
  static unregister(commandId: string): void {
    if (this.commands.has(commandId)) {
      this.commands.delete(commandId);
      this.notifyListeners();
    }
  }

  /**
   * Retrieves a command by ID.
   */
  static get(commandId: string): Command | undefined {
    return this.commands.get(commandId);
  }

  /**
   * Gets all registered commands.
   */
  static getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  /**
   * Gets all commands belonging to a specific category.
   */
  static getByCategory(category: CommandCategory): Command[] {
    return Array.from(this.commands.values()).filter((c) => c.category === category);
  }

  /**
   * Checks whether a command is currently enabled.
   */
  static isEnabled(commandId: string): boolean {
    const cmd = this.commands.get(commandId);
    if (!cmd) return false;
    if (typeof cmd.enabled === "function") {
      try {
        return cmd.enabled();
      } catch (err) {
        console.warn(`[CommandRegistry] Error in enabled() predicate for "${commandId}":`, err);
        return false;
      }
    }
    return true;
  }

  /**
   * Executes a command safely by ID.
   * Handles async commands, catches errors, respects disabled state, and prevents concurrent duplicate execution.
   */
  static async execute(commandId: string): Promise<boolean> {
    const cmd = this.commands.get(commandId);
    if (!cmd) {
      console.warn(`[CommandRegistry] Command not found: "${commandId}"`);
      return false;
    }

    if (!this.isEnabled(commandId)) {
      console.info(`[CommandRegistry] Command "${commandId}" is currently disabled.`);
      return false;
    }

    if (this.executingCommands.has(commandId)) {
      console.info(`[CommandRegistry] Command "${commandId}" is already executing. Ignoring duplicate invocation.`);
      return false;
    }

    this.executingCommands.add(commandId);

    try {
      const result = cmd.execute();
      if (result instanceof Promise) {
        await result;
      }
      return true;
    } catch (error) {
      console.error(`[CommandRegistry] Error executing command "${commandId}":`, error);
      return false;
    } finally {
      this.executingCommands.delete(commandId);
    }
  }

  /**
   * Subscribes to command registration changes.
   */
  static subscribe(listener: CommandRegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Clears all registered commands (useful in test suites).
   */
  static clear(): void {
    this.commands.clear();
    this.executingCommands.clear();
    this.notifyListeners();
  }

  private static notifyListeners(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        console.error("[CommandRegistry] Error in listener:", err);
      }
    });
  }
}

