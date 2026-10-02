"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { AuthService } from "./services/auth.service";
import { ProfileService } from "./services/profile.service";
import { SettingsService } from "@/features/settings/services/settings.service";
import type {
  AuthStatus,
  UserProfile,
  SignInData,
  SignUpData,
  OnboardingData,
} from "./types";

export interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: UserProfile | null;
  status: AuthStatus;
  isLoading: boolean;
  isAuthenticated: boolean;
  isOffline: boolean;
  error: string | null;

  login: (credentials: SignInData) => Promise<void>;
  signup: (data: SignUpData) => Promise<{ requiresVerification: boolean }>;
  logout: () => Promise<void>;
  enterOfflineMode: () => void;
  exitOfflineMode: () => void;
  updateProfile: (updates: Partial<UserProfile>) => Promise<UserProfile>;
  completeOnboarding: (data: OnboardingData) => Promise<UserProfile>;
  resetPassword: (email: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  /**
   * Initializes the session, profile, and user-scoped settings on application startup.
   */
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      // 1. Check for explicit offline mode
      if (AuthService.isOfflineMode()) {
        const offlineProfile = ProfileService.getOfflineProfile();
        if (!isMounted) return;
        setUser(null);
        setSession(null);
        setProfile(offlineProfile);
        SettingsService.setUser("local");
        setStatus("offline");
        return;
      }

      // 2. Check if Supabase credentials are configured
      if (!isSupabaseConfigured()) {
        console.info("[Auth] Supabase is not configured. Falling back to Offline Mode.");
        const offlineProfile = ProfileService.getOfflineProfile();
        if (!isMounted) return;
        setUser(null);
        setSession(null);
        setProfile(offlineProfile);
        SettingsService.setUser("local");
        setStatus("offline");
        return;
      }

      try {
        const activeSession = await AuthService.getSession();
        if (!isMounted) return;

        if (!activeSession || !activeSession.user) {
          setUser(null);
          setSession(null);
          setProfile(null);
          SettingsService.setUser(null);
          setStatus("unauthenticated");
          return;
        }

        setSession(activeSession);
        setUser(activeSession.user);

        // Load or recover profile
        const userProfile = await ProfileService.getOrCreateProfile(activeSession.user.id, {
          displayName:
            (activeSession.user.user_metadata?.full_name as string) ||
            (activeSession.user.user_metadata?.name as string),
          email: activeSession.user.email,
        });

        if (!isMounted) return;

        setProfile(userProfile);
        SettingsService.setUser(activeSession.user.id);

        if (userProfile.onboardingCompleted) {
          setStatus("authenticated");
        } else {
          setStatus("onboarding-required");
        }
      } catch (err) {
        if (!isMounted) return;
        console.warn("[Auth] Failed to initialize session:", err);
        setUser(null);
        setSession(null);
        setProfile(null);
        SettingsService.setUser(null);
        setStatus("unauthenticated");
      }
    };

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Subscribe to Supabase auth events
  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const { unsubscribe } = AuthService.onAuthStateChange(async (event, newSession) => {
      if (AuthService.isOfflineMode()) return;

      if (event === "SIGNED_OUT" || !newSession?.user) {
        setUser(null);
        setSession(null);
        setProfile(null);
        SettingsService.setUser(null);
        setStatus("unauthenticated");
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setSession(newSession);
        setUser(newSession.user);
        SettingsService.setUser(newSession.user.id);

        try {
          const userProfile = await ProfileService.getOrCreateProfile(newSession.user.id, {
            displayName:
              (newSession.user.user_metadata?.full_name as string) ||
              (newSession.user.user_metadata?.name as string),
            email: newSession.user.email,
          });
          setProfile(userProfile);
          if (userProfile.onboardingCompleted) {
            setStatus("authenticated");
          } else {
            setStatus("onboarding-required");
          }
        } catch {
          // If profile fetch fails temporarily, keep session and prompt onboarding
          setStatus("onboarding-required");
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (credentials: SignInData) => {
    setError(null);
    const { user: authedUser, session: newSession } = await AuthService.signIn(credentials);
    setUser(authedUser);
    setSession(newSession);
    SettingsService.setUser(authedUser.id);

    const userProfile = await ProfileService.getOrCreateProfile(authedUser.id, {
      displayName: authedUser.user_metadata?.full_name,
      email: authedUser.email,
    });

    setProfile(userProfile);

    // Apply profile theme preference if present
    if (userProfile.themePreference) {
      SettingsService.updateSetting("appearance.theme", userProfile.themePreference, "user");
    }

    if (userProfile.onboardingCompleted) {
      setStatus("authenticated");
    } else {
      setStatus("onboarding-required");
    }
  }, []);

  const signup = useCallback(async (data: SignUpData) => {
    setError(null);
    const { user: newUser, session: newSession } = await AuthService.signUp(data);

    if (newSession && newUser) {
      setUser(newUser);
      setSession(newSession);
      SettingsService.setUser(newUser.id);

      const userProfile = await ProfileService.getOrCreateProfile(newUser.id, {
        displayName: data.fullName,
        email: data.email,
      });

      setProfile(userProfile);
      setStatus("onboarding-required");
      return { requiresVerification: false };
    }

    // Email verification required
    return { requiresVerification: true };
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    await AuthService.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    SettingsService.setUser(null);
    setStatus("unauthenticated");
  }, []);

  const enterOfflineMode = useCallback(() => {
    setError(null);
    AuthService.setOfflineMode(true);
    const offlineProfile = ProfileService.getOfflineProfile();
    setUser(null);
    setSession(null);
    setProfile(offlineProfile);
    SettingsService.setUser("local");
    setStatus("offline");
  }, []);

  const exitOfflineMode = useCallback(() => {
    setError(null);
    AuthService.setOfflineMode(false);
    setUser(null);
    setSession(null);
    setProfile(null);
    SettingsService.setUser(null);
    setStatus("unauthenticated");
  }, []);

  const updateProfile = useCallback(
    async (updates: Partial<UserProfile>): Promise<UserProfile> => {
      if (status === "offline" || !user) {
        const current = profile || ProfileService.getOfflineProfile();
        const updated = { ...current, ...updates, updatedAt: new Date().toISOString() };
        setProfile(updated);
        return updated;
      }

      const updated = await ProfileService.updateProfile(user.id, updates);
      setProfile(updated);
      return updated;
    },
    [profile, status, user]
  );

  const completeOnboarding = useCallback(
    async (data: OnboardingData): Promise<UserProfile> => {
      const activeId = user?.id || "offline-user";
      const completed = await ProfileService.completeOnboarding(activeId, data);
      setProfile(completed);

      // Apply selected preferences to settings immediately
      if (data.themePreference) {
        SettingsService.updateSetting("appearance.theme", data.themePreference, "user");
      }
      if (data.editorPreferences?.tabSize !== undefined) {
        SettingsService.updateSetting("editor.tabSize", data.editorPreferences.tabSize, "user");
      }
      if (data.editorPreferences?.wordWrap !== undefined) {
        SettingsService.updateSetting("editor.wordWrap", data.editorPreferences.wordWrap, "user");
      }
      if (data.editorPreferences?.minimap !== undefined) {
        SettingsService.updateSetting("editor.minimap", data.editorPreferences.minimap, "user");
      }

      setStatus(user ? "authenticated" : "offline");
      return completed;
    },
    [user]
  );

  const resetPassword = useCallback(async (email: string) => {
    setError(null);
    await AuthService.resetPassword(email);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const refreshed = await ProfileService.getProfile(user.id);
    if (refreshed) {
      setProfile(refreshed);
    }
  }, [user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      profile,
      status,
      isLoading: status === "loading",
      isAuthenticated: status === "authenticated",
      isOffline: status === "offline",
      error,
      login,
      signup,
      logout,
      enterOfflineMode,
      exitOfflineMode,
      updateProfile,
      completeOnboarding,
      resetPassword,
      refreshProfile,
      clearError,
    }),
    [
      user,
      session,
      profile,
      status,
      error,
      login,
      signup,
      logout,
      enterOfflineMode,
      exitOfflineMode,
      updateProfile,
      completeOnboarding,
      resetPassword,
      refreshProfile,
      clearError,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

