-- Web Push subscriptions for Alyas Software.
-- Run this once in Supabase SQL Editor before configuring the Vercel variables.

create table if not exists public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- The browser never reads this table. Only the authenticated Vercel API routes
-- write it with the Supabase service-role key after validating the user token.
revoke all on public.push_subscriptions from anon, authenticated;
