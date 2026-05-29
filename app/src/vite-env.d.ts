/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TIME_CLOCK_DATA_SOURCE?: 'mock' | 'supabase';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
