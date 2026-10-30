import { describe, it, expect, beforeEach, vi } from "vitest";
import { AuthService } from "./auth.service";
import { formatAuthError } from "./auth-error";

// Mock localStorage
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
};

Object.defineProperty(global, "localStorage", {
  value: localStorageMock,
  writable: true,
});

describe("AuthService", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  describe("Offline Mode", () => {
    it("defaults to offline mode false when unset", () => {
      expect(AuthService.isOfflineMode()).toBe(false);
    });

    it("enables and persists offline mode", () => {
      AuthService.setOfflineMode(true);
      expect(AuthService.isOfflineMode()).toBe(true);
      expect(store.get("kairo:auth:offline_mode")).toBe("true");
    });

    it("disables offline mode cleanly", () => {
      AuthService.setOfflineMode(true);
      expect(AuthService.isOfflineMode()).toBe(true);

      AuthService.setOfflineMode(false);
      expect(AuthService.isOfflineMode()).toBe(false);
      expect(store.get("kairo:auth:offline_mode")).toBeUndefined();
    });
  });

  describe("formatAuthError", () => {
    it("formats invalid credentials error gracefully", () => {
      const err = { message: "Invalid login credentials" };
      const formatted = formatAuthError(err);
      expect(formatted).toContain("Incorrect email or password");
    });

    it("formats user already exists error", () => {
      const err = { message: "User already registered" };
      const formatted = formatAuthError(err);
      expect(formatted).toContain("An account with this email address already exists");
    });

    it("formats rate limit error", () => {
      const err = { message: "Rate limit exceeded", status: 429 };
      const formatted = formatAuthError(err);
      expect(formatted).toContain("Too many attempts");
    });

    it("formats network failure error", () => {
      const err = { message: "Failed to fetch" };
      const formatted = formatAuthError(err);
      expect(formatted).toContain("Unable to reach authentication service");
    });

    it("falls back to generic error message", () => {
      expect(formatAuthError(null)).toBe("An unexpected error occurred. Please try again.");
    });
  });
});

