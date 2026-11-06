# AI data-sharing consent (mobile app)

Date: 2026-11-05
Status: Approved; implemented on feature/ai-data-consent

## Goal

Before the iOS or Android app sends any of a user's content to a third-party AI service, show what is
sent, who receives it, and get the user's permission. This answers App Review's rejection of iOS 1.0
(build 4) under guidelines 5.1.1(i) and 5.1.2(i).

## Today

- Almost every feature sends user content to a third party: uploads go to OpenAI (embeddings) and
  Mistral (OCR) or Supadata (web/YouTube); chat, titles, Studio, grading and audio go to Together AI;
  ranking to Voyage AI; web search to Tavily; infographic images to OpenAI.
- The privacy policy (`apps/web/src/features/legal/components/PrivacyPolicy.tsx`) names all six
  providers. The app itself never asks.
- The mobile apps are a WebView shell around the web app; `isNativeShell()`
  (`apps/web/src/utils/platformDetection.ts`) tells the web app it is inside one.
- `RootRoutes.tsx` renders `PublicShell` for marketing, legal and sign-in paths and `AppShell` for
  everything else.
- Per-user settings live in `userPreferences` (`outputLanguage`), read by
  `api.userPreferences.index.getMyPreferences`.

## Decisions

| Question | Decision |
| --- | --- |
| Where does it appear? | Only inside the mobile apps (`isNativeShell()`). Web users never see it. |
| When? | Once, after sign-in, before the app renders. Existing users see it on their next app launch. |
| Server enforcement? | None. The gate is the only check; nothing behind it renders, so nothing can call a provider. |
| "Not now"? | The app stays locked behind an "AI features are off" screen with Review and allow, Sign out, Delete account and the privacy policy. |
| Withdrawal | An "AI data sharing" item in the avatar menu (mobile only) with Turn off. |
| Re-asking | The consent text has a version number; bumping it shows the screen again to everyone. |

## Behaviour

`AiConsentGate` wraps `AppShell` in `RootRoutes.tsx`, so none of `AppShell`'s hooks, routes or effects
run until the user has allowed. `PublicShell` routes (privacy policy, terms) are outside the gate and
stay reachable.

For a signed-in user inside the mobile app:

| Stored answer | Shown |
| --- | --- |
| Preferences still loading | Blank loading screen (`AppShellFallback`) |
| No answer, or `aiConsentVersion` below the current version, and not declined | Consent screen |
| `aiConsentDeclinedAt` set (and no current-version consent) | "AI features are off" screen |
| `aiConsentVersion` equals the current version | `AppShell` |

Outside the mobile app, and for signed-out users, the gate renders `AppShell` unchanged (signed-out
handling stays with the existing auth flow).

**Auth blips.** The shell briefly re-authenticates on navigation and queries answer as signed out
(`null`). The state hook keeps the last definite state until the query returns a definite answer for
a signed-in user, so a consenting user never sees the consent screen flash, and a non-consenting user
never sees the app flash.

**Native upload button.** On `/notebook/:id` entry paths (deep links, push taps) the native shell draws its
own upload button over the WebView, which uploads straight to Convex. The web app reports its consent
state over the bridge (`{ type: "shell-web:ai-consent", granted }`: `true` when granted, `false` for
needs-consent or declined, and `false` again when the gate unmounts, e.g. on sign-out). The native shell
shows the button only after a `true` report; it starts hidden. This part ships with the next native build.

### Consent screen copy

Title: "How SolomindLM uses AI". Lead: "To answer your questions and build study materials,
SolomindLM sends some of your content to these services:"

| Provider | Data sent | Purpose |
| --- | --- | --- |
| Together AI | Your questions, your sources, and audio you upload or record | To write answers, notes, quizzes, audio and grading |
| OpenAI | Your questions, source text and infographic prompts | To index and search your sources and draw infographics |
| Voyage AI | Your questions and passages from your sources | To rank the most relevant passages |
| Mistral | PDFs and images you upload | Read their text |
| Tavily | Search terms | Find web sources |
| Supadata | Links you add | Fetch web pages and video transcripts |

Footer: "Change this any time in the menu." plus a Privacy policy link. Buttons: "Allow and continue"
(primary), "Not now" (secondary, same size). No claims about provider retention or training.

### "AI features are off" screen

Title: "AI features are off". Body: "SolomindLM needs these services to read your sources and answer
questions, so the app can't be used without them. You can turn them on any time." Actions: Review and
allow (back to the consent screen), Sign out, Privacy policy, Delete account (existing
`DeleteAccountDialog`).

## Data

Widen `userPreferences` (all optional, no migration):

- `aiConsentVersion?: number`: the version the user allowed; absent means not allowed.
- `aiConsentAt?: number`: time of the latest grant or decline.
- `aiConsentDeclinedAt?: number`: set by Not now, cleared by a grant.

## Backend (`convex/userPreferences/index.ts`)

- `getMyAiConsent()` (query): `{ signedIn: false }` when there is no user, else
  `{ signedIn: true, version: number | null, declined: boolean }`. A separate query rather than
  extending `getMyPreferences`, because that one returns `null` both for "signed out" and for "no row",
  and the gate must tell an auth blip apart from a user who has never answered.
- `grantAiConsent({ version: number })`: sets `aiConsentVersion` and `aiConsentAt`, clears
  `aiConsentDeclinedAt`. Rejects versions that are not integers ≥ 1.
- `declineAiConsent()`: sets `aiConsentDeclinedAt` and `aiConsentAt`, clears `aiConsentVersion`.
  Used by both "Not now" and the avatar menu's Turn off.

Both mutations require `getAuthUserId`, create the user's row if missing, and only touch that row.

## Web (`apps/web/src/features/aiConsent/`)

- `aiConsentCopy.ts`: `AI_CONSENT_VERSION = 1` and the provider table above. The screen renders from it.
- `useAiConsentState()`: returns `notApplicable | loading | needsConsent | declined | granted` from
  `isNativeShell()`, auth state and `getMyAiConsent`, holding the last definite state through blips.
- `AiConsentGate`: renders the screen for the state, or its children.
- `AiConsentScreen`, `AiFeaturesOffScreen`: the two screens, built from `shared/components/ui`
  primitives and semantic tokens (see `docs/design/principles.md`).
- Avatar menu: an "AI data sharing" item in `AvatarDropdown.tsx`, rendered only when
  `isNativeShell()`, opening a dialog that states the current choice and offers Turn off
  (`declineAiConsent`).

**Errors.** A failed grant or decline keeps the user on the current screen with a toast and
the button re-enabled. The gate never assumes consent.

## Testing

- Convex (vitest + convex-test, `convex/userPreferences/index.test.ts`): grant and decline set
  the right fields; grant clears a decline; signed-out calls throw; each call touches only the
  caller's row.
- Web (vitest): `useAiConsentState` for every combination of shell/web, loading, missing, old version,
  declined and granted, plus the blip case; `AiConsentGate` hides its children unless granted and is a
  pass-through on web; the avatar item renders only in the shell.
- Manual: the web app with `window.__IS_NATIVE_SHELL__ = true` (as in the screenshot capture scripts):
  allow, not now, review and allow, turn off. Then TestFlight build 4 against production after deploy.

## Rollout

1. PR, merge, deploy. Build 4 shows the screen immediately (it loads the web app); web is unchanged.
2. Check App Store Connect → App Privacy lists the data shared with these providers, matching the
   screen.
3. Update App Review notes: where the screen appears, that nothing reaches AI providers before
   consent, and where to change the choice.
4. Do not resubmit yet: resubmit once, with the In-App Purchase build and report-a-notebook, replying
   to both guidelines.

## Out of scope

Web consent, server-side enforcement, In-App Purchase (guideline 3.1.1), and reporting/blocking public
notebooks (guideline 1.2). The last two get their own specs.
