import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { supabasePublishableKey, supabaseUrl } from './env';

let accessTokenGetter: (() => Promise<string | null>) | null = null;

export const configureSupabaseAccessToken = (getToken: () => Promise<string | null>) => {
  accessTokenGetter = getToken;
};

export const supabase: SupabaseClient = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  accessToken: async () => (accessTokenGetter ? accessTokenGetter() : null),
});
