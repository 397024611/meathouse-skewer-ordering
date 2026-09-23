-- Safe single-table testing for A La Carte / Stripe.
alter table if exists public.ala_carte_settings
  add column if not exists test_mode boolean not null default false;

alter table if exists public.ala_carte_settings
  add column if not exists test_table_token text;

update public.ala_carte_settings
set test_mode=false
where test_mode is null;
