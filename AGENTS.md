# AGENTS.md

## Project Overview

Graze is an Expo/React Native mobile app for pantry-aware food logging and lightweight next-meal suggestions.

Current scope:
- Clerk authentication
- Daily calorie/protein targets
- Pantry item CRUD
- Pantry metadata for suggestions
- Pantry inventory tracking with serving/unit stock math
- Direct food logging
- Suggested meal logging with pantry deduction
- Deterministic pantry-aware next-meal suggestions

Important: the suggestions system is intentionally deterministic by design. It is not a real AI recommendation engine.

## Tech Stack

- Expo / React Native
- TypeScript
- NativeWind with Tailwind CSS v3-compatible setup
- Clerk for authentication
- Supabase for database access

## Important Paths

- `src/screens/AuthScreen.tsx`: custom auth UI, including email/password and Google sign-in
- `src/screens/HomeScreen.tsx`: signed-in app shell and the `Today`, `Log`, `Pantry`, and `Next` tabs
- `src/hooks/useGrazeData.ts`: shared signed-in data loading, stabilized bootstrap/refresh behavior, and top-level readable error banner state
- `src/services/graze.ts`: Supabase reads/writes for profiles, pantry items, and food logs
- `src/services/suggestionEngine.ts`: deterministic pantry-aware candidate generation, filtering, ranking, and suggested-meal support
- `src/lib/inventory.ts`: pantry serving/unit inventory math, stock handling, and formatting helpers
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

- Copy `.env.example` to `.env` before local development.

Required env vars:
- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## Sensitive Files

- Do not read, summarize, copy, or modify sensitive files unless the user explicitly asks and understands the risk.
- Treat the following as off-limits by default:
  - `.env`
  - `.env.*`
  - `secrets/`
  - `*.pem`
  - `*.p8`
  - `*.p12`
  - `*.key`
  - `*.mobileprovision`
  - `*.jks`

Setup expectations:
- All Supabase migrations in `supabase/migrations/` must be run before signed-in pantry, logging, suggestions, and inventory flows are expected to work.
- Clerk must be connected to Supabase using the modern third-party auth flow.
- Google must be enabled in Clerk if the Google sign-in button is expected to work.
- GitHub Actions now runs baseline security checks for typecheck, secret scanning, and dependency review.

## Verification Expectations

- Run `npm run typecheck` after code changes.
- Ensure CI still covers typecheck, secret scanning, and dependency review after repo/security changes.
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
- Signed-in bootstrap is deliberately stabilized to avoid repeated loading loops when auth or backend setup is temporarily unavailable.
- Partial signed-in data load failures surface through the shared readable error banner in `useGrazeData.ts`.
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

## Product Roadmap

Roadmap order:
1. Food log correction
2. Reusable custom meals
3. Grouped meal editing
4. Expiry tracking
5. Suggestion refinement
6. Lightweight recommendation-priority controls
7. UI and look-and-feel polish
8. Out-of-pantry UX polish if still needed

Why this order:
- The current app stores food logs as mostly flat rows.
- Suggested/grouped meals still save as one visible food log plus pantry stock deductions behind the scenes.
- A reusable meal-composition layer should land before ingredient-level grouped-meal editing to avoid rework.
- Expiry tracking should land before the next ranking pass so suggestion logic can use expiry signals directly.
- Lightweight recommendation-priority controls should come after engine refinement so they sit on top of a stronger default ranking rather than compensating for a weak one.
- Core logging, meal composition, and inventory behavior should stabilize before a broader UI polish pass.
- Expiry-aware suggestion logic will likely reshape the `Next` tab, so polishing that experience too early risks rework.

### Near-Term Product Foundation

- Allow logged entries to be edited or deleted later, so accidental logs can be corrected from the day's history.
- Support saved custom meals that map to multiple pantry ingredients and deduct each ingredient automatically when logged.
- Allow grouped meal entries to be edited later at the ingredient-portion level while still appearing as one grouped meal entry.

Implementation guidance:
- Phase 1 should add edit/delete for simple log rows first and handle pantry stock restoration/re-application safely.
- Phase 2 should introduce reusable meal templates plus a canonical meal-composition layer instead of adding more special-case grouped-log behavior.
- Phase 3 should reuse that same composition model for grouped suggested meals so they can be reopened, adjusted, or deleted without inventing a second editing path.

### Inventory Intelligence

- Add expiry date tracking, ideally optional, with future room for smart default estimates for common ingredients.
- Broaden fractional nutrition support beyond pantry items so food logs can store more precise calories/protein when needed.
- Consider batch-aware inventory later if users need separate purchase lots, refill tracking, or per-batch expiry dates.

Implementation guidance:
- Start expiry tracking as item-level optional metadata.
- Defer batch-aware inventory until later; it should not be bundled into the first expiry pass.

### Suggestion Quality And UX

- Improve suggestion normality/sensibility rules, especially for "dry" base + protein meals that may need condiments or sauces.
- Factor in soon-to-expire ingredients, effort level, and meal coherence more strongly during ranking.
- Persist suggestion feedback such as dismissals or accepted suggestions across sessions.
- Revisit out-of-pantry UX as a clearer front-end flow only if the current manual custom-log path still feels too hidden.
- After the engine is stronger, consider lightweight recommendation-priority controls in `Next`, such as prioritize low effort, prioritize protein, use soon-to-expire items, surprise me, or use a specific ingredient.

Implementation guidance:
- Keep manual custom logs as the underlying out-of-pantry model for now rather than introducing a separate meal type.
- Prefer ranking/filtering improvements over any LLM-style meal generation redesign.
- Treat future recommendation controls as priority presets, not raw sort toggles.

### UI And Product Feel

- Improve the overall UI, interaction quality, and visual cohesion of the app once the next recommendation pass is more stable.
- Revisit spacing, hierarchy, component consistency, tab and screen clarity, and empty/loading/error states.
- Polish the app's look and feel without changing the deterministic pantry-aware product framing.

Implementation guidance:
- Save the broad polish pass for after expiry tracking and suggestion refinement, since those phases are likely to reshape the `Next` experience.
- Continue making targeted usability fixes earlier whenever a flow is confusing or high-friction.
- Treat this as a focused product-quality pass, not a brand-new information architecture unless later product changes require one.
