# Graze v1

Graze is an Expo/React Native prototype for fast, pantry-aware eating decisions. This v1 includes:

- Clerk authentication
- Supabase-backed pantry items, food logs, and daily calorie/protein targets
- Quick logging from pantry staples
- A lightweight "What can I eat next?" preview screen

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
- Open the suggestions preview tab
