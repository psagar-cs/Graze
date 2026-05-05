# AGENTS.md

## Project Overview

Graze is an Expo/React Native mobile app for pantry-aware food logging and lightweight next-meal suggestions.

Current v1 scope:
- Clerk authentication
- Daily calorie/protein targets
- Pantry item CRUD
- Food logging
- Deterministic pantry-aware next-meal suggestions
- Pantry inventory tracking with serving/unit stock math

Important: the suggestions feature is intentionally a preview/stub. It is not a real AI recommendation engine yet.

## Tech Stack

- Expo / React Native
- TypeScript
- NativeWind with Tailwind CSS v3-compatible setup
- Clerk for authentication
- Supabase for database access

## Important Paths

- `src/screens/AuthScreen.tsx`: custom auth UI, including email/password and Google sign-in
- `src/screens/HomeScreen.tsx`: signed-in app shell and the `Today`, `Log`, `Pantry`, and `Next` tabs
- `src/hooks/useGrazeData.ts`: shared signed-in data loading, refresh logic, and top-level error banner state
- `src/services/graze.ts`: Supabase reads/writes for profiles, pantry items, and food logs
- `src/services/suggestionEngine.ts`: deterministic pantry-aware candidate generation, filtering, and ranking
- `src/lib/inventory.ts`: pantry serving/unit inventory math and formatting helpers
- `src/lib/supabase.ts`: Supabase client wiring
- `supabase/migrations/20260425_init_graze.sql`: base schema, triggers, RLS, and policies
- `supabase/migrations/20260504_add_pantry_metadata.sql`: pantry suggestion metadata fields
- `supabase/migrations/20260504_allow_fractional_pantry_nutrition.sql`: decimal pantry calories/protein
- `supabase/migrations/20260504_add_pantry_inventory.sql`: pantry stock tracking fields

## Auth And Supabase Conventions

- Use Clerk's normal session token with Supabase's modern third-party auth integration.
- Do not reintroduce `getToken({ template: 'supabase' })`.
- Use `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, not legacy anon-key naming.
- Google sign-in is supported through Clerk OAuth on the custom auth screen.
- The app uses a custom auth screen, not Clerk's hosted/prebuilt native sign-in UI.

## Environment And Setup

Required env vars:
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Setup expectations:
- All Supabase migrations in `supabase/migrations/` must be run before signed-in pantry, logging, suggestions, and inventory flows are expected to work.
- Clerk must be connected to Supabase using the modern third-party auth flow.
- Google must be enabled in Clerk if the Google sign-in button is expected to work.

## Verification Expectations

- Run `npm run typecheck` after code changes.
- Test key flows in Expo Go.
- For auth or data-layer changes, verify:
  - sign in works
  - profile load succeeds
  - pantry operations work
  - pantry inventory updates and clear-stock behavior work
  - food logging works
  - pantry-linked food logs deduct stock correctly
  - low/empty stock items stop appearing in suggestions
  - the top-level load banner is absent unless there is a real backend/setup issue

## Known Pitfalls

- Expo package versions must match Expo SDK 54 bundled native module versions.
- NativeWind requires Tailwind CSS v3 and the `nativewind/preset` in `tailwind.config.js`.
- Partial signed-in data load failures surface through the shared error banner in `useGrazeData.ts`.
- If a banner says a load step failed, inspect the Expo/Metro logs for the step-specific console error before changing UI behavior.
- Pantry nutrition per serving supports decimals, but logged calories/protein are still integer-backed in the current schema.
- Legacy pantry rows default to zero stock until inventory is explicitly set, so they will not participate in stock-aware suggestions until updated.

## Editing Guidance

- Prioritize core functionality over broad visual polish while the product structure is still changing.
- Fix high-friction usability issues immediately, especially anything that blocks normal mobile use.
- Defer broad visual styling passes until the core flows and screen structure are stable.
- Preserve the custom auth UI unless an intentional auth UX redesign is requested.
- Preserve the current deterministic, pantry-aware framing of the suggestions screen unless a bigger recommendation-engine redesign is explicitly requested.
- Prefer small, targeted changes over broad refactors.
- Keep docs and env-var names aligned with the current code whenever auth or Supabase wiring changes.
