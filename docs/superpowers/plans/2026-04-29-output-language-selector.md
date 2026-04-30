# Output Language Selector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an avatar-dropdown language selector that makes all AI-generated output (chat + Studio artifacts) respond in the user's chosen language, persisted in a new `userPreferences` Convex table.

**Architecture:** A new `userPreferences` Convex table stores `outputLanguage` per user. A shared `withLanguageInstruction()` helper appends a language directive to any system prompt. Each Studio job and the chat stream action fetch the preference from the DB (via `userId` they already hold) and apply the helper. The frontend `LanguageSelector` component owns its own hook and renders inline in the avatar dropdown.

**Tech Stack:** Convex (schema, internalQuery, query, mutation, convex-test), LangChain (`SystemMessage`), React 19 + Tailwind 4, Lucide React, vitest

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `convex/schema.ts` | Modify | Add `userPreferences` table |
| `convex/userPreferences/index.ts` | New | `getMyPreferences`, `getPreferencesByUserId`, `setOutputLanguage` |
| `convex/userPreferences/index.test.ts` | New | convex-test: preference CRUD + validation |
| `convex/_agents/_shared/languageInstruction.ts` | New | `withLanguageInstruction()`, `SUPPORTED_LANGUAGES` |
| `convex/_agents/_shared/languageInstruction.test.ts` | New | vitest: pure function behavior |
| `convex/_agents/chat/chat_llm_types.ts` | Modify | Add `outputLanguage?` to `LLMWrapperConfig` |
| `convex/_agents/chat/ChatAgent.ts` | Modify | Pass `outputLanguage` from options to `ChatLLMWrapper` |
| `convex/_agents/chat/llm_wrapper.ts` | Modify | Store `outputLanguage`; apply `withLanguageInstruction` in all system prompt assemblies |
| `convex/chat/stream.ts` | Modify | Fetch preference, pass `outputLanguage` to `new ChatAgent(...)` |
| `convex/studio/flashcards/flashcardJobPhases.ts` | Modify | Fetch preference, wrap `MAP_SYSTEM_PROMPT` |
| `convex/studio/reports/` | Modify | Same pattern — see Task 6 |
| `convex/studio/quizzes/` | Modify | Same pattern |
| `convex/studio/slides/` | Modify | Same pattern |
| `convex/studio/spreadsheets/` | Modify | Same pattern |
| `convex/studio/writtenQuestions/` | Modify | Same pattern |
| `convex/studio/mindmaps/` | Modify | Same pattern |
| `convex/studio/audio/` | Modify | Same pattern (transcript only) |
| `apps/web/src/features/auth/constants/languages.ts` | New | `SUPPORTED_LANGUAGES`, `LanguageCode` type |
| `apps/web/src/features/auth/hooks/useOutputLanguage.ts` | New | React hook: read/write preference |
| `apps/web/src/features/auth/components/LanguageSelector.tsx` | New | Self-contained dropdown row |
| `apps/web/src/features/auth/components/AvatarDropdown.tsx` | Modify | Render `<LanguageSelector>` |

---

## Task 1: Frontend language constants

**Files:**
- Create: `apps/web/src/features/auth/constants/languages.ts`

- [ ] **Step 1: Create the constants file**

```typescript
// apps/web/src/features/auth/constants/languages.ts
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
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];
```

- [ ] **Step 2: Typecheck**

```bash
bun run typecheck:web
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/auth/constants/languages.ts
git commit -m "feat(lang): frontend language constants"
```

---

## Task 2: Backend language instruction helper (TDD)

**Files:**
- Create: `convex/_agents/_shared/languageInstruction.ts`
- Create: `convex/_agents/_shared/languageInstruction.test.ts`

> Before any Convex code change, read `convex/_generated/ai/guidelines.md` for Convex-specific coding rules.

- [ ] **Step 1: Write the failing test**

```typescript
// convex/_agents/_shared/languageInstruction.test.ts
import { describe, expect, it } from "vitest";
import { withLanguageInstruction, SUPPORTED_LANGUAGES } from "./languageInstruction";

describe("withLanguageInstruction", () => {
  it("returns prompt unchanged when language is undefined", () => {
    expect(withLanguageInstruction("System prompt.")).toBe("System prompt.");
  });

  it("returns prompt unchanged for English", () => {
    expect(withLanguageInstruction("System prompt.", "en")).toBe("System prompt.");
  });

  it("appends Spanish instruction", () => {
    const result = withLanguageInstruction("You are a tutor.", "es");
    expect(result).toContain("You are a tutor.");
    expect(result).toContain("Spanish");
    expect(result.indexOf("You are a tutor.")).toBeLessThan(result.indexOf("Spanish"));
  });

  it("returns prompt unchanged for unknown code", () => {
    expect(withLanguageInstruction("System prompt.", "xx")).toBe("System prompt.");
  });

  it("exports all 15 languages", () => {
    expect(SUPPORTED_LANGUAGES).toHaveLength(15);
  });

  it("every language code is unique", () => {
    const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
bun run test:convex --reporter=verbose 2>&1 | grep -A 3 "languageInstruction"
```

Expected: `Cannot find module './languageInstruction'`

- [ ] **Step 3: Implement the helper**

```typescript
// convex/_agents/_shared/languageInstruction.ts
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
] as const;

export type SupportedLanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

export const VALID_LANGUAGE_CODES: string[] = SUPPORTED_LANGUAGES.map((l) => l.code);

/**
 * Appends a language instruction to a system prompt.
 * Returns the prompt unchanged for English or unknown codes (no prompt overhead).
 */
export function withLanguageInstruction(systemPrompt: string, language?: string): string {
  if (!language || language === "en") return systemPrompt;
  const lang = SUPPORTED_LANGUAGES.find((l) => l.code === language);
  if (!lang) return systemPrompt;
  return `${systemPrompt}\n\nIMPORTANT: You must respond entirely in ${lang.label}. All output text must be in ${lang.label}.`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
bun run test:convex --reporter=verbose 2>&1 | grep -A 3 "languageInstruction"
```

Expected: all 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add convex/_agents/_shared/languageInstruction.ts convex/_agents/_shared/languageInstruction.test.ts
git commit -m "feat(lang): withLanguageInstruction helper + tests"
```

---

## Task 3: Convex schema + userPreferences module (TDD)

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/userPreferences/index.ts`
- Create: `convex/userPreferences/index.test.ts`

> Read `convex/_generated/ai/guidelines.md` before starting.

- [ ] **Step 1: Write the failing tests**

```typescript
// convex/userPreferences/index.test.ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../schema";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<
  string,
  () => Promise<unknown>
>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [
    key.replace(/^\/convex\//, "./"),
    loader,
  ]),
);

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

async function seedUser(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test" }));
}

describe("setOutputLanguage", () => {
  test("stores a valid language code", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await withAuth(t, userId).mutation(api.userPreferences.index.setOutputLanguage, {
      outputLanguage: "es",
    });
    const prefs = await t.run(async (ctx) =>
      ctx.db
        .query("userPreferences")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    );
    expect(prefs?.outputLanguage).toBe("es");
  });

  test("upserts on second call (no duplicate rows)", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);
    await asUser.mutation(api.userPreferences.index.setOutputLanguage, { outputLanguage: "fr" });
    await asUser.mutation(api.userPreferences.index.setOutputLanguage, { outputLanguage: "ja" });
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("userPreferences")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].outputLanguage).toBe("ja");
  });

  test("rejects an unknown language code", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await expect(
      withAuth(t, userId).mutation(api.userPreferences.index.setOutputLanguage, {
        outputLanguage: "xx",
      }),
    ).rejects.toThrow();
  });
});

describe("getMyPreferences", () => {
  test("returns null when no row exists", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const result = await withAuth(t, userId).query(api.userPreferences.index.getMyPreferences, {});
    expect(result).toBeNull();
  });

  test("returns stored preference after mutation", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const asUser = withAuth(t, userId);
    await asUser.mutation(api.userPreferences.index.setOutputLanguage, { outputLanguage: "ko" });
    const result = await asUser.query(api.userPreferences.index.getMyPreferences, {});
    expect(result?.outputLanguage).toBe("ko");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
bun run test:convex --reporter=verbose 2>&1 | grep -A 3 "userPreferences"
```

Expected: errors about missing module / schema table.

- [ ] **Step 3: Add `userPreferences` table to schema**

In `convex/schema.ts`, add this entry inside `defineSchema({...})` (after the `userOnboarding` table, before `notebookShareLinks`):

```typescript
  userPreferences: defineTable({
    userId: v.id("users"),
    outputLanguage: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
```

- [ ] **Step 4: Create the Convex module**

```typescript
// convex/userPreferences/index.ts
import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "../_generated/server";
import { getAuthUserId } from "../auth";
import { VALID_LANGUAGE_CODES } from "../_agents/_shared/languageInstruction";

export const getMyPreferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    return prefs ? { outputLanguage: prefs.outputLanguage } : null;
  },
});

export const getPreferencesByUserId = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
    return prefs ? { outputLanguage: prefs.outputLanguage } : null;
  },
});

export const setOutputLanguage = mutation({
  args: { outputLanguage: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError("Unauthenticated");
    if (!VALID_LANGUAGE_CODES.includes(args.outputLanguage)) {
      throw new ConvexError("Unsupported language code");
    }
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, {
        outputLanguage: args.outputLanguage,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId,
        outputLanguage: args.outputLanguage,
        updatedAt: Date.now(),
      });
    }
  },
});
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
bun run test:convex --reporter=verbose 2>&1 | grep -E "(userPreferences|PASS|FAIL)" | head -20
```

Expected: all 6 tests in `userPreferences/index.test.ts` pass.

- [ ] **Step 6: Typecheck**

```bash
bun run typecheck:convex
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add convex/schema.ts convex/userPreferences/index.ts convex/userPreferences/index.test.ts
git commit -m "feat(lang): userPreferences table + Convex module + tests"
```

---

## Task 4: UI — hook, LanguageSelector, AvatarDropdown

**Files:**
- Create: `apps/web/src/features/auth/hooks/useOutputLanguage.ts`
- Create: `apps/web/src/features/auth/components/LanguageSelector.tsx`
- Modify: `apps/web/src/features/auth/components/AvatarDropdown.tsx`

- [ ] **Step 1: Create the hook**

```typescript
// apps/web/src/features/auth/hooks/useOutputLanguage.ts
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";

export function useOutputLanguage() {
  const prefs = useQuery(api.userPreferences.index.getMyPreferences);
  const setLanguageMutation = useMutation(api.userPreferences.index.setOutputLanguage);
  return {
    language: prefs?.outputLanguage ?? "en",
    isLoading: prefs === undefined,
    setLanguage: (code: string) => void setLanguageMutation({ outputLanguage: code }),
  };
}
```

- [ ] **Step 2: Create the LanguageSelector component**

```tsx
// apps/web/src/features/auth/components/LanguageSelector.tsx
import React from "react";
import { Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../constants/languages";
import { useOutputLanguage } from "../hooks/useOutputLanguage";

interface LanguageSelectorProps {
  isAuthenticated: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ isAuthenticated }) => {
  const { language, isLoading, setLanguage } = useOutputLanguage();

  if (!isAuthenticated) return null;

  return (
    <div className="px-4 py-2.5 flex items-center gap-3 text-sm font-sans">
      <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-foreground">Output language</span>
      <select
        value={language}
        disabled={isLoading}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          setLanguage(e.target.value);
        }}
        className="text-xs bg-transparent border border-border rounded px-1.5 py-0.5 text-muted-foreground cursor-pointer hover:border-ring focus:outline-none focus:border-ring disabled:opacity-50"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
};
```

The `stopPropagation` on both `onClick` and `onChange` prevents the custom `DropdownMenu` from closing when the user interacts with the select. The row intentionally lacks `role="menuitem"` so the dropdown stays open after selection.

- [ ] **Step 3: Add LanguageSelector to AvatarDropdown**

In `apps/web/src/features/auth/components/AvatarDropdown.tsx`:

Add import at the top:
```typescript
import { LanguageSelector } from "./LanguageSelector";
```

Inside the `<div className="py-1">` block, add `<LanguageSelector>` between the theme toggle button and the `onRestartTour` button:

```tsx
        {/* Language Selector */}
        <LanguageSelector isAuthenticated={isAuthenticated} />
```

The full `<div className="py-1">` block after the change:
```tsx
      <div className="py-1">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
          role="menuitem"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <Moon className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
        </button>

        {/* Language Selector */}
        <LanguageSelector isAuthenticated={isAuthenticated} />

        {isAuthenticated && onRestartTour && (
          <button
            onClick={onRestartTour}
            className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
            role="menuitem"
          >
            <RotateCcw className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Restart tour</span>
          </button>
        )}
        {isAuthenticated && showChecklistDismissed && onShowChecklist && (
          <button
            onClick={onShowChecklist}
            className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
            role="menuitem"
          >
            <ListChecks className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Show getting-started checklist</span>
          </button>
        )}

        {/* Login/Logout */}
        <button
          onClick={isAuthenticated ? handleLogout : onLogin}
          className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
          role="menuitem"
        >
          {isAuthenticated ? (
            <LogOut className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <LogIn className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <span>{isAuthenticated ? "Logout" : "Login"}</span>
        </button>
      </div>
```

- [ ] **Step 4: Typecheck web**

```bash
bun run typecheck:web
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/auth/hooks/useOutputLanguage.ts \
        apps/web/src/features/auth/components/LanguageSelector.tsx \
        apps/web/src/features/auth/components/AvatarDropdown.tsx
git commit -m "feat(lang): LanguageSelector UI + hook"
```

---

## Task 5: Chat agent injection

**Files:**
- Modify: `convex/_agents/chat/chat_llm_types.ts` (add `outputLanguage?` to `LLMWrapperConfig`)
- Modify: `convex/_agents/chat/ChatAgent.ts` (pass `outputLanguage` from `ChatAgentOptions` to `ChatLLMWrapper`)
- Modify: `convex/_agents/chat/llm_wrapper.ts` (store + apply in system prompt assembly)
- Modify: `convex/chat/stream.ts` (fetch preference, pass to `new ChatAgent(...)`)

- [ ] **Step 1: Add `outputLanguage` to `LLMWrapperConfig` and `ChatAgentOptions`**

In `convex/_agents/chat/chat_llm_types.ts`, add to `LLMWrapperConfig` (after `fastApiKey?`):
```typescript
  /** BCP-47 language code for output language instruction. undefined = English (no prompt overhead). */
  outputLanguage?: string;
```

In `convex/_agents/chat/types.ts`, add to `ChatAgentOptions` (after `fetchDocumentFn?`):
```typescript
  /** BCP-47 language code to pass to the LLM wrapper for system prompt language injection. */
  outputLanguage?: string;
```

- [ ] **Step 2: Pass `outputLanguage` through `ChatAgent` constructor**

In `convex/_agents/chat/ChatAgent.ts`, in the `constructor` where `new ChatLLMWrapper({...})` is called (around line 59), add `outputLanguage: options?.outputLanguage`:

```typescript
    this.llmWrapper = new ChatLLMWrapper({
      apiKey: env.TOGETHER_AI_API_KEY,
      model: smartModel,
      temperature: parseFloat(env.CHAT_LLM_TEMPERATURE ?? "0.1"),
      fastModel: env.FAST_LLM,
      fastApiKey: env.TOGETHER_AI_API_KEY,
      outputLanguage: options?.outputLanguage,   // ADD THIS LINE
    });
```

- [ ] **Step 3: Apply `withLanguageInstruction` in `llm_wrapper.ts`**

In `convex/_agents/chat/llm_wrapper.ts`:

**3a.** Add import at the top (with the other `_shared` imports):
```typescript
import { withLanguageInstruction } from "../_shared/languageInstruction.js";
```

**3b.** Add a private field to `ChatLLMWrapper` class (below the `togetherClient` field declaration):
```typescript
  private readonly outputLanguage?: string;
```

**3c.** In the `constructor`, store the value (after `this.togetherClient = new Together({...})`):
```typescript
    this.outputLanguage = config.outputLanguage;
```

**3d.** In `generateDirectResponse` (around line 96), after the `if (chatSettings)` block, apply the instruction:
```typescript
    systemPrompt = withLanguageInstruction(systemPrompt, this.outputLanguage);
```

The full patched section:
```typescript
    let systemPrompt =
      "You are a helpful study assistant. Answer the user conversationally and concisely. " +
      "If they are asking about specific content from their documents, let them know you can search " +
      "for it if they rephrase their question.";
    if (chatSettings) {
      systemPrompt += buildNotebookChatInstructionBlock(chatSettings);
    }
    systemPrompt = withLanguageInstruction(systemPrompt, this.outputLanguage);  // ADD
```

**3e.** There are two places in `llm_wrapper.ts` where `CORE_SYSTEM_PROMPT` is assembled into `systemPrompt` (search for `let systemPrompt = strictGrounding`). In **both** places, apply `withLanguageInstruction` after the `if (chatSettings)` block:
```typescript
    if (chatSettings) {
      systemPrompt += buildNotebookChatInstructionBlock(chatSettings);
    }
    systemPrompt = withLanguageInstruction(systemPrompt, this.outputLanguage);  // ADD
```

- [ ] **Step 4: Fetch preference in `convex/chat/stream.ts` and pass to `ChatAgent`**

In `convex/chat/stream.ts`, find the action handler that calls `new ChatAgent({...})` (around line 697). Add a preference fetch immediately before it.

`internal` is already imported in `stream.ts` (line 4). Add the preference fetch and pass `outputLanguage` to `ChatAgent`:
```typescript
  // Fetch output language preference for this user
  const userPrefs = await ctx.runQuery(
    internal.userPreferences.index.getPreferencesByUserId,
    { userId: userId as any },
  );

  const agent = new ChatAgent({
    vectorSearchHandler: hybridSearch,
    globalRerankFn,
    smartModel: resolvedSmartModel,
    outputLanguage: userPrefs?.outputLanguage,   // ADD
    fetchDocumentFn: async (documentId: string) => {
      // ... existing body unchanged
    },
  });
```

- [ ] **Step 5: Typecheck Convex**

```bash
bun run typecheck:convex
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add convex/_agents/chat/chat_llm_types.ts \
        convex/_agents/chat/types.ts \
        convex/_agents/chat/ChatAgent.ts \
        convex/_agents/chat/llm_wrapper.ts \
        convex/chat/stream.ts
git commit -m "feat(lang): inject output language into chat agent"
```

---

## Task 6: Studio job injection

**Pattern:** In the `*JobPhases.ts` file for each studio type, add two things:
1. A preference fetch at the start of the phase function that runs the LLM (using the `userId` and `ctx` already available).
2. Wrap every `new SystemMessage(SOME_PROMPT)` call with `withLanguageInstruction(SOME_PROMPT, language)`.

The import to add in each phase file:
```typescript
import { withLanguageInstruction } from "../../_agents/_shared/languageInstruction";
import { internal } from "../../_generated/api";
```

The DB fetch pattern to add at the start of each phase function that calls an LLM:
```typescript
    const userPrefs = await ctx.runQuery(
      internal.userPreferences.index.getPreferencesByUserId,
      { userId: args.userId as any },
    );
    const language = userPrefs?.outputLanguage;
```

The prompt wrap pattern (example for a map-phase system message):
```typescript
// Before:
new SystemMessage(MAP_SYSTEM_PROMPT)
// After:
new SystemMessage(withLanguageInstruction(MAP_SYSTEM_PROMPT, language))
```

**Full worked example — Flashcards:**

- [ ] **Step 1: Modify `convex/studio/flashcards/flashcardJobPhases.ts`**

Add imports:
```typescript
import { withLanguageInstruction } from "../../_agents/_shared/languageInstruction";
```
(`internal` is already imported in this file.)

In `runProcessFlashcardMapChunkPhase` — find the line `new SystemMessage(MAP_SYSTEM_PROMPT)` (around line 313–316) and replace with:
```typescript
new SystemMessage(withLanguageInstruction(MAP_SYSTEM_PROMPT, language))
```

Add the preference fetch at the start of `runProcessFlashcardMapChunkPhase` (it already has `ctx` and `args.userId`):
```typescript
    const userPrefs = await ctx.runQuery(
      internal.userPreferences.index.getPreferencesByUserId,
      { userId: args.userId as any },
    );
    const language = userPrefs?.outputLanguage;
```

The collapse and reduce system prompts (`COLLAPSE_SYSTEM_PROMPT`, `REDUCE_SYSTEM_PROMPT`) are used in `convex/_agents/flashcard/collapseReduceLlm.ts`, which is called from within the flashcard phase functions. Add `language?: string` as a parameter to `recursiveCollapse` and `refineFlashcardSelection` in that file, thread the value through from the calling phase function, and apply `withLanguageInstruction` to `COLLAPSE_SYSTEM_PROMPT` and `REDUCE_SYSTEM_PROMPT` there. Grep to find all call sites:
```bash
grep -n "new SystemMessage\|COLLAPSE_SYSTEM\|REDUCE_SYSTEM" convex/_agents/flashcard/collapseReduceLlm.ts
```

- [ ] **Step 2: Apply the same pattern to the remaining 7 studio jobs**

For each job, find the `*JobPhases.ts` file (or equivalent phase file) and apply the same fetch + wrap pattern to every `new SystemMessage(...)` call:

| Studio | Phase file(s) to modify |
|---|---|
| Reports | `convex/studio/reports/reportJobPhases.ts` |
| Quizzes | `convex/studio/quizzes/quizJobPhases.ts` |
| Slides | `convex/studio/slides/slideDeckJobPhases.ts` |
| Spreadsheets | `convex/studio/spreadsheets/spreadsheetJobPhases.ts` |
| Written questions | `convex/studio/writtenQuestions/writtenQuestionsJobPhases.ts` |
| Mindmaps | `convex/studio/mindmaps/mindmapJobPhases.ts` |
| Audio | `convex/studio/audio/audioJobPhases.ts` (transcript generation only — `withLanguageInstruction` does not affect TTS voice; the language instruction will make the transcript itself be in the target language, which TTS will then speak) |

To find every system prompt injection point across all studio phase files at once:
```bash
grep -rn "new SystemMessage(" convex/studio/ --include="*.ts"
```

Apply `withLanguageInstruction(PROMPT, language)` to each result, with the preference fetch added once per phase function.

- [ ] **Step 3: Typecheck Convex**

```bash
bun run typecheck:convex
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add convex/studio/
git commit -m "feat(lang): inject output language into all Studio job prompts"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full test suite**

```bash
bun run test:convex
```

Expected: all tests pass (existing 277 + the ~12 new ones from Tasks 2–3).

- [ ] **Step 2: Web typecheck**

```bash
bun run typecheck:web
```

Expected: no errors.

- [ ] **Step 3: Lint**

```bash
bun run lint
```

Expected: no errors (fix any with `bun run lint:fix`).

- [ ] **Step 4: Manual smoke test**

1. Run `bun run dev:web` and `bun x convex dev` in separate terminals.
2. Open the app, sign in, click the avatar.
3. Verify the "Output language" row appears between theme toggle and Restart tour.
4. Change language to Spanish (`es`).
5. Reload the page — verify Spanish is still selected (persisted to Convex).
6. Generate a flashcard set — verify the cards are in Spanish.
7. Send a chat message — verify the reply is in Spanish.
8. Switch back to English — verify AI output returns to English.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(lang): output language selector — full feature"
```
