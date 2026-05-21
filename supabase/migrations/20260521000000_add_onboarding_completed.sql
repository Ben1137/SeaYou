alter table public.user_preferences
  add column if not exists has_completed_onboarding boolean not null default false;

comment on column public.user_preferences.has_completed_onboarding is
  'Set to true the first time the user completes or skips the onboarding wizard.
   Prevents re-firing on subsequent logins, even from new devices.';
