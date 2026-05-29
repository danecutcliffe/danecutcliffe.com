import { createClient } from '@supabase/supabase-js';
import { appConfig } from '../../config/env';

export const createSupabaseBrowserClient = () => {
  if (!appConfig.hasSupabaseConfig) {
    throw new Error('Supabase mode requires VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.');
  }

  return createClient(appConfig.supabaseUrl, appConfig.supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      experimental: {
        passkey: true,
      },
    },
  });
};
