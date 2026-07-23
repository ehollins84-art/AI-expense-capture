# CLAUDE.md

## About Me

I am a product manager, not an engineer. I cannot write code, I do not understand terminal commands, and I do not know how software projects are structured under the hood. Treat me as a non-technical collaborator who knows what she wants the product to do, but needs you to handle 100% of the implementation.

## My Devices

I use **Android as my daily driver**. Every screenshot I send you, every "this looks off" report, every QA pass — that's happening on Android. Make sure features work on Android first; an Android-only quirk is a real bug to me, not a corner case.

That said, I want to **ship to iOS first** for App Store launch — that's where the paying market is for this kind of app. So the long-term release strategy is:
- iOS first to the App Store
- Android Play Store follows shortly after (same codebase, much cheaper / faster review)

What this means for you:
- When you write platform-specific code (e.g., iOS BlurView, iOS modal presentations), make sure there's a clean Android fallback — not just a degraded version.
- When animations or layouts behave differently between platforms, mention it explicitly in your reply so I know whether what I'm seeing on Android matches what an iOS user would see.
- For the App Store launch path, all the iOS-only steps (Apple Developer, EAS Build for iOS, TestFlight, App Store Connect, App Store review) are still on the critical path. You walk me through those normally.
- When in doubt about where to test or validate something, default to "does this work on Android," because that's what I can actually verify on my phone right now.

## Golden Rule

**Never ask me to run a terminal command myself.** If something needs to happen in the terminal — installing a package, restarting a server, running a build, setting an environment variable, fixing a port conflict, clearing a cache — just do it. Do not paste a command and say "run this." Do not say "try running X." Just run it yourself and tell me the result.

## When Things Break

- If the dev server crashes or stops, restart it yourself without asking.
- If a port is already in use, kill the conflicting process and retry.
- If a dependency is missing, install it yourself.
- If a build fails, read the error, fix it, and rebuild.
- If the app is not reflecting my changes, do whatever is needed (restart, rebuild, clear cache) to make it show up, then tell me to refresh my browser.
- If you hit a permissions issue, try to resolve it. Only ask me for help if there is truly no workaround.

## How to Talk to Me

- Skip jargon. Do not say "run npm install" or "the webpack bundle failed." Instead say "I'm installing what's needed" or "the app had a build error — I fixed it, refresh your browser."
- When you finish a task, tell me what changed in plain language. Example: "I added a button to the settings page that sends a password reset email. Refresh to see it."
- If you need a decision from me, frame it as a product choice, not a technical one. Example: "Should the confirmation appear as a popup or a new page?" not "Should I use a modal component or route to /confirm?"
- If something will take multiple steps, give me a quick plain-English summary of your plan before starting. Keep it to 2-3 sentences max.

## When You Need Information From Me

If you need an API key, a login credential, a config value, or access to an external service to proceed, ask me clearly and specifically. Example: "I need the API key for WorkOS. It should be on their dashboard under API Keys — can you paste it here?" Do not assume I know where to find things. Tell me exactly where to look.

## Environment and Setup

- If this is a new project and nothing is set up yet, handle the full setup: install dependencies, create config files, start the dev server. Walk me through only the parts that require my input (like pasting an API key).
- Keep the dev server running in the background. If it stops for any reason, restart it.
- If you need to set environment variables, create or update the .env file yourself.

## Code Quality

- I will not be reviewing your code for correctness. Write clean, well-structured code as if a senior engineer will review it later.
- Add brief comments explaining what non-obvious code does, so a future developer can follow your reasoning.
- Do not take shortcuts that will create problems later just because I cannot see them. Build things properly.

## What I Care About

- **Seeing my changes live.** I test on the **Manila app installed on my phone** (a real TestFlight / Play build), not in a browser and not in Expo Go. After a change you want me to test, get it onto my phone (ship an over-the-air update — see "How I Test Now") and tell me plainly how to see it.
- **Things not breaking.** If you change something, make sure existing features still work.
- **Clear communication.** I would rather you over-explain in simple terms than assume I understood something technical.

## How I Test Now (the app is on my phone — no more Expo / Codespace)

I have the **Manila app installed on my phone** as a real build. I do **not**
run Expo Go, I do **not** open a Codespace, and I do **not** pull code or run
terminal commands to test anymore. That whole workflow is retired — never end a
reply with `git pull` / `npx expo start` lines again, and never tell me to scan
a QR code.

The way a change reaches my phone now is an **over-the-air (OTA) update**: you
publish it, and I reopen the app to get it. So after a change I want to test,
**you** get it onto my phone — I don't do anything on a computer. Here's what
that means for each kind of change:

- **JavaScript / UI / logic / copy / bug-fix change (almost everything):** ship
  it as an OTA update by pushing to the release branch that publishes it (see
  "Shipping to users" below and `RELEASING.md`). Then tell me, in one plain
  line, exactly how to see it — normally: **"Force-close Manila and reopen it
  twice — the first open downloads the update, the second shows it."** (Store
  builds apply an OTA on the *second* reopen, so always say "twice.")

- **Native change** (new native module, new permission, Expo SDK bump, or an
  `app.json` version bump): an OTA can't carry this — it needs a fresh build
  submitted to TestFlight / Play. Kick off the build (see below), then tell me
  in plain English that this one isn't instant: I'll get it as a new app version
  through TestFlight / the Play Store in roughly 20–30 minutes plus store
  processing, and I install it like a normal app update.

- **Doc-only change (CLAUDE.md, AGENTS.md, README, comments):** nothing reaches
  my phone and nothing needs to. Just say "this is doc-only, nothing to test."

Whatever the change, **end your reply by telling me plainly what to do to see
it** (reopen the app, wait for a TestFlight build, or nothing) — don't make me
ask, and don't make me hunt for it. If a change needs something special before
it'll show (sign out and back in, clear something, etc.), say so in one plain
line first.

## Shipping to users (engineering note — this part isn't for me, it's for you)

The release pipeline is fully set up. **Never ask me for tokens, API keys,
signing certificates, or App Store / Play credentials — they're all stored
already** (a GitHub `EXPO_TOKEN` secret, EAS-managed signing/submit credentials
for both stores, and EAS environment variables for the extraction backend). If
something seems missing, check **`RELEASING.md`** and the EAS dashboard before
asking me.

How to ship (this remote environment can't dispatch workflows or push tags — you
trigger CI by pushing to a branch a workflow watches):

- **JavaScript / asset change (most things):** ship an over-the-air update — no
  rebuild. Push the commit to **`claude/ota`** (`git push origin HEAD:claude/ota`).
  The `OTA Update (production)` workflow publishes to the production channel for
  both platforms; live users get it on next reopen.
- **Native change** (new native module, new permission, Expo SDK bump, or an
  `app.json` `version` bump): push to **`claude/build`** to build both platforms
  and auto-submit to TestFlight + Play internal. Bump `version` when native deps
  change.

Full runbook — trigger branches, the OTA-vs-build decision, the runtime-version
rule, and where every credential lives — is in **`RELEASING.md`**. Read it before
shipping.
