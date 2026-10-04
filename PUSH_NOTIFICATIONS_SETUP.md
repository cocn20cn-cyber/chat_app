# Real push notifications setup

These steps activate notifications when Alyas Software is closed or in the background on Windows and iPhone.

## 1. Create the subscriptions table

In Supabase, open **SQL Editor**, create a new query, paste the entire contents of `supabase/push-notifications.sql`, then click **Run**.

## 2. Generate one VAPID key pair

On your computer, open the terminal in this project and run:

```powershell
npx web-push generate-vapid-keys
```

It prints a **public key** and a **private key**. Keep the private key secret. Do not put it in GitHub or in a `VITE_` variable.

## 3. Add these Vercel environment variables

In Vercel: **Project → Settings → Environment Variables**, add each variable for Production, Preview, and Development:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase **secret/service-role** API key — never a publishable key |
| `VITE_VAPID_PUBLIC_KEY` | The public VAPID key from step 2 |
| `VAPID_PUBLIC_KEY` | The same public VAPID key |
| `VAPID_PRIVATE_KEY` | The private VAPID key from step 2 |
| `VAPID_SUBJECT` | `mailto:your-email@example.com` |

Do not expose `SUPABASE_SERVICE_ROLE_KEY` or `VAPID_PRIVATE_KEY` in the browser, `.env`, or GitHub. They are used only by the Vercel API routes.

## 4. Redeploy and re-enable the bell

Push this update to GitHub so Vercel deploys it. On each device, open the fresh deployment, tap the bell, and choose **Allow**. On iPhone, open the Home Screen app—not the Safari tab—before tapping the bell.
