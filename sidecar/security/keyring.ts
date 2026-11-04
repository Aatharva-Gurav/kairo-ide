import os from "node:os";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import type { IOsSecretStore } from "./types";
import { Logger } from "../utils/logger";

const execFileAsync = promisify(execFile);

/**
 * Windows DPAPI-backed secret store.
 * Protects secrets with the logged-in Windows user's credentials using
 * System.Security.Cryptography.ProtectedData (CurrentUser scope).
 * Secrets are passed via stdin to prevent command-line inspection.
 */
export class WindowsDpapiSecretStore implements IOsSecretStore {
  private readonly logger: Logger;

  constructor(logger?: Logger) {
    this.logger = (logger ?? new Logger("sidecar")).child("dpapi-store");
  }

  public getStoreName(): string {
    return "Windows DPAPI (CurrentUser)";
  }

  public async isAvailable(): Promise<boolean> {
    if (process.platform !== "win32") return false;
    try {
      const probe = await this.executePowershell(
        "Add-Type -AssemblyName System.Security; [System.Security.Cryptography.ProtectedData] | Out-Null; Write-Output 'OK'"
      );
      return probe.trim() === "OK";
    } catch {
      return false;
    }
  }

  public async setSecret(_service: string, _account: string, secret: string): Promise<void> {
    // We encrypt the secret using DPAPI and return base64
    // We store the encrypted base64 in memory or file cache, or return it
    // Note: For DPAPI, we encrypt the input payload directly.
    const psScript = `
Add-Type -AssemblyName System.Security
$inputStr = [Console]::In.ReadToEnd()
$bytes = [System.Text.Encoding]::UTF8.GetBytes($inputStr)
$enc = [System.Security.Cryptography.ProtectedData]::Protect(
  $bytes,
  $null,
  [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
[Convert]::ToBase64String($enc)
    `.trim();

    const encrypted = await this.pipeToPowershell(psScript, secret);
    // Write the encrypted token to a local secure key cache in user's profile
    await this.persistDpapiPayload(_service, _account, encrypted.trim());
  }

  public async getSecret(_service: string, _account: string): Promise<string | null> {
    const encrypted = await this.readDpapiPayload(_service, _account);
    if (!encrypted) return null;

    const psScript = `
Add-Type -AssemblyName System.Security
$b64 = [Console]::In.ReadToEnd().Trim()
if ([string]::IsNullOrWhiteSpace($b64)) { exit 1 }
$enc = [Convert]::FromBase64String($b64)
$dec = [System.Security.Cryptography.ProtectedData]::Unprotect(
  $enc,
  $null,
  [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)
[System.Text.Encoding]::UTF8.GetString($dec)
    `.trim();

    try {
      const decrypted = await this.pipeToPowershell(psScript, encrypted);
      return decrypted;
    } catch (err) {
      this.logger.error("Failed to unprotect DPAPI secret", err);
      return null;
    }
  }

  public async deleteSecret(_service: string, _account: string): Promise<boolean> {
    return this.removeDpapiPayload(_service, _account);
  }

  private getDpapiFilePath(service: string, account: string): string {
    const homeDir = os.homedir();
    const cleanService = service.replace(/[^a-zA-Z0-9_-]/g, "_");
    const cleanAccount = account.replace(/[^a-zA-Z0-9_-]/g, "_");
    const fs = require("node:fs");
    const path = require("node:path");
    const dir = path.join(homeDir, ".kairo", "security");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return path.join(dir, `${cleanService}.${cleanAccount}.dpapi`);
  }

  private async persistDpapiPayload(service: string, account: string, payload: string): Promise<void> {
    const fs = await import("node:fs/promises");
    const filePath = this.getDpapiFilePath(service, account);
    await fs.writeFile(filePath, payload, { encoding: "utf8" });
  }

  private async readDpapiPayload(service: string, account: string): Promise<string | null> {
    const fs = await import("node:fs/promises");
    const filePath = this.getDpapiFilePath(service, account);
    try {
      const data = await fs.readFile(filePath, "utf8");
      return data.trim();
    } catch {
      return null;
    }
  }

  private async removeDpapiPayload(service: string, account: string): Promise<boolean> {
    const fs = await import("node:fs/promises");
    const filePath = this.getDpapiFilePath(service, account);
    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private executePowershell(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", script],
        { encoding: "utf8" },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
          } else {
            resolve(stdout);
          }
        }
      );
    });
  }

  private pipeToPowershell(script: string, inputData: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (data) => {
        stdout += data.toString("utf8");
      });

      child.stderr.on("data", (data) => {
        stderr += data.toString("utf8");
      });

      child.on("close", (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`PowerShell process failed with code ${code}: ${stderr}`));
        }
      });

      child.stdin.write(inputData);
      child.stdin.end();
    });
  }
}

/**
 * macOS Keychain secret store.
 * Interacts with /usr/bin/security CLI.
 */
export class MacosKeychainSecretStore implements IOsSecretStore {
  public getStoreName(): string {
    return "macOS Keychain";
  }

  public async isAvailable(): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    try {
      const fs = await import("node:fs");
      return fs.existsSync("/usr/bin/security");
    } catch {
      return false;
    }
  }

  public async setSecret(service: string, account: string, secret: string): Promise<void> {
    await execFileAsync("/usr/bin/security", [
      "add-generic-password",
      "-U",
      "-s",
      service,
      "-a",
      account,
      "-w",
      secret,
    ]);
  }

  public async getSecret(service: string, account: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("/usr/bin/security", [
        "find-generic-password",
        "-s",
        service,
        "-a",
        account,
        "-w",
      ]);
      return stdout.trim();
    } catch {
      return null;
    }
  }

  public async deleteSecret(service: string, account: string): Promise<boolean> {
    try {
      await execFileAsync("/usr/bin/security", [
        "delete-generic-password",
        "-s",
        service,
        "-a",
        account,
      ]);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Linux Secret Service store via secret-tool CLI.
 */
export class LinuxSecretServiceStore implements IOsSecretStore {
  public getStoreName(): string {
    return "Linux Secret Service (secret-tool)";
  }

  public async isAvailable(): Promise<boolean> {
    if (process.platform !== "linux") return false;
    try {
      await execFileAsync("which", ["secret-tool"]);
      return true;
    } catch {
      return false;
    }
  }

  public async setSecret(service: string, account: string, secret: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn("secret-tool", ["store", "--label=Kairo IDE", "service", service, "account", account], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      child.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`secret-tool exited with code ${code}`));
      });
      child.stdin.write(secret);
      child.stdin.end();
    });
  }

  public async getSecret(service: string, account: string): Promise<string | null> {
    try {
      const { stdout } = await execFileAsync("secret-tool", ["lookup", "service", service, "account", account]);
      return stdout.trim();
    } catch {
      return null;
    }
  }

  public async deleteSecret(service: string, account: string): Promise<boolean> {
    try {
      await execFileAsync("secret-tool", ["clear", "service", service, "account", account]);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * In-memory fallback secret store for CI and automated unit testing.
 */
export class MemorySecretStore implements IOsSecretStore {
  private readonly storage = new Map<string, string>();

  public getStoreName(): string {
    return "In-Memory Test Store";
  }

  public async isAvailable(): Promise<boolean> {
    return true;
  }

  public async setSecret(service: string, account: string, secret: string): Promise<void> {
    this.storage.set(`${service}:${account}`, secret);
  }

  public async getSecret(service: string, account: string): Promise<string | null> {
    return this.storage.get(`${service}:${account}`) ?? null;
  }

  public async deleteSecret(service: string, account: string): Promise<boolean> {
    return this.storage.delete(`${service}:${account}`);
  }

  public clear(): void {
    this.storage.clear();
  }
}

/**
 * Resolves the appropriate OS secret store based on current platform and environment.
 */
export async function resolveOsSecretStore(logger?: Logger): Promise<IOsSecretStore> {
  // If an explicit test vault key or environment override is provided
  if (process.env.KAIRO_USE_MEMORY_STORE === "true") {
    return new MemorySecretStore();
  }

  if (process.platform === "win32") {
    const store = new WindowsDpapiSecretStore(logger);
    if (await store.isAvailable()) {
      return store;
    }
  } else if (process.platform === "darwin") {
    const store = new MacosKeychainSecretStore();
    if (await store.isAvailable()) {
      return store;
    }
  } else if (process.platform === "linux") {
    const store = new LinuxSecretServiceStore();
    if (await store.isAvailable()) {
      return store;
    }
  }

  // Fallback for headless environments or when native tool is unavailable
  return new MemorySecretStore();
}
