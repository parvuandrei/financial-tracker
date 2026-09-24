# FinTrack

A static personal-finance dashboard with Supabase email/password accounts and per-user preferences. The frontend can run on GitHub Pages without a build step.

## Current scope

- Sign up, confirm email, sign in, sign out on this browser, and reset a password by email.
- Save base currency, daily allowance and its currency, baseline monthly burn, and projection horizon.
- Restore saved settings after refresh or sign-in on another device. Save confirmation appears only after a database response.
- Preferences are protected by database row-level security. Password handling and session refresh use the official Supabase client.
- Existing financial figures, transactions, goals, and scenarios are **sample data**, not account-owned financial records. Transaction edits remain temporary and clear on sign-out. Currency preferences do not convert the sample figures. Other devices see settings on their next page load/sign-in; this version does not provide live simultaneous editing (last successful save wins).

## Connect Supabase before publishing

1. Create a project at <https://supabase.com/dashboard>.
2. Open its SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql) once. This creates `public.user_settings`, grants only the required operations, and enables policies that restrict reads and writes to the signed-in user's ID. Ensure the `public` schema is exposed through the project's Data API.
3. Enable the Email authentication provider and keep email confirmation enabled. Set the minimum password length to at least 12 characters in the provider's password settings. Configure email delivery/SMTP for intended users; Supabase's default mail service may restrict recipients and rate-limit delivery.
4. In Authentication URL Configuration, set **Site URL** to:

   `https://parvuandrei.github.io/financial-tracker/`

   Add these allowed redirect URLs:

   - `https://parvuandrei.github.io/financial-tracker/`
   - `https://parvuandrei.github.io/financial-tracker/?recovery=1`
   - For local testing: `http://127.0.0.1:4173/` and `http://127.0.0.1:4173/?recovery=1`

5. Copy the Project URL and **publishable** key (`sb_publishable_…`) from the project's Connect panel into [`config.js`](config.js). These values are intended for browser use. Never put a secret key, service-role key, database password, or personal access token in the frontend. This implementation expects a hosted `https://….supabase.co` URL and a publishable key.
6. Run the verification below, then publish the branch. Until configuration is supplied, the app shows an account setup placeholder and keeps the dashboard hidden.

## Enable Continue with Google

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview), select/create a project, and complete its app branding/audience setup for FinTrack. If the app is in Testing, add the intended Google accounts as test users.
2. Under **Clients**, create an OAuth client of type **Web application**.
3. Set the authorized JavaScript origin to `https://parvuandrei.github.io` (no path).
4. Set the authorized redirect URI to `https://xpwdghfdhyrirkybeakw.supabase.co/auth/v1/callback`.
5. In Supabase **Authentication → Sign In / Providers → Google**, enable Google, paste the client ID and client secret, and Save. Keep the secret only in Supabase; never add it to `config.js` or GitHub.
6. Keep `https://parvuandrei.github.io/financial-tracker/` in Supabase's allowed redirect URLs. Google redirects to Supabase; Supabase then redirects to this app.
7. Publish the updated frontend, choose **Continue with Google**, complete sign-in, save preferences, then sign out and back in to verify persistence. The same button handles new and returning users. No Gmail mailbox access is requested.

Google setup is external to this repository. Automated tests simulate provider responses and do not verify Google Cloud configuration or a real OAuth round trip. See the [official Supabase Google guide](https://supabase.com/docs/guides/auth/social-login/auth-google).

## Run locally

Node.js is needed only for the preview server and tests:

```sh
node scripts/serve.cjs
```

Open <http://127.0.0.1:4173/>. Use HTTP on localhost or HTTPS when deployed, rather than opening the HTML file directly.

## Automated checks

```sh
pnpm install --frozen-lockfile
pnpm test
```

The tests use jsdom and a simulated Supabase client to verify login errors, signup/recovery handling, preference persistence across fresh pages, account switching, failed reads/writes, stale responses after sign-out, and text-safe transaction rendering. These tests do **not** establish that the deployed database policies or email delivery are configured correctly.

## Live verification after setup

1. Register two test users and confirm both emails. Confirm a wrong password is rejected.
2. Save different settings in each account. Refresh, sign out/in, and sign in from another browser/device; each should retrieve only its own saved settings.
3. Cancel wizard edits and confirm the previous settings remain.
4. Disconnect the network while saving: the wizard should retain the draft and show that the save could not be confirmed. Reconnect and retry.
5. Request a password reset; follow its email link and confirm that the new password works.
6. Verify row-level security with a test user's JWT against the REST API: selecting another user's row must return no rows; inserting/updating settings with another user's ID must fail or affect no rows. An anonymous request must not access the table. Do this before relying on the service for real users.

## Files

- `index.html`: dashboard and preference wizard.
- `accounts.js`, `accounts.css`: account UI, session handling, and sign-in gate.
- `preferences.js`, `settings-store.js`: preference validation and scoped database reads/writes.
- `config.js`: public Supabase connection values.
- `supabase/schema.sql`: database setup and authorization policies.
- `vendor/supabase.js`: official `@supabase/supabase-js` **2.117.1** browser bundle, downloaded from jsDelivr; MIT license included alongside it. Vendored so the app does not depend on an unpinned CDN script at runtime.

Official references: [email/password authentication](https://supabase.com/docs/guides/auth/passwords), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [email delivery](https://supabase.com/docs/guides/auth/auth-smtp).
