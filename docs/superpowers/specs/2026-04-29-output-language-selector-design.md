# Output Language Selector — Design Spec

**Date:** 2026-04-29
**Status:** Approved

## Overview

Add a language selector to the avatar dropdown menu that controls the language of all AI-generated output — both Studio artifacts (flashcards, reports, quizzes, slides, spreadsheets, written questions, mindmaps, audio transcripts) and the chat agent. The multilingual embedding (`intfloat/multilingual-e5-large-instruct`) already handles cross-language retrieval; this feature surfaces the model's native multilingual generation capability.

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | Chat + all Studio agents | Models support multilingual output; embeddings are already multilingual |
| Persistence | Convex `userPreferences` table | Cross-device sync; clean semantic home for future per-user settings |
| Language list | Curated 15 languages | Covers ~80% of global internet users; avoids unwieldy picker |
| Prompt injection | `withLanguageInstruction()` helper, fetched at job runtime | DRY; no graph state changes; `userId` already present in every job |
| Default | English (`"en"`) | No prompt overhead for the majority of users |

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
- **`setOutputLanguage`** — authenticated public `mutation`, upserts the row (`outputLanguage`, `updatedAt`)

## 2. Language Instruction Helper

**New file:** `convex/_agents/_shared/languageInstruction.ts`

```typescript
export const SUPPORTED_LANGUAGES = [
  { code: "en",    label: "English" },
  { code: "ar",    label: "Arabic" },
  { code: "zh-CN", label: "Chinese (Simplified)" },
  { code: "fr",    label: "French" },
  { code: "de",    label: "German" },
  { code: "hi",    label: "Hindi" },
  { code: "id",    label: "Indonesian" },
  { code: "ja",    label: "Japanese" },
  { code: "ko",    label: "Korean" },
  { code: "pt",    label: "Portuguese" },
  { code: "ru",    label: "Russian" },
  { code: "es",    label: "Spanish" },
  { code: "tr",    label: "Turkish" },
  { code: "ur",    label: "Urdu" },
  { code: "vi",    label: "Vietnamese" },
];

export function withLanguageInstruction(systemPrompt: string, language?: string): string {
  if (!language || language === "en") return systemPrompt;
  const lang = SUPPORTED_LANGUAGES.find(l => l.code === language);
  if (!lang) return systemPrompt;
  return `${systemPrompt}\n\nIMPORTANT: You must respond entirely in ${lang.label}. All output text must be in ${lang.label}.`;
}
```

`SUPPORTED_LANGUAGES` is also exported for use in the frontend selector.

## 3. Backend Injection

### Studio jobs

Each of the following job files already receives `userId` and `ctx`. They fetch the preference once at entry and pass `language` to wherever `withLanguageInstruction()` is called on their system prompt strings:

- `convex/studio/flashcards/job.ts`
- `convex/studio/reports/job.ts`
- `convex/studio/quizzes/job.ts`
- `convex/studio/slides/job.ts`
- `convex/studio/spreadsheets/job.ts`
- `convex/studio/writtenQuestions/job.ts`
- `convex/studio/mindmaps/job.ts`
- `convex/studio/audio/job.ts` (transcript generation step only; TTS voice is unaffected)

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

The HTTP handler that builds `ChatAgentContext` fetches the preference and sets this field. Inside `llm_wrapper.ts`, `CORE_SYSTEM_PROMPT` is wrapped:
```typescript
withLanguageInstruction(CORE_SYSTEM_PROMPT, context.outputLanguage)
```

## 4. UI

### Hook (`apps/web/src/features/auth/hooks/useOutputLanguage.ts`)

```typescript
export function useOutputLanguage() {
  const prefs = useQuery(api.userPreferences.index.getMyPreferences);
  const setLanguageMutation = useMutation(api.userPreferences.index.setOutputLanguage);
  return {
    language: prefs?.outputLanguage ?? "en",
    setLanguage: (code: string) => setLanguageMutation({ outputLanguage: code }),
  };
}
```

### Component (`apps/web/src/features/auth/components/LanguageSelector.tsx`)

A single row styled to match the existing `AvatarDropdown` button rows:
- Globe icon (Lucide `Globe`) + current language label on the left
- Native `<select>` populated from `SUPPORTED_LANGUAGES`, styled with Tailwind to match the dropdown aesthetic
- Calls `setLanguage(code)` on change
- Only rendered when `isAuthenticated`

### `AvatarDropdown.tsx` changes

Adds two props:
```typescript
outputLanguage: string;
onLanguageChange: (code: string) => void;
```

Renders `<LanguageSelector>` between the theme toggle row and login/logout, guarded by `isAuthenticated`.

### `Header.tsx` changes

Pulls `const { language, setLanguage } = useOutputLanguage()` and passes as `outputLanguage` / `onLanguageChange` to `<AvatarDropdown>`.

## 5. Files Changed

| File | Change |
|---|---|
| `convex/schema.ts` | Add `userPreferences` table |
| `convex/userPreferences/index.ts` | **New** — `getMyPreferences` query + `setOutputLanguage` mutation |
| `convex/_agents/_shared/languageInstruction.ts` | **New** — helper + language list |
| `convex/_agents/chat/types.ts` | Add `outputLanguage?: string` to `ChatAgentContext` |
| `convex/_agents/chat/llm_wrapper.ts` | Wrap `CORE_SYSTEM_PROMPT` with `withLanguageInstruction` |
| `convex/chat/` (HTTP handler) | Fetch preference, set `context.outputLanguage` |
| `convex/studio/*/job.ts` (×8) | Fetch preference, pass to `withLanguageInstruction` at prompt sites |
| `apps/web/src/features/auth/hooks/useOutputLanguage.ts` | **New** — React hook |
| `apps/web/src/features/auth/components/LanguageSelector.tsx` | **New** — selector UI component |
| `apps/web/src/features/auth/components/AvatarDropdown.tsx` | Add props + render `<LanguageSelector>` |
| `apps/web/src/shared/ui/Header.tsx` | Wire `useOutputLanguage()` → `AvatarDropdown` |

## 6. Out of Scope

- UI translation (no i18n library; app chrome remains in English)
- Per-notebook language override (global preference only)
- Audio TTS voice language (voice selection is a separate concern)
- Language auto-detection from document content
