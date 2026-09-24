import { getSupabaseClient } from "@/lib/supabase/client";
import type { User, Session, AuthChangeEvent } from "@supabase/supabase-js";
import type { SignInData, SignUpData } from "../types";
import { formatAuthError } from "./auth-error";

const OFFLINE_MODE_STORAGE_KEY = "kairo:auth:offline_mode";

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }
  return null;
}

export class AuthService {
  /**
   * Retrieves the current Supabase session.
   */
  static async getSession(): Promise<Session | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const { data, error } = await client.auth.getSession();
      if (error) {
        console.warn("[AuthService] getSession warning:", error.message);
        return null;
      }
      return data.session;
    } catch (err) {
      console.warn("[AuthService] Failed to retrieve session:", err);
      return null;
    }
  }

  /**
   * Retrieves the currently authenticated Supabase user.
   */
  static async getUser(): Promise<User | null> {
    const client = getSupabaseClient();
    if (!client) return null;

    try {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      return data.user;
    } catch {
      return null;
    }
  }

  /**
   * Signs in an existing user with email and password.
   */
  static async signIn(credentials: SignInData): Promise<{ user: User; session: Session }> {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error("Supabase is not configured. Please check your environment variables or continue in Offline Mode.");
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: credentials.email.trim(),
      password: credentials.password,
    });

    if (error || !data.user || !data.session) {
      throw new Error(formatAuthError(error));
    }

    // Clear offline flag upon successful online login
    this.setOfflineMode(false);

    return { user: data.user, session: data.session };
  }

  /**
   * Creates a new user account with email, password, and metadata.
   */
  static async signUp(data: SignUpData): Promise<{ user: User | null; session: Session | null }> {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error("Supabase is not configured. Please check your environment variables or continue in Offline Mode.");
    }

    const { data: authData, error } = await client.auth.signUp({
      email: data.email.trim(),
      password: data.password,
      options: {
        data: {
          full_name: data.fullName.trim(),
          name: data.fullName.trim(),
        },
      },
    });

    if (error) {
      throw new Error(formatAuthError(error));
    }

    this.setOfflineMode(false);

    return { user: authData.user, session: authData.session };
  }

  /**
   * Signs out the current user and clears session tokens.
   */
  static async signOut(): Promise<void> {
    const client = getSupabaseClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch (err) {
        console.warn("[AuthService] Error during signOut:", err);
      }
    }
    this.setOfflineMode(false);
  }

  /**
   * Requests a password reset email from Supabase.
   */
  static async resetPassword(email: string): Promise<void> {
    const client = getSupabaseClient();
    if (!client) {
      throw new Error("Supabase is not configured.");
    }

    const { error } = await client.auth.resetPasswordForEmail(email.trim());
    if (error) {
      throw new Error(formatAuthError(error));
    }
  }

  /**
   * Subscribes to Supabase authentication state changes.
   */
  static onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void
  ): { unsubscribe: () => void } {
    const client = getSupabaseClient();
    if (!client) {
      return { unsubscribe: () => {} };
    }

    const { data } = client.auth.onAuthStateChange(callback);
    return {
      unsubscribe: () => data.subscription.unsubscribe(),
    };
  }

  /**
   * Checks if Offline Mode is currently enabled.
   */
  static isOfflineMode(): boolean {
    const storage = getStorage();
    if (!storage) return false;
    try {
      return storage.getItem(OFFLINE_MODE_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  }

  /**
   * Enables or disables Offline Mode.
   */
  static setOfflineMode(enabled: boolean): void {
    const storage = getStorage();
    if (!storage) return;
    try {
      if (enabled) {
        storage.setItem(OFFLINE_MODE_STORAGE_KEY, "true");
      } else {
        storage.removeItem(OFFLINE_MODE_STORAGE_KEY);
      }
    } catch {
      // Ignored in non-browser environments
    }
  }
}
