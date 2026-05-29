import type { PayPeriodSettings } from '../domain/types';
import { addDaysToDateKey, dayDiff, getAtlanticDateKey, getCurrentAtlanticWeekStart } from '../utils/time';

export const DEFAULT_PAY_PERIOD_LENGTH_DAYS = 14;
export const DEFAULT_LABOR_COST_MULTIPLIER = 1.25;

export function defaultPayPeriodSettings(): PayPeriodSettings {
  return {
    anchorStart: getCurrentAtlanticWeekStart(),
    lengthDays: DEFAULT_PAY_PERIOD_LENGTH_DAYS,
    laborCostMultiplier: DEFAULT_LABOR_COST_MULTIPLIER,
  };
}

export function normalizePayPeriodSettings(settings: Partial<PayPeriodSettings> | null | undefined): PayPeriodSettings {
  const fallback = defaultPayPeriodSettings();
  const lengthDays = Number(settings?.lengthDays);
  const laborCostMultiplier = Number(settings?.laborCostMultiplier);
  const anchorStart = settings?.anchorStart;

  if (!anchorStart || Number.isNaN(lengthDays) || lengthDays < 1) return fallback;

  return {
    anchorStart,
    lengthDays,
    laborCostMultiplier: Number.isNaN(laborCostMultiplier) || laborCostMultiplier < 1
      ? fallback.laborCostMultiplier
      : Number(laborCostMultiplier.toFixed(4)),
  };
}

export function getPayPeriodForDate(settings: PayPeriodSettings, dateKey = getAtlanticDateKey(new Date())) {
  const normalized = normalizePayPeriodSettings(settings);
  const distance = dayDiff(normalized.anchorStart, dateKey);
  const periodOffset = Math.floor(distance / normalized.lengthDays) * normalized.lengthDays;
  const start = addDaysToDateKey(normalized.anchorStart, periodOffset);
  const end = addDaysToDateKey(start, normalized.lengthDays - 1);
  return { start, end };
}

export function getPayPeriodDays(settings: PayPeriodSettings, periodStart: string) {
  const normalized = normalizePayPeriodSettings(settings);
  return Array.from({ length: normalized.lengthDays }, (_, index) => addDaysToDateKey(periodStart, index));
}
