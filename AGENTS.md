# AGENTS.md

## Project Overview

Graze is an Expo/React Native mobile app for pantry-aware food logging and lightweight next-meal suggestions.

Current v1 scope:
- Clerk authentication
- Daily calorie/protein targets
- Pantry item CRUD
- Food logging
- A suggestions preview screen

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
- `src/lib/supabase.ts`: Supabase client wiring
- `supabase/migrations/20260425_init_graze.sql`: schema, triggers, RLS, and policies

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
- The Supabase SQL migration must be run before the signed-in data flows work.
- Clerk must be connected to Supabase using the modern third-party auth flow.
- Google must be enabled in Clerk if the Google sign-in button is expected to work.

## Verification Expectations

- Run `npm run typecheck` after code changes.
- Test key flows in Expo Go.
- For auth or data-layer changes, verify:
  - sign in works
  - profile load succeeds
  - pantry operations work
  - food logging works
  - the top-level load banner is absent unless there is a real backend/setup issue

## Known Pitfalls

- Expo package versions must match Expo SDK 54 bundled native module versions.
- NativeWind requires Tailwind CSS v3 and the `nativewind/preset` in `tailwind.config.js`.
- Partial signed-in data load failures surface through the shared error banner in `useGrazeData.ts`.
- If a banner says a load step failed, inspect the Expo/Metro logs for the step-specific console error before changing UI behavior.

## Editing Guidance

- Prioritize core functionality over broad visual polish while the product structure is still changing.
- Fix high-friction usability issues immediately, especially anything that blocks normal mobile use.
- Defer broad visual styling passes until the core flows and screen structure are stable.
- Preserve the custom auth UI unless an intentional auth UX redesign is requested.
- Preserve the current honest "preview" framing of the suggestions screen unless the actual recommendation engine is being built.
- Prefer small, targeted changes over broad refactors.
- Keep docs and env-var names aligned with the current code whenever auth or Supabase wiring changes.
