import { appConfig } from '../config/env';
import { mockTimeClockService } from './mockTimeClockService';
import { createSupabaseTimeClockService } from './supabaseTimeClockService';
import type { AdminTimeClockService } from './TimeClockService';

export const timeClockService: AdminTimeClockService =
  appConfig.dataSourceMode === 'supabase'
    ? createSupabaseTimeClockService()
    : mockTimeClockService;
