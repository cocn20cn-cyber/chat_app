-- Alyas Software: run this once in the Supabase SQL Editor.
-- It allows securely stored audio/voice-note messages in the existing conversation.

do $$
declare
  check_name text;
begin
  -- The original setup created two unnamed CHECK constraints. Remove only those
  -- checks and recreate them with the new `audio` message type included.
  for check_name in
    select conname
    from pg_constraint
    where conrelid = 'public.messages'::regclass and contype = 'c'
  loop
    execute format('alter table public.messages drop constraint %I', check_name);
  end loop;

  alter table public.messages
    add constraint messages_message_type_check
    check (message_type in ('text', 'image', 'video', 'audio', 'file'));

  alter table public.messages
    add constraint messages_payload_check
    check (
      (message_type = 'text' and nullif(trim(content), '') is not null and file_path is null)
      or (message_type in ('image', 'video', 'audio', 'file') and file_path is not null)
    );
end $$;
