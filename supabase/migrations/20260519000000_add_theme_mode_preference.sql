-- Add theme_mode preference. Nullable — NULL means 'system' (auto day/night).
alter table public.user_preferences
  add column if not exists theme_mode text;

comment on column public.user_preferences.theme_mode is
  'User theme preference: light, dark, bright-deck, or NULL for system/auto.';
