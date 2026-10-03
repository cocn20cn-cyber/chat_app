# Alyas Software

A small, private one-to-one messenger built with React, Vite, TypeScript, Supabase, and WebRTC. It has no public registration screen: only the two Supabase Auth accounts that you explicitly add to `profiles` can read messages, files, realtime events, or calls.

## What is included

- Persistent Supabase email/password sessions and protected chat UI
- One realtime conversation with text, seen state, typing, and Presence-based availability
- Private image, video, and file uploads to Supabase Storage, including preview and upload progress
- WebRTC one-to-one voice calls, with Supabase Realtime used only for signaling
- Opt-in browser notifications for new messages while the site is open in a background tab
- Simple stored call history and reliable last-seen updates
- Responsive desktop and mobile CSS, with no UI framework or backend server
- Accessible in-app password change for the signed-in user via Supabase Auth

## Supabase setup

1. Create a new Supabase project.
2. Open **SQL Editor**, create a query, paste every line from [`supabase/setup.sql`](./supabase/setup.sql), and run it. The script creates tables, indexes, RLS, storage policies, and Realtime Broadcast/Presence authorization.
3. Open **Realtime → Settings** and turn off **Allow public access to channels**. This makes the two private, RLS-protected channels mandatory.
4. In **Authentication → Providers → Email**, turn off **Allow new users to sign up**. Then, in **Authentication → Users**, create the two email/password users manually.
5. Copy each user's UUID, then run the final `insert into public.profiles ...` example at the bottom of `supabase/setup.sql`, replacing both placeholders. Keep exactly two profile rows: membership in this table is the security gate.
6. In **Project Settings → API**, copy the project URL and the public anon/publishable key. Never use the service-role key in this frontend.
7. Run [`supabase/call-recovery.sql`](./supabase/call-recovery.sql) once in the SQL Editor. This lets an incoming call be recovered if the recipient opens the app while the call is still ringing.

## Local run

```bash
cp .env.example .env
# Fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
npm install
npm run dev
```

Open two different browser profiles (or one normal and one private window) and sign into the two accounts to test realtime messaging and calling.

## Production build

```bash
npm run build
```

Upload the generated `dist/` directory to any static host. No server, Docker image, database password, or secret key is needed. This app has no client-side routes, so SPA fallback configuration is not required.

## Voice-call networking

The app includes a standard public STUN server so peer-to-peer WebRTC works on most networks. Supabase never receives the audio; it only relays the offer, answer, and ICE candidates. Some restrictive NATs require a TURN server. If you later provision one, add these optional deployment variables:

```bash
VITE_TURN_URL=turn:turn.example.com:3478
VITE_TURN_USERNAME=
VITE_TURN_PASSWORD=
```

Rebuild after changing any `VITE_` variable. Do not put a database password or service-role key in `.env`.

## Browser notifications

Use the bell in the chat header and approve the browser prompt. New messages can then appear while the website is open but in another tab or app. A closed-browser/mobile push notification needs a service worker plus a trusted push sender, which this deliberately frontend-only project does not add.

Incoming calls use the same browser-notification permission when the web app is open in the background. If the browser is fully closed, the call cannot ring without Web Push infrastructure. On iPhone/iPad, Web Push additionally requires adding the web app to the Home Screen.

## Account password

The cog button in the chat header opens **Account security**. It changes only the signed-in person's password through Supabase Auth (`auth.updateUser`), where Supabase stores a password hash rather than putting any password in `public.profiles` or the chat database. Configure any stricter password/reauthentication rules in Supabase **Authentication → Settings**.

## Security model

The UI is only a convenience layer. The actual restriction is enforced by RLS:

- Only identities with an administrator-created `profiles` row are private members; the SQL also locks access if the table does not contain exactly two profiles.
- Message policies allow only the sender or receiver; the receiver can update only `seen_at`.
- The `chat-files` bucket is private; each upload is owned by its uploader and only the two members can read it through short-lived signed URLs.
- Realtime private-channel policies apply to typing, Presence, and call signaling.

If you need to replace one person, remove that profile, create the replacement Auth user, then insert the replacement profile row. Existing data intentionally remains protected from the removed account by RLS.
