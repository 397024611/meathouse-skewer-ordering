-- Meat House A La Carte + Stripe v1
-- Isolated from the existing included/paid round-order schema.
-- These tables are server-only. No anon/authenticated policies are created.

create table if not exists public.ala_carte_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  free_rounds integer not null default 1 check (free_rounds between 0 and 10),
  cooldown_minutes integer not null default 0 check (cooldown_minutes between 0 and 60),
  max_items_per_order integer not null default 30 check (max_items_per_order between 1 and 200),
  minimum_order_cents integer not null default 500 check (minimum_order_cents between 0 and 100000),
  currency text not null default 'aud' check (char_length(currency) = 3),
  updated_at timestamptz not null default now()
);

insert into public.ala_carte_settings(id,enabled,free_rounds,cooldown_minutes,max_items_per_order,minimum_order_cents,currency)
values(1,false,1,0,30,500,'aud')
on conflict (id) do nothing;

create table if not exists public.ala_carte_prices (
  menu_item_id text primary key,
  item_name text not null,
  price_cents integer not null default 0 check (price_cents >= 0),
  active boolean not null default false,
  max_per_order integer null check (max_per_order is null or max_per_order between 1 and 100),
  sort_order integer not null default 100,
  updated_at timestamptz not null default now()
);

create table if not exists public.ala_carte_orders (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  table_token text not null,
  table_name text not null,
  session_id text,
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','paid','expired','failed','refunded')),
  kitchen_status text not null default 'new'
    check (kitchen_status in ('new','preparing','ready','picked_up')),
  currency text not null default 'aud',
  amount_total_cents integer not null check (amount_total_cents >= 0),
  stripe_checkout_session_id text unique,
  stripe_checkout_url text,
  stripe_payment_intent_id text,
  stripe_event_id text,
  last_error text,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(table_token, request_id)
);

create index if not exists ala_carte_orders_table_created_idx
on public.ala_carte_orders(table_token, created_at desc);

create index if not exists ala_carte_orders_status_created_idx
on public.ala_carte_orders(status, created_at desc);

create table if not exists public.ala_carte_order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.ala_carte_orders(id) on delete cascade,
  menu_item_id text not null,
  item_name text not null,
  qty integer not null check (qty between 1 and 100),
  unit_price_cents integer not null check (unit_price_cents >= 0),
  line_total_cents integer not null check (line_total_cents >= 0)
);

create index if not exists ala_carte_order_items_order_idx
on public.ala_carte_order_items(order_id);

create table if not exists public.ala_carte_stripe_events (
  event_id text primary key,
  event_type text not null,
  order_id uuid,
  processed_at timestamptz not null default now()
);

create table if not exists public.ala_carte_print_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.ala_carte_orders(id) on delete cascade,
  printer1_done boolean not null default false,
  printer2_done boolean not null default false,
  printer1_done_at timestamptz,
  printer2_done_at timestamptz,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists ala_carte_print_jobs_pending_idx
on public.ala_carte_print_jobs(created_at)
where completed_at is null;

alter table public.ala_carte_settings enable row level security;
alter table public.ala_carte_prices enable row level security;
alter table public.ala_carte_orders enable row level security;
alter table public.ala_carte_order_items enable row level security;
alter table public.ala_carte_stripe_events enable row level security;
alter table public.ala_carte_print_jobs enable row level security;

revoke all on public.ala_carte_settings from anon, authenticated;
revoke all on public.ala_carte_prices from anon, authenticated;
revoke all on public.ala_carte_orders from anon, authenticated;
revoke all on public.ala_carte_order_items from anon, authenticated;
revoke all on public.ala_carte_stripe_events from anon, authenticated;
revoke all on public.ala_carte_print_jobs from anon, authenticated;

grant all on public.ala_carte_settings to service_role;
grant all on public.ala_carte_prices to service_role;
grant all on public.ala_carte_orders to service_role;
grant all on public.ala_carte_order_items to service_role;
grant all on public.ala_carte_stripe_events to service_role;
grant all on public.ala_carte_print_jobs to service_role;
grant usage, select on sequence public.ala_carte_order_items_id_seq to service_role;
