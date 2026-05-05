# Graze v2

Graze is an Expo/React Native prototype for fast, pantry-aware eating decisions. The current build includes:

- Clerk authentication
- Supabase-backed pantry items, food logs, and daily calorie/protein targets
- Quick logging from pantry staples
- A deterministic pantry-aware "What can I eat next?" engine

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in:
   - `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. In Clerk:
   - Enable email/password authentication.
   - Enable Google as a social connection if you want `Continue with Google` to work.
   - Connect Clerk to Supabase using the modern third-party auth integration.
4. In Supabase:
   - Run the SQL in [supabase/migrations/20260425_init_graze.sql](/Users/PranavSagar/Desktop/SCHOOL/MPCS 51238 Design, Build, Ship/Assignments/Project/Graze/supabase/migrations/20260425_init_graze.sql).
   - Then run the additive v2 pantry metadata migration in [supabase/migrations/20260504_add_pantry_metadata.sql](/Users/PranavSagar/Desktop/SCHOOL/MPCS 51238 Design, Build, Ship/Assignments/Project/Graze/supabase/migrations/20260504_add_pantry_metadata.sql).
   - Then run the pantry nutrition decimal migration in [supabase/migrations/20260504_allow_fractional_pantry_nutrition.sql](/Users/PranavSagar/Desktop/SCHOOL/MPCS 51238 Design, Build, Ship/Assignments/Project/Graze/supabase/migrations/20260504_allow_fractional_pantry_nutrition.sql).
   - Then run the pantry inventory migration in [supabase/migrations/20260504_add_pantry_inventory.sql](/Users/PranavSagar/Desktop/SCHOOL/MPCS 51238 Design, Build, Ship/Assignments/Project/Graze/supabase/migrations/20260504_add_pantry_inventory.sql).
   - Add Clerk as a third-party auth provider and make sure Clerk session tokens include the `authenticated` role claim Supabase expects.
   - This app uses the normal Clerk session token for Supabase, not a Supabase-specific Clerk JWT template.

## Run

```bash
npm install
npm start
```

Open the app in Expo Go on iPhone and test the full loop:

- Create account / sign in
- Try Google sign-in if enabled in Clerk. Expo will open a browser-based OAuth flow and return to the app.
- Set daily targets
- Add pantry items
- Log food from pantry or manual entry
- Review today summary
- Open the Next tab and validate pantry-based suggestions

## What Changed In v2

- Pantry items now support lightweight suggestion metadata:
  - category
  - effort level
  - meal role
- Pantry items now track real inventory:
  - serving amount and unit
  - current stock amount
  - calculated servings available
  - explicit stock clearing without archiving the ingredient
- The `Next` tab now uses a deterministic suggestion engine instead of preview cards.
- Suggestions are built from active pantry items and ranked against:
  - remaining calories and protein
  - low effort
  - time of day
  - normal pantry pairings
  - avoiding repeated meals from today when possible
  - available pantry stock

## How The Suggestion Engine Works

The engine lives in [src/services/suggestionEngine.ts](/Users/PranavSagar/Desktop/SCHOOL/MPCS 51238 Design, Build, Ship/Assignments/Project/Graze/src/services/suggestionEngine.ts) and stays intentionally simple:

- It buckets pantry items into rough food groups using saved metadata plus name-based fallbacks.
- It generates only a small set of fixed low-effort patterns such as:
  - protein + carb
  - protein + fruit
  - dairy + fruit
  - dairy + fruit + fat
  - base + protein + condiment
  - snack + protein
  - late-night easy snack
- It filters out weird or impractical combinations like condiment-heavy or fat-only options.
- It ranks the remaining candidates with transparent heuristics instead of AI generation.

## Current Limitations

- Inventory is tracked per pantry item, not per purchase batch or container.
- Controlled unit choices are intentionally limited; custom units are not supported yet.
- Legacy pantry rows default to zero stock until the user sets inventory, so they will not be suggested until updated.
- Repetition detection is heuristic and may miss custom log names.
- Feedback actions are local-only for now and do not persist across sessions.
- Food-log calories and protein are still integer-backed; fractional pantry nutrition is supported, but logged nutrition has not been broadened yet.

## v3 Opportunities

- Persist dismissed or accepted suggestions.
- Add better pantry metadata guidance and smarter autofill.
- Support structured inventory quantities.
- Isolate any future LLM usage to explanation polish, not meal generation.
