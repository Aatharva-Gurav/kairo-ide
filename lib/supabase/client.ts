import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Database } from "./database.types";

/**
 * Validates and retrieves Supabase environment configuration.
 * Returns null if required variables are missing or unconfigured.
 */
export function getSupabaseConfig(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return null;
  }

  // Check placeholder values
  if (
    url.includes("your-project.supabase.co") ||
    anonKey.includes("your-anon-key-here")
  ) {
    return null;
  }

  try {
    new URL(url);
  } catch {
    console.warn("[Supabase] NEXT_PUBLIC_SUPABASE_URL is not a valid URL:", url);
    return null;
  }

  return { url, anonKey };
}

/**
 * Checks whether Supabase is configured with valid credentials.
 */
export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig() !== null;
}

let supabaseInstance: SupabaseClient<Database> | null = null;

/**
 * Returns the centralized Supabase client instance.
 * Returns null if Supabase is not configured (allowing graceful offline fallback).
 */
export function getSupabaseClient(): SupabaseClient<Database> | null {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const config = getSupabaseConfig();
  if (!config) {
    return null;
  }

  supabaseInstance = createClient<Database>(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== "undefined" ? window.localStorage : undefined,
    },
  });

  return supabaseInstance;
}

/**
 * Convenience export of the client instance (can be null if unconfigured).
 */
export const supabase = typeof window !== "undefined" ? getSupabaseClient() : null;

