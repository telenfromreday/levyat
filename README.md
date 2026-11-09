# Livyato

Upload a bank statement, get organised business records, plain-English analysis and an assistant that answers questions about your numbers. Nothing in this project depends on Claude or any AI service.

## What is in the box

| Component | What it does | Where it lives |
|---|---|---|
| Frontend | The website and the dashboard customers see | `public/index.html` (home), `public/app.html` (the app), `public/legal.html` (terms, privacy, cookies), `public/login.html` |
| Backend | Saves and opens statements, runs the business calculations, handles payments | `api/*.js` (server functions), `lib/*.js` (calculations and helpers) |
| Database | Stores accounts, businesses, statements, transactions, subscriptions, audit log | `db/schema.sql` (Supabase Postgres) |
| File storage | Securely stores uploaded statements in a private bucket | Supabase Storage, `api/upload-url.js` |
| AI integration | Answers questions from verified calculations, using fixed rules, no AI service | `lib/assistant.js` (server), `public/app.html` (same logic in the browser) |
| Authentication | Registration, login, password reset | Supabase Auth, `public/login.html`, `public/js/account.js`, `lib/auth.js` |
| Payments | Monthly subscriptions through Paystack | `api/billing/checkout.js`, `api/billing/webhook.js`, `lib/billing.js` |
| Hosting | Puts it online with your own domain | Netlify, `netlify.toml`, `netlify/functions/api.js` |

Without any setup, `public/` works as a plain website: statements are read in the browser and nothing is stored. Accounts, saving and payments switch on once you add your keys.

## Set it up (about two hours, no coding)

You need a computer for step 1. Everything else works in a phone browser, but a computer is easier.

**1. Put the code on GitHub**
Create an account at github.com, make a new private repository called `livyato`, then drag the contents of this folder into it using "Add file, Upload files". Keep the folder structure (`api`, `lib`, `public`, `db`).

**2. Create the database and login (Supabase)**
1. Sign up at supabase.com and create a project. Choose the region closest to South Africa and save the database password.
2. Open SQL Editor, paste all of `db/schema.sql`, and press Run.
3. Open Project Settings, API. Copy the Project URL, the `anon` key and the `service_role` key. The service_role key is secret: it goes only into Netlify, never into GitHub.
4. In GitHub, open `public/config.js` and paste the Project URL and anon key between the quotes. Commit the change.
5. In Authentication, URL Configuration, set the Site URL to your website address and add `https://yourdomain/login` and `https://yourdomain/app` to the redirect list. For real use, set up your own email sender under Authentication, SMTP, because the built-in one is limited.

**3. Put it online (Netlify)**
1. Sign up at netlify.com with your GitHub account. Choose "Add new project", then "Import an existing project", then GitHub, and pick the `livyato` repository.
2. Leave the build settings as they are: `netlify.toml` already sets them. Before deploying, add the environment variables from `.env.example` (Project configuration, Environment variables).
3. Deploy. Open the address Netlify gives you and visit `/api/health`. It should show `{"ok":true}`.

**4. Payments (Paystack)**
1. Create a Paystack account and stay in test mode. Under Products, Plans, create a monthly plan and copy its code.
2. Put the test secret key, plan code and the price in cents into the Netlify environment variables.
3. Under Settings, API Keys and Webhooks, set the webhook URL to `https://yourdomain/api/billing/webhook`.
4. Sign up in your own app, press Subscribe, pay with a Paystack test card, and check the account bar shows "subscribed".
5. When it all works, set `REQUIRE_SUBSCRIPTION=true`, switch Paystack to live keys, and redeploy.

**5. Your domain**
Buy the domain, add it in Netlify (Domain management), and copy the DNS records Netlify shows into your domain registrar. Then change `SITE_URL` in Netlify and the Site URL in Supabase to the new address.

## Test checklist before real customers

- Register, confirm the email, sign in, sign out.
- Load `demo-statement` style data, save it, open it on another device, delete it.
- Register a second user and confirm they cannot see the first user's statements.
- Subscribe with a test card, cancel, and check access ends when the paid period ends.
- Press "Delete my account" and confirm the data is gone in Supabase (Table Editor and Storage).
- Run the automated tests (`npm test`, needs Node 18 or newer). They cover the calculations, the assistant, validation, payments and the server functions against a fake database.

## What this version does not do

- **No AI reading of receipts.** Receipts are typed in (supplier, date, total, VAT) and matched to payments.
- **No AI sorting.** Categories come from built-in rules, plus the corrections the user makes. Corrections are remembered in the browser only, not yet in the database.
- **The assistant is rule-based.** It answers the question types listed in `lib/assistant.js` and says so when it cannot answer. Adding a new question type is adding a rule.
- **PDF statements** are read in the browser and only work for PDFs with selectable text.
- **One person per business.** The database already has roles for teams, but the screens do not use them yet.
- **No bank feeds, Xero/Sage/QuickBooks export, or email forwarding.**
- **Libraries load from public CDNs** (cdnjs, jsDelivr, Google Fonts). Download and host them yourself if you want zero external requests.

## Before you take real customers

- Have a lawyer review `public/legal.html`. See `docs/POLICY-REVIEW.md` for what changed and what to confirm.
- Have a developer do a security review (a few hours is enough for this size).
- Turn on Supabase backups, and add monitoring and rate limiting.
- Have a registered accountant check the VAT and tax estimates, which are estimates only.
