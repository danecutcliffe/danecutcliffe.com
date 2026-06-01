update public.app_settings
set value = jsonb_set(
  coalesce(value, '{}'::jsonb),
  '{weeklyOvertimeThresholdHours}',
  coalesce(value->'weeklyOvertimeThresholdHours', to_jsonb(48)),
  true
)
where key = 'pay_period';
