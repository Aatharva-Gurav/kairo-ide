import { getSupabaseClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { UserProfile, OnboardingData } from "../types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

function mapProfileRow(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    bio: row.bio,
    preferredLanguages: row.preferred_languages ?? [],
    themePreference: row.theme_preference ?? "light",
    editorPreferences: (row.editor_preferences as Record<string, unknown>) ?? {},
    onboardingCompleted: Boolean(row.onboarding_completed),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ProfileService {
  /**
   * Retrieves the profile for the given user ID.
   */
  static async getProfile(userId: string): Promise<UserProfile | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from("profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.warn("[ProfileService] Error fetching profile:", error.message);
        return null;
      }

      return data ? mapProfileRow(data) : null;
    } catch (err) {
      console.warn("[ProfileService] getProfile exception:", err);
      return null;
    }
  }

  /**
   * Retrieves or safely creates a profile if not already present.
   */
  static async getOrCreateProfile(
    userId: string,
    fallbackData?: { displayName?: string; email?: string }
  ): Promise<UserProfile> {
    const existing = await this.getProfile(userId);
    if (existing) {
      return existing;
    }

    const client = getSupabaseClient();
    if (!client) {
      return this.getOfflineProfile();
    }

    const displayName =
      fallbackData?.displayName ||
      (fallbackData?.email ? fallbackData.email.split("@")[0] : "Developer");

    const username = fallbackData?.email
      ? fallbackData.email.split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").toLowerCase()
      : `user_${userId.slice(0, 6)}`;

    try {
      const { data, error } = await client
        .from("profiles")
        .insert({
          user_id: userId,
          display_name: displayName,
          username: username,
          theme_preference: "light",
          onboarding_completed: false,
        })
        .select()
        .single();

      if (error || !data) {
        console.warn("[ProfileService] Failed to create profile fallback:", error?.message);
        return {
          id: userId,
          userId,
          username,
          displayName,
          avatarUrl: null,
          bio: null,
          preferredLanguages: [],
          themePreference: "light",
          editorPreferences: {},
          onboardingCompleted: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      return mapProfileRow(data);
    } catch {
      return {
        id: userId,
        userId,
        username,
        displayName,
        avatarUrl: null,
        bio: null,
        preferredLanguages: [],
        themePreference: "light",
        editorPreferences: {},
        onboardingCompleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Updates specific fields of an existing user profile.
   */
  static async updateProfile(
    userId: string,
    updates: Partial<{
      displayName: string | null;
      username: string | null;
      avatarUrl: string | null;
      bio: string | null;
      preferredLanguages: string[];
      themePreference: string;
      editorPreferences: Record<string, unknown>;
    }>
  ): Promise<UserProfile> {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error("Supabase is not configured.");
    }

    const payload: Database["public"]["Tables"]["profiles"]["Update"] = {
      updated_at: new Date().toISOString(),
    };

    if (updates.displayName !== undefined) payload.display_name = updates.displayName;
    if (updates.username !== undefined) payload.username = updates.username;
    if (updates.avatarUrl !== undefined) payload.avatar_url = updates.avatarUrl;
    if (updates.bio !== undefined) payload.bio = updates.bio;
    if (updates.preferredLanguages !== undefined) payload.preferred_languages = updates.preferredLanguages;
    if (updates.themePreference !== undefined) payload.theme_preference = updates.themePreference;
    if (updates.editorPreferences !== undefined) payload.editor_preferences = updates.editorPreferences as Json;

    const { data, error } = await client
      .from("profiles")
      .update(payload)
      .eq("user_id", userId)
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message || "Failed to update profile.");
    }

    return mapProfileRow(data);
  }

  /**
   * Completes the onboarding flow, saving user choices and setting onboarding_completed to true.
   */
  static async completeOnboarding(userId: string, data: OnboardingData): Promise<UserProfile> {
    const client = getSupabaseClient();
    if (!client) {
      // In offline mode, return a completed offline profile
      const offline = this.getOfflineProfile();
      offline.displayName = data.displayName || offline.displayName;
      offline.themePreference = data.themePreference || "light";
      offline.onboardingCompleted = true;
      return offline;
    }

    const payload: Database["public"]["Tables"]["profiles"]["Update"] = {
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    };

    if (data.displayName) payload.display_name = data.displayName;
    if (data.username) payload.username = data.username;
    if (data.preferredLanguages) payload.preferred_languages = data.preferredLanguages;
    if (data.themePreference) payload.theme_preference = data.themePreference;
    if (data.editorPreferences) payload.editor_preferences = data.editorPreferences as Json;

    const { data: updated, error } = await client
      .from("profiles")
      .update(payload)
      .eq("user_id", userId)
      .select()
      .single();

    if (error || !updated) {
      throw new Error(error?.message || "Failed to complete onboarding.");
    }

    return mapProfileRow(updated);
  }

  /**
   * Returns a local developer profile when in Offline Mode.
   */
  static getOfflineProfile(): UserProfile {
    return {
      id: "offline-user",
      userId: "offline-user",
      username: "local_dev",
      displayName: "Local Developer",
      avatarUrl: null,
      bio: "Offline developer mode",
      preferredLanguages: ["TypeScript", "Rust"],
      themePreference: "light",
      editorPreferences: {},
      onboardingCompleted: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}
