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
https://schedule-e-ai-extract.<your-subdomain>.workers.dev
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
EXPO_PUBLIC_EXTRACT_URL=https://schedule-e-ai-extract.<your-subdomain>.workers.dev
EXPO_PUBLIC_APP_TOKEN=<same value you set for APP_SHARED_SECRET>
```

Then restart Expo (`npx expo start --tunnel --clear`). The Settings → AI
section will now show "Set up — receipts are read automatically."

## Verifying the deploy

Quick check from anywhere:
```bash
curl https://schedule-e-ai-extract.<your-subdomain>.workers.dev/health
# expected: ok
```

Try an unauthorized call (should be 401):
```bash
curl -X POST https://schedule-e-ai-extract.<your-subdomain>.workers.dev/extract \
  -H 'Content-Type: application/json' \
  -d '{}'
# expected: Unauthorized
```

## Updating

After making changes:
```bash
cd workers/extract
npx wrangler deploy
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
