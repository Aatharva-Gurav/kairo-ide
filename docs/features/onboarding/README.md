# Onboarding (`features/onboarding`)

## Feature Overview
Guides new users through a 4-step interactive setup wizard to configure profile details, preferred programming languages, IDE color theme, and core editor preferences.

## Implementation Location
- **Feature Module**: [`features/onboarding/components/onboarding-wizard.tsx`](../../../features/onboarding/components/onboarding-wizard.tsx)
- **App Route**: [`app/onboarding/page.tsx`](../../../app/onboarding/page.tsx)

## Architecture
- `OnboardingWizard` reads user state from `useAuth()` (`features/auth/store.tsx`) and current settings from `useSettings()` (`features/settings/store.tsx`).
- Resumable step progress (`1` through `4`) is stored per user ID in `localStorage` (`kairo.onboarding_step.<userId>` via `getSafeLocalStorage()`).
- Completing the final step invokes `completeOnboarding()` on `AuthProvider` (persisting `preferred_languages`, `theme_preference`, `editor_preferences`, and `onboarding_completed = true` in Supabase or local profile) and redirects to `/`.

## Feature Functionality
1. **Step 1 — Profile**: Configure `displayName` and `username`.
2. **Step 2 — Languages**: Toggle preferred programming languages (`TypeScript`, `JavaScript`, `Rust`, `Python`, `Go`, `C++`, `HTML & CSS`, `JSON / YAML`, `SQL`, `Markdown`).
3. **Step 3 — Theme**: Choose among Kairo IDE's 14 light and dark themes (`dark-modern`, `light-modern`, `dark-plus`, `light-plus`, `vs-dark`, `vs-light`, `midnight-blue`, `graphite`, `forest-dark`, `arctic-blue`, `warm-sand`, `mint-light`, `hc-dark`, `hc-light`).
4. **Step 4 — Editor Preferences**: Configure initial `tabSize`, `wordWrap`, and `minimap` settings and apply live via `updateSetting()`.

## Dependencies
- `features/auth/store.tsx` (`completeOnboarding`)
- `features/settings/store.tsx` (`updateSetting`)
- `lucide-react`, `@/components/ui/button`, `@/components/ui/input`, `@/components/kairo-brand-icon`

## Configuration
- Storage key: `kairo.onboarding_step.<userId>`

## User Workflow
- Users with `"onboarding-required"` auth status are automatically routed to `/onboarding` by `AuthGuard` and returned to `/` upon completion.

## Development Notes
- Keep `THEME_OPTIONS` in `onboarding-wizard.tsx` aligned with [`features/theme/registry.ts`](../../../features/theme/registry.ts).

## Known Limitations
- Primarily reached during cloud Supabase sign-up when `onboarding_completed` is `false`; Offline Mode enters the IDE directly without forcing onboarding.

## Related Documentation
- [Authentication Feature](../auth/README.md)
- [Themes Feature](../theme/README.md)
- [Settings Feature](../settings/README.md)
