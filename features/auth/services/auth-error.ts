import type { AuthError as SupabaseAuthError } from "@supabase/supabase-js";

/**
 * Maps Supabase technical errors, network timeouts, and HTTP errors
 * to clear, safe, user-friendly messages.
 */
export function formatAuthError(error: unknown): string {
  if (!error) return "An unexpected error occurred. Please try again.";

  if (typeof error === "string") {
    return error;
  }

  const err = error as Partial<SupabaseAuthError> & { message?: string; status?: number };
  const message = (err.message || "").toLowerCase();

  if (message.includes("invalid login credentials") || message.includes("invalid_credentials")) {
    return "Incorrect email or password. Please verify your credentials.";
  }

  if (message.includes("user already registered") || message.includes("user_already_exists")) {
    return "An account with this email address already exists. Please sign in instead.";
  }

  if (message.includes("email not confirmed") || message.includes("unconfirmed")) {
    return "Your email address has not been confirmed. Please check your inbox for the confirmation link.";
  }

  if (message.includes("password should be at least") || message.includes("weak_password")) {
    return "Password is too weak. Please use at least 8 characters.";
  }

  if (message.includes("rate limit") || message.includes("too many requests") || err.status === 429) {
    return "Too many attempts in a short time. Please wait a moment before trying again.";
  }

  if (
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("connection")
  ) {
    return "Unable to reach authentication service. Please check your internet connection or use Offline Mode.";
  }

  return err.message || "Authentication failed. Please try again.";
}

