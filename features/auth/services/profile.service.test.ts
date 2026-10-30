import { describe, it, expect, beforeEach, vi } from "vitest";
import { ProfileService } from "./profile.service";

describe("ProfileService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getOfflineProfile", () => {
    it("returns a valid local developer profile", () => {
      const profile = ProfileService.getOfflineProfile();
      expect(profile.id).toBe("offline-user");
      expect(profile.userId).toBe("offline-user");
      expect(profile.displayName).toBe("Local Developer");
      expect(profile.themePreference).toBe("light");
      expect(profile.onboardingCompleted).toBe(true);
      expect(profile.preferredLanguages).toContain("TypeScript");
    });
  });

  describe("completeOnboarding offline fallback", () => {
    it("returns updated profile with customized preferences when offline", async () => {
      const result = await ProfileService.completeOnboarding("offline-user", {
        displayName: "Ada Lovelace",
        themePreference: "tokyo-night",
        preferredLanguages: ["Rust", "Python"],
      });

      expect(result.displayName).toBe("Ada Lovelace");
      expect(result.themePreference).toBe("tokyo-night");
      expect(result.onboardingCompleted).toBe(true);
    });
  });

  describe("getOrCreateProfile fallback", () => {
    it("provides fallback profile when client is not configured", async () => {
      const profile = await ProfileService.getOrCreateProfile("user-123", {
        displayName: "Grace Hopper",
        email: "grace@navy.mil",
      });

      expect(profile.id).toBe("offline-user");
      expect(profile.displayName).toBe("Local Developer");
    });
  });
});

