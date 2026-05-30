/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TIME_CLOCK_DATA_SOURCE?: 'mock' | 'supabase';
  readonly VITE_APP_ENV?: 'production' | 'staging' | 'development';
  readonly VITE_APP_BASE_PATH?: string;
  readonly VITE_BUILD_OUT_DIR?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_EMAIL_REDIRECT_TO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
