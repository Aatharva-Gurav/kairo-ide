import type { User, Session } from "@supabase/supabase-js";

export type AuthStatus =
  | "loading"
  | "unauthenticated"
  | "onboarding-required"
  | "authenticated"
  | "offline";

export interface UserProfile {
  id: string;
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  preferredLanguages: string[];
  themePreference: string;
  editorPreferences: Record<string, unknown>;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthState {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  status: AuthStatus;
  isLoading: boolean;
  isAuthenticated: boolean;
  isOffline: boolean;
  error: string | null;
}

export interface SignUpData {
  email: string;
  password: string;
  fullName: string;
}

export interface SignInData {
  email: string;
  password: string;
}

export interface OnboardingData {
  displayName?: string;
  username?: string;
  preferredLanguages?: string[];
  themePreference?: string;
  editorPreferences?: {
    tabSize?: number;
    wordWrap?: "on" | "off" | "wordWrapColumn" | "bounded";
    minimap?: boolean;
  };
}

