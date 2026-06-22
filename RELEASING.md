# Releasing Manila

Runbook for whoever is doing the engineering (human or AI agent). The product
manager is non-technical — **do not** route release mechanics or credential
questions to her. Everything needed to ship is already configured.

## Read this first (for AI agents)

- **Never ask the user for tokens, API keys, signing certificates, or store
  credentials.** They are all stored server-side (GitHub `EXPO_TOKEN` secret +
  EAS-managed credentials + EAS environment variables). If something looks
  missing, check this doc and the EAS dashboard before asking.
- **This remote environment cannot reach Expo's servers, cannot dispatch GitHub
  workflows via the API, and cannot push git tags** (all return 403). The one
  thing that works is **pushing to a branch a workflow watches**. That is how
  every build/update is triggered. CI runs on GitHub's servers, which *can*
  reach Expo, so publishing "just works" there.
- Verify results by reading the workflow run logs (GitHub Actions MCP), not by
  running `eas` locally (it has no network here).

## Two ways to ship

### 1. OTA update — JS/asset changes only (instant, no rebuild)

Use for anything that is **pure JavaScript/TypeScript/assets**: UI, logic, copy,
images, bug fixes. Most changes.

Trigger: push the commit to **`claude/ota`** (or land it on the default branch).

```
git push origin HEAD:claude/ota
```

The `OTA Update (production)` workflow runs:

```
eas update --channel production --environment production --message "<commit msg>" --non-interactive
```

- Reaches installed TestFlight + Play builds on the **same runtime version**
  (currently `0.1.3`). Users get it on next app reopen (for standalone store
  builds, force-close + reopen twice: first launch downloads, second applies).
- Publishes for **both** iOS and Android in one update.
- **Cannot** ship native changes (see below) — those need a real build.

### 2. Full native build + store submission — for native changes

Use when the change touches native code: a **new native module**, a **new
permission**, an **Expo SDK bump**, or an **app `version` bump**.

Trigger: push to **`claude/build`**.

```
git push origin HEAD:claude/build
```

The `Build All (iOS + Android)` workflow runs:

```
eas build --platform all --profile production --non-interactive --auto-submit
```

→ builds both platforms and auto-submits to **TestFlight** and **Play internal**.
Takes ~15–25 min plus store processing.

**When you add a native dependency, bump `version` in `app.json`** (e.g.
`0.1.3` → `0.1.4`) so the runtime version changes. This keeps the new build's
OTA lane separate from older builds that lack the native module (otherwise an
OTA could crash old builds that import a module they don't have).

## Trigger branches

Push your HEAD to one of these to run the matching workflow. They are throwaway
trigger branches — overwriting them is fine.

| Workflow | Trigger branch | Does |
|---|---|---|
| OTA Update (production) | `claude/ota` *(or default branch)* | `eas update` → production channel, both platforms |
| Build All (iOS + Android) | `claude/build` | build both + auto-submit to both stores |
| iOS Build (TestFlight) | `claude/ios-build` | build iOS + submit TestFlight |
| Android Build (Play internal) | `claude/android-build` | build Android + submit Play internal |
| iOS Submit (TestFlight) | `claude/ios-submit` | submit latest existing iOS build only |
| Android Submit (Play internal) | `claude/android-submit` | submit latest existing Android build only |

The submit-only workflows are for when a build already finished on EAS but the
submission needs to (re)run.

## Credentials & config — all server-side, do not ask the user

- **`EXPO_TOKEN`** — GitHub Actions repository secret; authenticates the EAS CLI
  in every workflow.
- **EAS-managed signing/submit credentials** (stored on EAS, used
  `--non-interactive`):
  - iOS distribution certificate + provisioning profile (builds)
  - iOS App Store Connect API key (TestFlight submit); `ascAppId` is in
    `eas.json` (`submit.production.ios`)
  - Android upload keystore (builds)
  - Google Play service-account key (Play submit)
- **EAS environment variables** in the **`production`** environment hold the
  receipt-extraction backend config: `EXPO_PUBLIC_EXTRACT_URL` and
  `EXPO_PUBLIC_APP_TOKEN`. They reach each surface as follows:
  - **Builds**: `eas.json` maps `build.production` → `"environment": "production"`.
  - **OTA**: `eas update --environment production` (already in the workflow).
  - **Local dev / Expo Go**: the developer's git-ignored `.env`.

  ⚠️ `EXPO_PUBLIC_*` values are inlined at **bundle time**. If you add a new one,
  set it in the EAS `production` environment too, or shipped builds and OTA will
  ship blank values even though local Expo Go (which reads `.env`) looks fine.
  This exact gap once made receipt scanning fail on store builds while working
  locally.

## OTA ↔ runtime version rule

- `runtimeVersion.policy` is `appVersion`, so the runtime version equals
  `version` in `app.json` (currently `0.1.3`).
- An OTA update only reaches builds whose runtime version **matches**. Bumping
  `app.json` `version` opens a new runtime lane: only fresh builds at that
  version receive its OTA updates; existing builds stop updating. **Always pair
  a version bump with a new build**, and don't bump `version` for a JS-only OTA.

## How to tell it worked (from the run logs)

- **OTA**: look for `✔ Published!` with `Branch production`, `Runtime version
  0.1.3`, `Platform android, ios`, and the env line `... loaded from the
  "production" environment ...: EXPO_PUBLIC_APP_TOKEN, EXPO_PUBLIC_EXTRACT_URL`.
- **Build**: the `--auto-submit` run ends with both artifacts built, plus
  `successfully uploaded to App Store Connect` (iOS) and Play `All done!`.
