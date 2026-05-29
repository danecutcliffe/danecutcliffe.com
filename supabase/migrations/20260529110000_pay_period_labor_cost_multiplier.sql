update public.app_settings
set value = jsonb_set(
  coalesce(value, '{}'::jsonb),
  '{laborCostMultiplier}',
  coalesce(value->'laborCostMultiplier', to_jsonb(1.25)),
  true
)
where key = 'pay_period';
