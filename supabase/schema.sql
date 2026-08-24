-- Gold Hunter — Supabase schema for order tracking
-- Run in Supabase SQL editor (project: gh-landing)

create table if not exists gh_orders (
  id uuid primary key default gen_random_uuid(),
  plan text not null check (plan in ('A','B','C')),
  amount_usd integer not null,
  tv_username text not null,
  contact text not null,
  stripe_session_id text,
  stripe_payment_intent text,
  status text not null default 'pending' check (status in ('pending','paid','granted','cancelled')),
  created_at timestamptz not null default now(),
  granted_at timestamptz
);

-- Index for quick lookup by session
create index if not exists gh_orders_session_idx on gh_orders(stripe_session_id);
create index if not exists gh_orders_status_idx on gh_orders(status);

-- RLS: service role only (edge functions use service key)
alter table gh_orders enable row level security;
