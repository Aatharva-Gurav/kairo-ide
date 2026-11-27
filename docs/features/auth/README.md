# Authentication (`features/auth`)

## Feature Overview
Provides optional cloud authentication and user profile persistence powered by Supabase, with seamless fallback to a local **Offline Mode** when Supabase credentials are unavailable or when the user chooses to work offline.

## Implementation Location
- **Feature Module**: [`features/auth/`](../../../features/auth/)
  - `store.tsx` (`AuthProvider`, `useAuth`)
  - `types.ts` (`AuthStatus`, `UserProfile`, `SignInData`, `SignUpData`, `OnboardingData`)
  - `services/auth.service.ts` (`AuthService`)
  - `services/profile.service.ts` (`ProfileService`)
  - `services/auth-error.ts` (`formatAuthError`)
  - Unit tests: `services/auth.service.test.ts`, `services/profile.service.test.ts`
- **App Routes & UI Components**:
  - [`app/login/page.tsx`](../../../app/login/page.tsx) & [`components/login-form.tsx`](../../../components/login-form.tsx)
  - [`app/signup/page.tsx`](../../../app/signup/page.tsx) & [`components/signup-form.tsx`](../../../components/signup-form.tsx)
  - [`components/auth-guard.tsx`](../../../components/auth-guard.tsx)
- **Infrastructure & Database**:
  - [`lib/supabase/client.ts`](../../../lib/supabase/client.ts), [`lib/supabase/database.types.ts`](../../../lib/supabase/database.types.ts)
  - [`supabase/migrations/20260923000000_create_profiles_and_auth_triggers.sql`](../../../supabase/migrations/20260923000000_create_profiles_and_auth_triggers.sql)

## Architecture
- `AuthProvider` wraps the entire Next.js app in `app/layout.tsx`.
- On startup, it checks:
  1. Whether explicit offline mode (`kairo:auth:offline_mode`) is active via `AuthService.isOfflineMode()`.
  2. Whether Supabase is configured via `isSupabaseConfigured()` (`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, excluding placeholder strings).
  3. Otherwise, fetches the active Supabase session and profile, automatically linking user-scoped settings (`SettingsService.setUser(...)`).
- `AuthGuard` wraps `app/page.tsx` and redirects `"unauthenticated"` sessions to `/login` and `"onboarding-required"` sessions to `/onboarding`.

## Feature Functionality
- Email/password sign-in (`AuthService.signIn`) and sign-up (`AuthService.signUp`) with email-confirmation awareness (`requiresVerification`)
- Password reset flow (`resetPassword`)
- Automatic profile provisioning and fallback creation (`ProfileService.getOrCreateProfile`) backed by PostgreSQL triggers (`handle_new_user`) and Row Level Security policies on `public.profiles`
- Instant Offline Mode entry/exit (`enterOfflineMode`, `exitOfflineMode`) creating a synthetic local profile (`"local"`)

## Dependencies
- `@supabase/supabase-js`: Auth session lifecycle, JWT auto-refresh, and PostgreSQL profile queries
- `lib/storage.ts`: Safe cross-environment `localStorage` access

## Configuration
- `NEXT_PUBLIC_SUPABASE_URL`: Target Supabase project URL (optional)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public Supabase anon key (optional)
- Storage key: `kairo:auth:offline_mode`

> Never commit real Supabase keys or `.env.local` files; `.env*` files are gitignored and blocked by `SensitivePathPolicy`.

## User Workflow
1. Launch Kairo IDE. If Supabase is unconfigured or Offline Mode was previously selected, the workbench opens directly in Offline Mode.
2. When Supabase is configured and signed out, `AuthGuard` routes to `/login` (with options to sign in, navigate to `/signup`, or click Offline Mode).
3. First-time authenticated users without `onboarding_completed = true` are routed to `/onboarding` before entering `/`.

## Development Notes
- Keep `lib/supabase/database.types.ts` synchronized with any schema changes under `supabase/migrations/`.
- Test auth error mapping and service fallbacks with `npm test`.

## Known Limitations
- Because `next.config.ts` uses static export (`output: "export"`), auth operates client-side using Supabase PKCE/browser storage (`window.localStorage`) rather than server-side middleware cookies.

## Related Documentation
- [Onboarding Feature](../onboarding/README.md)
- [Settings Feature](../settings/README.md)
- [Architecture Overview](../../architecture/architecture-overview.md)
