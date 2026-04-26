const requireEnv = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
};

export const publishableKey = requireEnv(
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
  'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
);

export const supabaseUrl = requireEnv(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  'EXPO_PUBLIC_SUPABASE_URL',
);

export const supabasePublishableKey = requireEnv(
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
);
