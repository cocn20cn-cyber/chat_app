-- Alyas Software: run this once in the Supabase SQL Editor.
-- Repairs Realtime delivery for the existing messages table.
-- Safe to run more than once.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    execute 'alter publication supabase_realtime add table public.messages';
  end if;
end $$;

-- Lets the fallback subscription receive complete update records, such as Seen status.
alter table public.messages replica identity full;
