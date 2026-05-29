export type DataSourceMode = 'mock' | 'supabase';

const requestedMode = import.meta.env.VITE_TIME_CLOCK_DATA_SOURCE;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? '';
const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
const appBasePath = import.meta.env.BASE_URL ?? '/time/';
const supabaseEmailRedirectTo = import.meta.env.VITE_SUPABASE_EMAIL_REDIRECT_TO?.trim() ?? 'https://danecutcliffe.com/time/';

export const appConfig = {
  requestedMode,
  dataSourceMode: requestedMode === 'supabase' && hasSupabaseConfig ? 'supabase' : 'mock' as DataSourceMode,
  hasSupabaseConfig,
  supabaseUrl,
  supabaseAnonKey,
  appBasePath,
  supabaseEmailRedirectTo,
  isSupabaseRequestedButMissingConfig: requestedMode === 'supabase' && !hasSupabaseConfig,
};
