-- Alyas Software: run this once in the Supabase SQL Editor.
-- It adds durable WebRTC offer/answer storage to the existing calls table.
-- This lets an incoming call appear when the recipient opens the app while it is still ringing.

alter table public.calls add column if not exists offer_sdp jsonb;
alter table public.calls add column if not exists answer_sdp jsonb;

-- The existing RLS policy already limits updates to the two call participants.
-- These column-level grants allow only signaling metadata in addition to call status.
grant update (status, ended_at, duration, offer_sdp, answer_sdp) on public.calls to authenticated;

-- Make profile-photo changes appear on the other device without a refresh.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    execute 'alter publication supabase_realtime add table public.profiles';
  end if;
end $$;
