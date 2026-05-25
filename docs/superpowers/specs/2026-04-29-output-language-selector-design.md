# Output Language Selector — Design Spec

**Date:** 2026-04-29
**Status:** Approved

## Overview

Add a language selector to the avatar dropdown menu that controls the language of all AI-generated output — both Studio artifacts (flashcards, reports, quizzes, slides, spreadsheets, written questions, mindmaps, audio transcripts) and the chat agent. The multilingual embedding (`intfloat/multilingual-e5-large-instruct`) already handles cross-language retrieval; this feature surfaces the model's native multilingual generation capability.

## Decisions

| Decision         | Choice                                                     | Rationale                                                               |
| ---------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| Scope            | Chat + all Studio agents                                   | Models support multilingual output; embeddings are already multilingual |
| Persistence      | Convex `userPreferences` table                             | Cross-device sync; clean semantic home for future per-user settings     |
| Language list    | Curated 15 languages                                       | Covers ~80% of global internet users; avoids unwieldy picker            |
| Prompt injection | `withLanguageInstruction()` helper, fetched at job runtime | DRY; no graph state changes; `userId` already present in every job      |
| Default          | English (`"en"`)                                           | No prompt overhead for the majority of users                            |

## 1. Data Layer

### Schema (`convex/schema.ts`)

New table added to `defineSchema`:

```typescript
userPreferences: defineTable({
  userId: v.id("users"),
  outputLanguage: v.optional(v.string()), // BCP-47 code; undefined = "en"
  updatedAt: v.number(),
}).index("by_user", ["userId"]),
```

### Convex module (`convex/userPreferences/index.ts`)

- **`getMyPreferences`** — authenticated public `query` (uses `ctx.auth`), reads row by the authed `userId`, returns `{ outputLanguage?: string } | null`. Used by the frontend hook.
- **`getPreferencesByUserId`** — `internalQuery` that accepts `userId: v.id("users")` as an explicit arg. Used by jobs/actions (which are scheduled and do not carry user auth context).
- **`setOutputLanguage`** — authenticated public `mutation`, upserts the row (`outputLanguage`, `updatedAt`). Server-side validates the code against the known list and throws `ConvexError("Unsupported language code")` for unknown values.

## 2. Language Constants

Language definitions live in **two separate files** due to the Convex/frontend boundary — `convex/_agents/` files are backend-only and cannot be imported by the web app.

### Frontend (`apps/web/src/features/auth/constants/languages.ts`)

```typescript
export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "ar", label: "Arabic" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "hi", label: "Hindi" },
  { code: "id", label: "Indonesian" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "es", label: "Spanish" },
  { code: "tr", label: "Turkish" },
  { code: "ur", label: "Urdu" },
  { code: "vi", label: "Vietnamese" },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];
```

### Backend helper (`convex/_agents/_shared/languageInstruction.ts`)

Contains its own copy of the language list (these are plain string constants — duplication is fine and avoids any cross-boundary coupling). Exports `withLanguageInstruction()`:

```typescript
export function withLanguageInstruction(systemPrompt: string, language?: string): string {
  if (!language || language === "en") return systemPrompt;
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === language);
  if (!lang) return systemPrompt;
  return `${systemPrompt}\n\nIMPORTANT: You must respond entirely in ${lang.label}. All output text must be in ${lang.label}.`;
}
```

English is the default — no extra tokens added for most users. Unknown codes are silently treated as English (belt-and-suspenders; the mutation already validates at write time).

The Convex `setOutputLanguage` mutation imports the backend list for server-side validation.

## 3. Backend Injection

### Studio jobs

Each of the following job files already receives `userId` and `ctx`. They fetch the preference once at job entry and pass `language` to wherever `withLanguageInstruction()` is called on their system prompt strings:

- `convex/studio/flashcards/job.ts`
- `convex/studio/reports/job.ts`
- `convex/studio/quizzes/job.ts`
- `convex/studio/slides/job.ts`
- `convex/studio/spreadsheets/job.ts`
- `convex/studio/writtenQuestions/job.ts`
- `convex/studio/mindmaps/job.ts`
- `convex/studio/audio/job.ts` — applies to transcript generation step only. Note: TTS will speak in the target language since it reads the translated transcript; this is intentional and desirable behavior.

Pattern per job:

```typescript
const prefs = await ctx.runQuery(internal.userPreferences.index.getPreferencesByUserId, { userId });
const language = prefs?.outputLanguage;
// pass language into withLanguageInstruction(SYSTEM_PROMPT, language) at prompt-build sites
```

### Chat agent

`ChatAgentContext` (`convex/_agents/chat/types.ts`) gains one optional field:

```typescript
outputLanguage?: string;
```

The HTTP action handler (`convex/http.ts`) that builds `ChatAgentContext` fetches the preference via `getPreferencesByUserId` and sets this field. Inside `llm_wrapper.ts`, the language instruction is applied exactly once at system message construction:

```typescript
withLanguageInstruction(CORE_SYSTEM_PROMPT, context.outputLanguage);
```

`CORE_SYSTEM_PROMPT` is a module-level constant used in one place in `llm_wrapper.ts`. Confirm it is not re-constructed mid-request before applying the wrap — if any sub-call rebuilds the system prompt independently, it must also receive `context.outputLanguage`.

## 4. UI

### Hook (`apps/web/src/features/auth/hooks/useOutputLanguage.ts`)

```typescript
export function useOutputLanguage() {
  const prefs = useQuery(api.userPreferences.index.getMyPreferences);
  const setLanguageMutation = useMutation(api.userPreferences.index.setOutputLanguage);
  return {
    language: prefs?.outputLanguage ?? "en",
    isLoading: prefs === undefined,
    setLanguage: (code: string) => setLanguageMutation({ outputLanguage: code }),
  };
}
```

`isLoading` lets the selector render as disabled while the preference loads, avoiding a flash from English → selected language on mount.

### Component (`apps/web/src/features/auth/components/LanguageSelector.tsx`)

A self-contained row styled to match the existing `AvatarDropdown` button rows:

- Owns `useOutputLanguage()` internally — no props needed from `AvatarDropdown`
- Globe icon (Lucide `Globe`) + current language label as the trigger
- Uses **Radix `Select`** (`@radix-ui/react-select`) for consistent cross-OS styling, matching the rest of the app's UI primitives
- Renders disabled while `isLoading`
- Only rendered when `isAuthenticated` (caller's responsibility via conditional render)

### `AvatarDropdown.tsx` changes

No new props. Renders `<LanguageSelector />` (no props) between the theme toggle and login/logout, guarded by `isAuthenticated`.

### `Header.tsx` changes

No new hook calls needed. `Header` passes `isAuthenticated` to `AvatarDropdown` as it already does; `LanguageSelector` is self-contained.

## 5. Files Changed

| File                                                         | Change                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `convex/schema.ts`                                           | Add `userPreferences` table                                                 |
| `convex/userPreferences/index.ts`                            | **New** — `getMyPreferences`, `getPreferencesByUserId`, `setOutputLanguage` |
| `convex/_agents/_shared/languageInstruction.ts`              | **New** — `withLanguageInstruction()` helper + backend language list        |
| `convex/_agents/chat/types.ts`                               | Add `outputLanguage?: string` to `ChatAgentContext`                         |
| `convex/_agents/chat/llm_wrapper.ts`                         | Wrap `CORE_SYSTEM_PROMPT` with `withLanguageInstruction`                    |
| `convex/http.ts`                                             | Fetch preference via `getPreferencesByUserId`, set `context.outputLanguage` |
| `convex/studio/*/job.ts` (×8)                                | Fetch preference, pass to `withLanguageInstruction` at prompt sites         |
| `apps/web/src/features/auth/constants/languages.ts`          | **New** — frontend language list + `LanguageCode` type                      |
| `apps/web/src/features/auth/hooks/useOutputLanguage.ts`      | **New** — React hook with `language`, `isLoading`, `setLanguage`            |
| `apps/web/src/features/auth/components/LanguageSelector.tsx` | **New** — self-contained Radix Select component                             |
| `apps/web/src/features/auth/components/AvatarDropdown.tsx`   | Render `<LanguageSelector />` guarded by `isAuthenticated`                  |

`Header.tsx` requires no changes — `LanguageSelector` is self-contained.

## 6. Out of Scope

- UI translation (no i18n library; app chrome remains in English)
- Per-notebook language override (global preference only)
- Audio TTS voice selection (voice is a separate concern; transcript language does follow the preference)
- Language auto-detection from document content
