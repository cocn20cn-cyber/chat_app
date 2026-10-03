-- Alyas Software: run this once in the Supabase SQL Editor.
-- Adds WhatsApp-style sent, delivered, and seen message states.

alter table public.messages add column if not exists delivered_at timestamptz;

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

-- Keep message contents immutable in the browser. Receivers may only update receipts.
revoke update on public.messages from authenticated;
grant select, insert, update (delivered_at, seen_at) on public.messages to authenticated;
