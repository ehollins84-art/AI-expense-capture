# Receipt extraction Worker

A Cloudflare Worker that proxies receipt-extraction calls to Anthropic.
The mobile app sends image bytes + a list of categories; the Worker holds
the Anthropic API key as a server-side secret (it never ships in the app
bundle) and forwards the call to the Anthropic Messages API.

## Why this exists

The previous setup loaded the Anthropic API key directly into the React
Native bundle via `EXPO_PUBLIC_ANTHROPIC_API_KEY`. That's fine for personal
dev, but in any production iOS build anyone with the `.ipa` can extract the
key in minutes. This Worker fixes that for App Store distribution.

## One-time deploy (from your Codespace)

You need a free Cloudflare account: https://dash.cloudflare.com/sign-up
(no credit card required for the Workers free tier).

```bash
cd workers/extract
npm install
npx wrangler login                                     # opens a browser
npx wrangler secret put ANTHROPIC_API_KEY              # paste your Anthropic key
npx wrangler secret put APP_SHARED_SECRET              # paste a long random string (see below)
npx wrangler deploy
```

After `deploy`, wrangler prints a URL like:
```
https://manila-extract.<your-subdomain>.workers.dev
```

Copy that URL.

### Pick an APP_SHARED_SECRET

Generate a long random string (32+ chars). One easy way:
```bash
openssl rand -hex 32
```
Paste that as the value when wrangler prompts for `APP_SHARED_SECRET`.
You'll paste the SAME value into the app's `.env` (see below) so the app
can authenticate to the Worker.

## Wire it into the app

Open `.env` in the project root and set:
```
EXPO_PUBLIC_EXTRACT_URL=https://manila-extract.<your-subdomain>.workers.dev
EXPO_PUBLIC_APP_TOKEN=<same value you set for APP_SHARED_SECRET>
```

Then restart Expo (`npx expo start --tunnel --clear`). The Settings → AI
section will now show "Set up — receipts are read automatically."

## Verifying the deploy

Quick check from anywhere:
```bash
curl https://manila-extract.<your-subdomain>.workers.dev/health
# expected: ok
```

Try an unauthorized call (should be 401):
```bash
curl -X POST https://manila-extract.<your-subdomain>.workers.dev/extract \
  -H 'Content-Type: application/json' \
  -d '{}'
# expected: Unauthorized
```

## Shared projects (D1 database)

The same Worker also backs **shared projects** — projects two people can both
add expenses to and see a combined total. This needs a Cloudflare D1 database
(SQLite, on the free tier). Receipt *photos* are never uploaded here; only the
expense details (title, date, category, amount) sync, keyed by share.

Identity is each user's Google account: the app sends the signed-in user's
Google token with every request and the Worker verifies it against Google's
userinfo endpoint, so a client can never impersonate someone else. (Users must
connect Google in the app's Settings to use sharing — same sign-in as Drive.)

### One-time setup (from your Codespace)

```bash
cd workers/extract
npx wrangler d1 create manila-shares
```

Wrangler prints a `database_id`. Paste it into `wrangler.toml` under
`[[d1_databases]]` (replacing `REPLACE_WITH_D1_DATABASE_ID`). Then create the
tables and deploy:

```bash
npx wrangler d1 migrations apply manila-shares --remote
npx wrangler deploy
```

That's it — no new app config. Sharing reuses the same Worker URL and
`APP_SHARED_SECRET` you already set for receipt extraction
(`EXPO_PUBLIC_EXTRACT_URL` + `EXPO_PUBLIC_APP_TOKEN`).

### Verifying

```bash
curl -X POST https://manila-extract.<your-subdomain>.workers.dev/shares/pull \
  -H 'x-app-token: <APP_SHARED_SECRET>' -H 'Content-Type: application/json' -d '{}'
# expected: 401 "Sign in with Google ..." (no Google token supplied)
```

If the database binding is missing, `/shares/*` returns `503` and receipt
extraction keeps working — the two features are independent.

## Updating

After making changes:
```bash
cd workers/extract
npx wrangler deploy
```

If you changed the shared-projects schema, apply migrations first:
```bash
npx wrangler d1 migrations apply manila-shares --remote
```

Rotating secrets:
```bash
npx wrangler secret put ANTHROPIC_API_KEY   # overwrite
```

## Cost

Cloudflare Workers free tier: 100,000 requests/day. Each receipt extraction
is 1 request. You will not hit this limit with personal use. The Anthropic
calls themselves bill against the API key you provided — Cloudflare doesn't
add a margin.
