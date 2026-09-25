# Cashcaval

A static personal-finance dashboard with Supabase email/password accounts and per-user preferences. The frontend can run on GitHub Pages without a build step.

## Current scope

- The dashboard headline is saved net worth (assets minus liabilities). Recorded transaction balance remains below it: income minus every recorded outflow (including transfers and investments), in RON. It is not net worth or a bank balance. Amounts display cents.
- Each transaction has Edit and Delete controls. Edits replace the same record and persist; Cancel leaves the original unchanged. Unfinished edit drafts restore after refresh. Undo last deletion restores deleted entries in reverse order during the current session; the undo history clears on refresh/logout.
- Static sample charts, goals and sample insights have individual Demo badges. No additional database migration is needed for these controls.

- Sign up, confirm email, sign in, sign out on this browser, and reset a password by email.
- Save base currency, daily allowance and its currency, baseline monthly burn, and projection horizon.
- Restore saved settings after refresh or sign-in on another device. Save confirmation appears only after a database response.
- Preferences are protected by database row-level security. Password handling and session refresh use the official Supabase client.
- Transactions, scenario sliders, chart selection, current view and unfinished transaction entries autosave to the account. The “All changes saved” indicator confirms the database response. Logout flushes pending saves and stays on the page if a save fails; Retry saving preserves the current edits.
- New accounts start with an empty transaction list. Net worth starts unset until the user saves assets and liabilities. Goal and projection illustrations remain **sample data**. Currency preferences do not convert those figures.
- Other devices retrieve saved data on their next load/sign-in. App data uses revision checks: a stale tab/device cannot overwrite a newer saved version. A conflict keeps local edits visible and asks the user to copy unsaved entries before reloading. Preferences still use last successful save wins.

## Upgrade an existing deployment for persistent transactions

Run [`supabase/persistent-data.sql`](supabase/persistent-data.sql) in the Supabase SQL Editor **before publishing this version**. It adds a separate account-data table with per-user row-level security and leaves existing preferences intact. Do not rerun the original schema on an existing project. The app keeps the dashboard hidden if it cannot load account data, including when this migration is missing.

Previously added transactions that disappeared on logout in the old version were never stored and cannot be recovered from Supabase. This version saves new entries. Keep the page open if saving fails; unsaved data is held in memory, not in an offline database. Browser-close warnings are best-effort and cannot prevent OS/browser crashes.

## Connect Supabase before publishing

1. Create a project at <https://supabase.com/dashboard>.
2. Open its SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql) and then [`supabase/persistent-data.sql`](supabase/persistent-data.sql), each once. These create the settings and account-data tables with policies restricting reads and writes to the signed-in user's ID. Ensure the `public` schema is exposed through the project's Data API.
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

After editing browser assets, run `node scripts/version-assets.cjs` before testing and publishing. The HTML references content-versioned JavaScript/CSS so browsers fetch changed files instead of mixing old and new app code. `pnpm test` checks these versions. An already-open tab still needs a reload after deployment.

Adding a transaction starts saving immediately; the Add button and transaction form show “Saving…” until the server responds. A failure keeps the entry visible with Retry saving and does not claim success.

```sh
pnpm install --frozen-lockfile
pnpm test
```

The tests use jsdom and a simulated Supabase client to verify login errors, signup/recovery handling, persistence across fresh pages, account switching, failed reads/writes, queued saves, logout flushing, multi-device conflicts, stale responses after sign-out, and text-safe transaction rendering. These tests do **not** establish that the deployed database policies or email delivery are configured correctly.

## Live verification after setup

1. Register two test users and confirm both emails. Confirm a wrong password is rejected.
2. Add different transactions, scenario values and settings in each account. Wait for “All changes saved,” refresh, sign out/in, and sign in from another browser/device; each should retrieve only its own saved data.
3. Cancel wizard edits and confirm the previous settings remain.
4. Disconnect the network while saving: the wizard should retain the draft and show that the save could not be confirmed. Reconnect and retry.
5. Request a password reset; follow its email link and confirm that the new password works.
6. Verify row-level security with a test user's JWT against the REST API: selecting another user's row must return no rows; inserting/updating settings with another user's ID must fail or affect no rows. An anonymous request must not access the table. Do this before relying on the service for real users.

## Files

- `index.html`: dashboard and preference wizard.
- `accounts.js`, `accounts.css`: account UI, session handling, and sign-in gate.
- `preferences.js`, `settings-store.js`: preference validation and scoped database reads/writes.
- `app-state.js`, `account-data.js`: validated account data, autosave queue, save status and conflict checks.
- `config.js`: public Supabase connection values.
- `supabase/schema.sql`: database setup and authorization policies.
- `supabase/persistent-data.sql`: additional account-data table and authorization policies.
- `vendor/supabase.js`: official `@supabase/supabase-js` **2.117.1** browser bundle, downloaded from jsDelivr; MIT license included alongside it. Vendored so the app does not depend on an unpinned CDN script at runtime.

Official references: [email/password authentication](https://supabase.com/docs/guides/auth/passwords), [row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [email delivery](https://supabase.com/docs/guides/auth/auth-smtp).

## Net worth calculator

The setup wizard includes a net-worth step with editable categories, + Add asset, + Add liability, removal and live totals. A single snapshot currency applies to all amounts; changing currencies never converts values. Assets use full values and liabilities use outstanding balances. Transactions do not automatically change this snapshot. Existing users can select Update net worth.

Run `supabase/net-worth.sql` once before deploying (already applied for this project). It only adds `user_settings.net_worth`; it does not change transactions or existing preferences. Settings and net worth save together under the existing per-user access rules.

Category reference: https://www.ramseysolutions.com/retirement/net-worth-calculator

Browser QA: `node scripts/preview-test.cjs` serves the actual app against an isolated in-memory account service at http://127.0.0.1:4174. Use `/?new=1` for first-time setup. This test service never connects to Supabase and is not loaded by the deployed app. Automated tests include unique IDs, independent visible navigation views, account separation, refresh/re-login, save failures, custom items and validation.

Phone layout: responsive.css stacks cards and forms, keeps horizontally scrollable navigation, contains wide tables, and keeps wizard navigation outside its scrolling body. With the isolated QA server running, open /scripts/phone-preview.html for 320px and 390px browser previews.

## Cashcaval identity
The interface uses golden yellow (#F5BC35), midnight navy (#132238), and warm ivory (#FAF8F2). branding.css applies the visual theme after the responsive stylesheet. assets/cashcaval-mark.svg is the scalable cheese/pie-chart mark; assets/cashcaval-icon.svg is the browser icon. Internal FinTrack JavaScript interfaces stay stable for compatibility. Version checks cover SVG assets as well as scripts and styles.

Branding verified across all seven screens, with sign-in and wizard visual checks at 320px and 390px. No database migration is required.

## English / Romanian

Choose EN or RO on sign-in, in the header or in Preferences. The initial choice follows the browser language unless explicitly remembered on this browser. Signed-in accounts restore their saved choice from user_app_state.state.language, using the existing revision-protected save mechanism. No SQL migration is required; existing rows without language remain valid. Finishing first-time setup saves the initial language as well.

translations.js contains the Romanian dictionary; English UI strings are the source keys. i18n.js registers static interface text once and tracks explicit dynamic interface writes. User-generated text is not scanned or translated. Option values and navigation IDs remain language-independent. Numeric display uses Intl locales; stored amounts, currencies, custom asset names and transaction descriptions are unchanged. Browser-native validation messages and external Google/Supabase email pages follow their own language settings.
