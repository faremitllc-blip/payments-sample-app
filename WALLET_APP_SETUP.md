# Mondo setup

Mondo is a consumer wallet app: sign up, create a wallet, send and
receive USDC, and see activity.

It runs in **test mode only**. It accepts Circle test API keys, and test USDC
has no value.

## How it fits together

- **Sign-in:** Supabase Auth (email and password), called from the browser.
- **Database:** Supabase stores which Circle wallet belongs to which user.
- **Wallet actions:** server routes in `server/api` call Circle with your API
  key and entity secret. These secrets never reach the browser. Every route
  checks the user's sign-in token and only touches that user's own wallet.

## 1. Supabase

1. Create a project at supabase.com.
2. Open **SQL Editor -> New query**, paste the contents of
   `supabase/schema.sql`, and click **Run**.
3. Open **Project Settings -> API** and copy the project URL, the `anon`
   key, and the `service_role` key.
4. Open **Authentication -> Providers -> Email**. For quick testing you can
   switch off "Confirm email". For a real launch, keep it on and set a proper
   site URL under **Authentication -> URL Configuration**.

## 2. Circle

1. In the Circle Console, create a **test** API key.
2. Set up **Developer-Controlled Wallets**: generate an entity secret, register
   it, and **save the recovery file somewhere safe**. Circle's quickstart at
   developers.circle.com walks through this. The secret is 64 hex characters.

## 3. Vercel settings

Add every variable from `.env.example` under **Settings -> Environment
Variables**, then **redeploy**. The Supabase values are baked in when the site
is built, so a redeploy is needed after any change.

Build settings: this app now has server routes, so it must be built as a
normal Nuxt app.

- Framework preset: **Nuxt**
- Build command: leave the **default** (do **not** use `yarn generate`)
- Output directory: leave the **default** (do **not** use `.output/public`)
- Node.js version: **22.x**

## 4. Try it

1. Open the site, click **Sign up**, then **Create wallet**.
2. Copy your address from the wallet page and request test USDC at
   faucet.circle.com (pick the same network the wallet page shows).
3. Press **Refresh**, then try **Send**.

## Notes and limits

- Default network is Polygon Amoy (test). Change it with `CIRCLE_BLOCKCHAIN`.
- Wallets are smart-contract accounts (`SCA`). On test networks Circle's gas
  sponsorship can cover fees. If a send fails with a fee error, check the
  Circle Console gas settings for your network.
- Per-transfer cap is set by `MAX_SEND_USDC`. If it is not set, it is 100 USDC with a
  test key and 20 USDC with a live key.
- Going live with real money needs far more than this sample: compliance and
  KYC, a real rate limiter, monitoring, and a security review.

## Going live (real money)

Read this whole section before you change anything.

**What is and is not confirmed.** Circle's docs say testnet and mainnet use
separate keys, and that sponsored gas fees on mainnet are charged to the
developer's credit card, not to end users. They also say that if your platform
holds assets for end users, regulatory licensing may apply where you operate.
The docs reviewed did not say how to get mainnet access, what a live key looks
like, or whether live needs its own entity secret. Check Circle Console, or ask
Circle, for those.

**Before you flip the switch**

1. Get live access in Circle Console and create a **live** API key. It will not
   start with `TEST_API_KEY:`.
2. Register an entity secret for the live environment, and save its recovery
   file somewhere safe. Use a different secret from the test one.
3. In Circle Console, set up gas sponsorship (Gas Station) and a payment method
   for the network you choose, or sends will fail.
4. In Supabase, switch **Confirm email back on** (Authentication, Providers,
   Email), and set a real site URL.
5. Decide on licensing and compliance (KYC, sanctions screening, terms). This
   sample app has none of that, and no two-step login.

**Switching**

1. Upload the latest package so the screens show live-mode labels.
2. In Supabase SQL Editor, run `supabase/go-live-reset.sql`. It removes saved
   test wallets (they only hold test tokens).
3. In Vercel, for the **Production** environment only, set:
   `CIRCLE_API_KEY` (live key), `CIRCLE_ENTITY_SECRET` (live secret),
   `CIRCLE_BLOCKCHAIN` (a mainnet code such as `BASE` or `MATIC`; confirm the
   exact code in Circle's docs), `ALLOW_LIVE_FUNDS` = `true`, and
   `MAX_SEND_USDC` = a small number such as `10`.
4. Redeploy. The top bar should now say "Live mode".
5. Test with a very small amount first. Raise `MAX_SEND_USDC` slowly.

**Switching back**: put the test key and test secret back, remove
`ALLOW_LIVE_FUNDS`, set `CIRCLE_BLOCKCHAIN` to a testnet, run
`go-live-reset.sql` again, and redeploy.

## Bank accounts (USD, EUR, GBP via Bridge)

Users can open US, euro and pound bank details. Money paid in is converted to
USDC and sent to the user's own Mondo wallet address. The identity check runs on
Bridge's hosted page, so Mondo never sees ID documents.

**Set up once**
1. In the Supabase SQL Editor, run `supabase/add-bank-accounts.sql`. It adds two
   tables and does not touch wallets.
2. In Bridge, switch the dashboard to **Sandbox**, create an API key (it starts
   with `sk-test`), and add it in Vercel as `BRIDGE_API_KEY` (Production).
3. Redeploy with "Use existing Build Cache" unticked.
4. Open **Bank** in Mondo. Test mode shows buttons to approve the test identity
   check and to simulate a deposit, so you can try the whole flow without money.

**Facts from Bridge's documentation**
- USD uses ACH or wire, EUR uses SEPA (a virtual IBAN), GBP uses Faster Payments.
- GBP needs a Faster Payments endorsement and EUR a SEPA endorsement on your
  Bridge account. Ask Bridge to enable them. Then set `BRIDGE_ENDORSEMENTS`.
- GBP deposits: Bridge accepts them from the account holder's own bank account,
  and from other people only if they are businesses.
- Virtual accounts are a separate Bridge product that may need to be switched on
  for your account.

**Not confirmed, check before going live**
- Fees, limits, and which countries Bridge can verify. Ask Bridge.
- Whether Bridge needs anything from you before taking real customers in the UK
  or EU. Bank deposits for other people can bring licensing duties for you. Get
  proper legal advice first.

**Going live with banking**
Live Bridge keys are blocked until `ALLOW_LIVE_BANKING=true` is set. Live
accounts also need a wallet on a real network (not a test network), so the Circle
live setup has to work first. Never share the Bridge key.

**Testing bank accounts before a wallet exists (sandbox only)**
With a Bridge sandbox key, a user can open test bank accounts before creating a
wallet. They use a made-up placeholder address, and nothing real is sent. Once
the wallet exists, press **Connect my wallet** on the Bank page and Bridge is
told to deliver to the real address. With a live Bridge key this shortcut is
off: a real wallet is always required. Run the latest
`supabase/add-bank-accounts.sql` once so the database has the new column.

**Switching bank accounts from sandbox to live**
1. Run `supabase/go-live-banking-reset.sql` once. It removes the saved sandbox
   identity checks and accounts. Never run it again once real customers have
   accounts.
2. In Vercel (Production only): set `BRIDGE_API_KEY` to the live key, and set
   `ALLOW_LIVE_BANKING` to `true`. If Bridge has enabled them for you, also set
   `BRIDGE_ENDORSEMENTS` to `sepa,faster_payments`.
3. Redeploy with "Use existing Build Cache" unticked.
4. Each user passes a real identity check, then opens an account. The wallet
   must be on a real network (Polygon, for example), never a test network.
To go back, set `ALLOW_LIVE_BANKING` to empty and use the sandbox key again.

## The Mondo assistant (Gemini)

The assistant lives at `/assistant` and on the dashboard ("Ask Mondo AI").

1. Create an API key at aistudio.google.com.
2. In Vercel, under Settings, Environment Variables, add `ANTHROPIC_API_KEY`
   (Production). Optionally add `ANTHROPIC_MODEL` to pick a model; leave it
   empty for the default.
3. Redeploy with the build cache unticked.

How it stays safe:

- It can read your balance, activity and bank status on its own.
- Sending USDC, creating a wallet, starting the identity check and opening a
  bank account are only *proposed*. An approval card shows the exact details,
  and nothing runs until you tap Approve.
- The server never runs an action. The app runs it through the normal API, so
  every existing limit still applies (sign-in, per-transfer cap, live-funds
  switch, rate limits).
- The Gemini key never reaches the browser.
- The design reference for the mobile apps is `design/agent-reference.png`.

## Profile page and photos

Run `supabase/add-profiles.sql` once in the Supabase SQL Editor (New query,
paste, Run). It adds one small table for display names and photos. Photos are
cropped to a 256 x 256 JPEG in the browser and saved with the profile.

## Speed notes (v23)

- The home and Activity screens load wallet, balance and activity in one request (`/api/dashboard`), and show the last data straight away while refreshing.
- The server remembers the signed-in user for 60 seconds, the wallet row for 2 minutes and the Bank status for 15 seconds (the "check status" buttons skip that).
- Only the Vuetify parts Mondo uses are loaded; the old sample-app plugins, stores and debug pages are left out of the build.
- Delete these old files from GitHub if still there: `pages/developers.vue`, `layouts/default.vue`, `components/WalletCards.vue`.

## Landing-page globe (v24)

The rotating dot-matrix globe (lit sun side, dim night side, routes between crypto and fiat hubs) is `components/GlobeHero.vue`. It is used only in `pages/index.vue`, so it never loads inside the wallet. The map data (`utils/globeData.ts`, from Natural Earth, public domain) downloads separately, only on the landing page. The routes are illustrative, not live payment data. It pauses when off screen or when the tab is hidden, and holds still for people who prefer reduced motion.

## Landing-page light and dark mode (v26)

The landing page has a sun/moon button in the top bar. The choice is saved in the browser and defaults to the device setting. The mode is written to `<html data-mo-theme>`, and both the page styles and the globe follow it, so they always share one background. It only applies on the landing page, and the wallet screens are unchanged.
