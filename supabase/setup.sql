-- Private Messenger setup
-- Run this entire file in the Supabase SQL Editor before using the app.
-- After it succeeds, create exactly two Auth users in the dashboard and add exactly
-- two rows to public.profiles using the final INSERT example at the bottom.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  avatar_url text,
  last_seen timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete restrict,
  receiver_id uuid not null references public.profiles(id) on delete restrict,
  content text,
  message_type text not null check (message_type in ('text', 'image', 'video', 'audio', 'file')),
  file_path text,
  file_name text,
  file_size bigint check (file_size is null or file_size >= 0),
  delivered_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> receiver_id),
  check (
    (message_type = 'text' and nullif(trim(content), '') is not null and file_path is null)
    or (message_type in ('image', 'video', 'audio', 'file') and file_path is not null)
  )
);

create table if not exists public.calls (
  id uuid primary key default gen_random_uuid(),
  caller_id uuid not null references public.profiles(id) on delete restrict,
  receiver_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'ringing' check (status in ('ringing', 'connected', 'ended', 'rejected', 'failed')),
  offer_sdp jsonb,
  answer_sdp jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration integer check (duration is null or duration >= 0),
  check (caller_id <> receiver_id)
);

create index if not exists messages_conversation_created_at_idx on public.messages (sender_id, receiver_id, created_at);
create index if not exists messages_receiver_unseen_idx on public.messages (receiver_id, seen_at) where seen_at is null;
create index if not exists calls_participants_started_at_idx on public.calls (caller_id, receiver_id, started_at desc);

-- This is the single authorization gate. A signed-in account becomes a member only
-- when an administrator inserts its profile. Do not add a third profile row.
create or replace function public.is_private_member(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = user_id)
     and (select count(*) from public.profiles) = 2;
$$;

revoke all on function public.is_private_member(uuid) from public;
grant execute on function public.is_private_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.calls enable row level security;

drop policy if exists "private members can read profiles" on public.profiles;
create policy "private members can read profiles"
on public.profiles for select to authenticated
using (public.is_private_member(auth.uid()));

drop policy if exists "members update their own profile" on public.profiles;
create policy "members update their own profile"
on public.profiles for update to authenticated
using (id = auth.uid() and public.is_private_member(auth.uid()))
with check (id = auth.uid() and public.is_private_member(auth.uid()));

drop policy if exists "members read their messages" on public.messages;
create policy "members read their messages"
on public.messages for select to authenticated
using (public.is_private_member(auth.uid()) and (auth.uid() = sender_id or auth.uid() = receiver_id));

drop policy if exists "members send messages" on public.messages;
create policy "members send messages"
on public.messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and receiver_id <> auth.uid()
  and public.is_private_member(auth.uid())
  and public.is_private_member(receiver_id)
);

drop policy if exists "receivers mark messages seen" on public.messages;
drop policy if exists "receivers update message delivery" on public.messages;
create policy "receivers update message delivery"
on public.messages for update to authenticated
using (receiver_id = auth.uid() and public.is_private_member(auth.uid()))
with check (
  receiver_id = auth.uid()
  and public.is_private_member(auth.uid())
  and (delivered_at is not null or seen_at is not null)
);

drop policy if exists "members read calls" on public.calls;
create policy "members read calls"
on public.calls for select to authenticated
using (public.is_private_member(auth.uid()) and (auth.uid() = caller_id or auth.uid() = receiver_id));

drop policy if exists "members begin calls" on public.calls;
create policy "members begin calls"
on public.calls for insert to authenticated
with check (
  caller_id = auth.uid()
  and receiver_id <> auth.uid()
  and public.is_private_member(auth.uid())
  and public.is_private_member(receiver_id)
);

drop policy if exists "participants update calls" on public.calls;
create policy "participants update calls"
on public.calls for update to authenticated
using (public.is_private_member(auth.uid()) and (auth.uid() = caller_id or auth.uid() = receiver_id))
with check (public.is_private_member(auth.uid()) and (auth.uid() = caller_id or auth.uid() = receiver_id));

-- Column grants prevent the app from changing message contents or call participants.
revoke all on public.profiles, public.messages, public.calls from anon;
grant select, update (display_name, avatar_url, last_seen) on public.profiles to authenticated;
grant select, insert, update (delivered_at, seen_at) on public.messages to authenticated;
grant select, insert, update (status, ended_at, duration, offer_sdp, answer_sdp) on public.calls to authenticated;

-- Private Storage. Files are never public and the first path segment must be the uploader's user id.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 104857600)
on conflict (id) do update set public = false, file_size_limit = 104857600;

drop policy if exists "private members download chat files" on storage.objects;
create policy "private members download chat files"
on storage.objects for select to authenticated
using (bucket_id = 'chat-files' and public.is_private_member(auth.uid()));

drop policy if exists "members upload own chat files" on storage.objects;
create policy "members upload own chat files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-files'
  and owner_id = (select auth.uid()::text)
  and public.is_private_member(auth.uid())
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "members delete own failed uploads" on storage.objects;
create policy "members delete own failed uploads"
on storage.objects for delete to authenticated
using (bucket_id = 'chat-files' and owner_id = (select auth.uid()::text) and public.is_private_member(auth.uid()));

-- Realtime Broadcast/Presence authorization for typing, status, and WebRTC signaling.
-- RLS is already enabled on this Supabase-managed table. Do not ALTER it.
drop policy if exists "private members receive realtime" on realtime.messages;
create policy "private members receive realtime"
on realtime.messages for select to authenticated
using (
  realtime.topic() in ('two-person-chat', 'two-person-call-signaling')
  and realtime.messages.extension in ('broadcast', 'presence')
  and public.is_private_member(auth.uid())
);
drop policy if exists "private members send realtime" on realtime.messages;
create policy "private members send realtime"
on realtime.messages for insert to authenticated
with check (
  realtime.topic() in ('two-person-chat', 'two-person-call-signaling')
  and realtime.messages.extension in ('broadcast', 'presence')
  and public.is_private_member(auth.uid())
);

-- Deliver message and profile-photo changes immediately over Supabase Realtime. This block is safe to re-run.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    execute 'alter publication supabase_realtime add table public.profiles';
  end if;
end $$;

-- Run this once AFTER creating the two Auth users (replace the placeholders with
-- IDs copied from Authentication > Users). These are the only two allowed accounts.
-- insert into public.profiles (id, display_name) values
--   ('FIRST_AUTH_USER_UUID', 'Your name'),
--   ('SECOND_AUTH_USER_UUID', 'Friend name');
