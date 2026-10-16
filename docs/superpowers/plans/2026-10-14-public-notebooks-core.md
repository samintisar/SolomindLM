# Public Notebooks Core (PR 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any owner can publish a notebook; every signed-in user can browse public notebooks, open one read-only, chat with it privately, and fork it; admins curate a Featured shelf.

**Architecture:** One new access role (`"viewer"`) in `getNotebookAccess` opens every existing read path for public notebooks while `assertCanEditNotebook` keeps blocking writes. Chat gets per-viewer private conversations through one visibility helper used by every chat entry point. Browsing, publishing, curating and forking live in a new `convex/notebooks/public.ts`. The web app swaps the "Featured" tab for a "Public" tab and threads a `readOnly` flag from `NotebookView` into the sources, studio and chat panels.

**Tech Stack:** Convex (queries/mutations, `convex-test` + vitest), React 19 + Vite, shadcn primitives in `apps/web/src/shared/components/ui`, Testing Library, Playwright.

Spec: [`docs/superpowers/specs/2026-10-14-public-notebooks-design.md`](../specs/2026-10-14-public-notebooks-design.md)

**Before any Convex change:** read `convex/_generated/ai/guidelines.md`.

**Commands** (run from the worktree root):

- Convex tests: `bun run test:convex -- <path>` (whole suite: `bun run test:convex`)
- Web tests: `bun run test:web -- <path>`
- Typecheck: `bun run typecheck:convex` then `bun run typecheck:web` (not in parallel)
- Codegen after adding a Convex module: `npx convex codegen`

---

## File map

**Backend**

| File | Change |
| --- | --- |
| `convex/schema.ts` | `notebooks.isPublic`, `notebooks.publishedAt`, two indexes; `conversations.isPrivate` |
| `convex/_lib/notebookAccess.ts` | `"viewer"` role |
| `convex/_lib/notebookAccess.test.ts` | viewer cases |
| `convex/_model/conversations.ts` | `isConversationVisible`, `listVisibleConversations`, `getPrimaryVisibleConversation`, `conversationPrivacy` |
| `convex/_lib/conversationAccess.ts` | visibility-aware read/edit checks |
| `convex/_lib/conversationAccess.test.ts` | privacy cases |
| `convex/chat/index.ts`, `convex/chat/conversations.ts`, `convex/chat/messages.ts` | use the visibility helpers |
| `convex/chat/messages.test.ts` | viewer chat cases |
| `convex/_model/notebooks.ts`, `convex/notebooks/index.ts`, `convex/folders/index.ts` | DTO gains `access` / `isPublic` / `ownerName`; `isFeatured` no longer user-settable |
| `convex/notebooks/public.ts` (new) | `setPublic`, `listPublic`, `listFeatured`, `setFeatured`, `adminUnpublish`, `forkPublic` |
| `convex/notebooks/public.test.ts` (new) | tests for the above |
| `convex/notebooks/_forkNotebook.ts` + test | copy studio-visible literature tables and reports |

**Web**

| File | Change |
| --- | --- |
| `apps/web/src/shared/types/index.ts` | `NotebookItem` fields |
| `apps/web/src/features/notebooks/services/notebooksApi.ts` | public hooks; drop `isFeatured` from update |
| `apps/web/src/features/notebooks/hooks/useNotebookCRUD.ts` | drop `isFeatured` |
| `apps/web/src/features/notebooks/components/views/PublicSection.tsx` (+test, replaces `FeaturedSection`) | Featured shelf + Community grid |
| `apps/web/src/features/notebooks/components/home/HomeHeader.tsx`, `HomePage.tsx` | `"public"` tab |
| `apps/web/src/features/notebooks/components/cards/NotebookCard.tsx` (+test) | Public badge, author, admin actions |
| `apps/web/src/features/notebooks/useNotebookContext.ts`, `apps/web/src/shell/AppShell.tsx` | drop `featuredNotebooks`; load visited public notebook; Fork + byline in header |
| `apps/web/src/shared/ui/Header.tsx` | `byline` + `onFork` props |
| `apps/web/src/features/notebooks/components/modals/ShareNotebookModal.tsx` | "Make public" switch |
| `apps/web/src/features/notebooks/components/views/NotebookView.tsx` | pass `readOnly` to panels |
| Sources: `SourcesPanel.tsx`, `SourceList.tsx`, `SourceListItem.tsx` | hide add/delete/rename/discover/refresh |
| Studio: `StudioPanel.tsx`, `NoteListView.tsx`, `NoteItem.tsx` | hide tool grid and item menu |
| Chat: `ChatPanel.tsx` | hide notebook chat-config and model persistence |
| `e2e/notebooks/public-notebooks.spec.ts` (new) | publish → Public tab |

---

## Task 1: Schema

**Files:** Modify `convex/schema.ts`

- [ ] **Step 1: Add notebook fields and indexes.** In `notebooks: defineTable({...})`, below `isFeatured`, add:

```ts
    /** Admin-curated: shows on the Public tab's Featured shelf. Only honoured while `isPublic`. */
    // (keep the existing `isFeatured: v.optional(v.boolean()),` line above this comment block)
    /** Visible to every signed-in user (read, private chat, fork). */
    isPublic: v.optional(v.boolean()),
    /** When `isPublic` was last turned on; orders the Public tab. */
    publishedAt: v.optional(v.number()),
```

Move the "Admin-curated" comment so it sits directly above the existing `isFeatured` line. Add indexes after `.index("by_folder", ["folderId"])`:

```ts
    .index("by_isPublic_and_publishedAt", ["isPublic", "publishedAt"])
    .index("by_isFeatured_and_publishedAt", ["isFeatured", "publishedAt"])
```

- [ ] **Step 2: Add conversation privacy.** In `conversations: defineTable({...})`, below `chatGenerationStartedAt`, add:

```ts
    /** Started by a viewer of a public notebook: only that user sees it. */
    isPrivate: v.optional(v.boolean()),
```

- [ ] **Step 3: Typecheck.** Run `bun run typecheck:convex`. Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add convex/schema.ts
git commit -m "feat(notebooks): schema fields for public notebooks and private conversations"
```

---

## Task 2: Viewer access role

**Files:** Modify `convex/_lib/notebookAccess.ts`, test `convex/_lib/notebookAccess.test.ts`

- [ ] **Step 1: Write failing tests.** Append to `convex/_lib/notebookAccess.test.ts` (it already has `seedUser`, `seedNotebook`, `modules`):

```ts
describe("public notebooks", () => {
  async function makePublic(t: ReturnType<typeof convexTest>, notebookId: Id<"notebooks">) {
    await t.run((ctx) => ctx.db.patch(notebookId, { isPublic: true, publishedAt: Date.now() }));
  }

  test("a stranger is a viewer of a public notebook", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t);
    const stranger = await seedUser(t);
    const notebookId = await seedNotebook(t, owner);
    await makePublic(t, notebookId);
    expect(await t.run((ctx) => getNotebookAccess(ctx, notebookId, stranger))).toBe("viewer");
    expect(await t.run((ctx) => canReadNotebook(ctx, notebookId, stranger))).toBe(true);
  });

  test("a stranger has no access to a private notebook", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t);
    const stranger = await seedUser(t);
    const notebookId = await seedNotebook(t, owner);
    expect(await t.run((ctx) => getNotebookAccess(ctx, notebookId, stranger))).toBeNull();
  });

  test("owner and editor keep their roles on a public notebook", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t);
    const editor = await seedUser(t);
    const notebookId = await seedNotebook(t, owner);
    await seedNotebookMember(t, notebookId, editor);
    await makePublic(t, notebookId);
    expect(await t.run((ctx) => getNotebookAccess(ctx, notebookId, owner))).toBe("owner");
    expect(await t.run((ctx) => getNotebookAccess(ctx, notebookId, editor))).toBe("editor");
  });

  test("a viewer cannot edit", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t);
    const stranger = await seedUser(t);
    const notebookId = await seedNotebook(t, owner);
    await makePublic(t, notebookId);
    await expect(
      t.run((ctx) => assertCanEditNotebook(ctx, notebookId, stranger))
    ).rejects.toThrow("Access denied");
  });
});
```

If `seedNotebookMember` has a different signature in the file, match it (it is defined right after `seedNotebook`).

- [ ] **Step 2: Run to see them fail.** `bun run test:convex -- convex/_lib/notebookAccess.test.ts`. Expected: the "viewer" test FAILs (`null` instead of `"viewer"`); "a viewer cannot edit" FAILs with "Notebook not found".

- [ ] **Step 3: Implement.** In `convex/_lib/notebookAccess.ts`:

```ts
export type NotebookAccessRole = "owner" | "editor" | "viewer";
```

```ts
/**
 * Returns owner if user owns the notebook, editor if they are a member, viewer if the notebook is
 * public, else null. Viewers may read and chat privately; `assertCanEditNotebook` rejects them.
 */
export async function getNotebookAccess(
  ctx: DbCtx,
  notebookId: Id<"notebooks">,
  userId: Id<"users">
): Promise<NotebookAccessRole | null> {
  const notebook = await ctx.db.get(notebookId);
  if (!notebook) return null;
  if (notebook.userId === userId) return "owner";
  const member = await getNotebookMember(ctx, notebookId, userId);
  if (member) return "editor";
  if (notebook.isPublic) return "viewer";
  return null;
}
```

`assertCanEditNotebook` already throws "Access denied" for anything but owner/editor; leave it.

- [ ] **Step 4: Run tests.** `bun run test:convex -- convex/_lib/notebookAccess.test.ts`. Expected: PASS.

- [ ] **Step 5: Find read-only checks that guard writes.** Run:

```bash
grep -rn "canReadNotebookInternal\|access !== null\|getNotebookAccess(" convex --include=*.ts | grep -v "_generated\|\.test\.ts"
```

Every hit must be one of: a read; the chat paths fixed in Tasks 3–4; `convex/notebooks/index.ts` (Task 5); `documents/sourceGuide.ts` (allowed — it caches a derived summary on the shared row). If you find another write guarded only by read access, switch it to `assertCanEditNotebook` and note it in the PR description.

- [ ] **Step 6: Commit.**

```bash
git add convex/_lib/notebookAccess.ts convex/_lib/notebookAccess.test.ts
git commit -m "feat(notebooks): viewer access role for public notebooks"
```

---

## Task 3: Conversation visibility

**Files:** Modify `convex/_model/conversations.ts`, `convex/_lib/conversationAccess.ts`; test `convex/_lib/conversationAccess.test.ts`

Rule: a viewer sees only conversations they created; owners and editors see every conversation except private ones. A user may edit any conversation they can see (for a viewer that is only their own private ones).

- [ ] **Step 1: Write failing tests.** Append to `convex/_lib/conversationAccess.test.ts` (reuse its existing seed helpers; if it has none for conversations, insert rows with `t.run`):

```ts
describe("public notebook conversations", () => {
  async function setup() {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", { name: "Owner" });
      const viewer = await ctx.db.insert("users", { name: "Viewer" });
      const otherViewer = await ctx.db.insert("users", { name: "Other" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: owner,
        title: "Public",
        isPublic: true,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const ownerConv = await ctx.db.insert("conversations", {
        userId: owner,
        notebookId,
        createdAt: now,
        updatedAt: now,
      });
      const viewerConv = await ctx.db.insert("conversations", {
        userId: viewer,
        notebookId,
        isPrivate: true,
        createdAt: now,
        updatedAt: now,
      });
      return { owner, viewer, otherViewer, notebookId, ownerConv, viewerConv };
    });
    return { t, ...ids };
  }

  test("a viewer cannot read the owner's conversation", async () => {
    const { t, viewer, ownerConv } = await setup();
    expect(await t.run((ctx) => getConversationIfReadable(ctx, ownerConv, viewer))).toBeNull();
  });

  test("the owner cannot read a viewer's private conversation", async () => {
    const { t, owner, viewerConv } = await setup();
    expect(await t.run((ctx) => getConversationIfReadable(ctx, viewerConv, owner))).toBeNull();
  });

  test("another viewer cannot read it either", async () => {
    const { t, otherViewer, viewerConv } = await setup();
    await expect(
      t.run((ctx) => assertCanReadConversation(ctx, viewerConv, otherViewer))
    ).rejects.toThrow("Conversation not found");
  });

  test("a viewer can edit their own private conversation", async () => {
    const { t, viewer, viewerConv } = await setup();
    const conv = await t.run((ctx) => assertCanEditConversation(ctx, viewerConv, viewer));
    expect(conv._id).toBe(viewerConv);
  });

  test("a viewer cannot edit the owner's conversation", async () => {
    const { t, viewer, ownerConv } = await setup();
    await expect(
      t.run((ctx) => assertCanEditConversation(ctx, ownerConv, viewer))
    ).rejects.toThrow("Conversation not found");
  });
});
```

Make sure the file imports `getConversationIfReadable`, `assertCanReadConversation`, `assertCanEditConversation`.

- [ ] **Step 2: Run to see them fail.** `bun run test:convex -- convex/_lib/conversationAccess.test.ts`. Expected: the new tests FAIL; existing tests pass.

- [ ] **Step 3: Add model helpers.** Append to `convex/_model/conversations.ts` (add `import type { NotebookAccessRole } from "../_lib/notebookAccess";` at the top):

```ts
export type ConversationViewer = { userId: Id<"users">; access: NotebookAccessRole };

/** Viewers see only their own threads; owners and editors see all but viewers' private ones. */
export function isConversationVisible(
  conversation: Pick<Doc<"conversations">, "userId" | "isPrivate">,
  viewer: ConversationViewer
): boolean {
  if (viewer.access === "viewer") return conversation.userId === viewer.userId;
  return !conversation.isPrivate || conversation.userId === viewer.userId;
}

export async function listVisibleConversations(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  viewer: ConversationViewer
): Promise<Doc<"conversations">[]> {
  const all = await listConversationsInNotebook(ctx, notebookId);
  return all.filter((c) => isConversationVisible(c, viewer));
}

/** Most recently updated thread this user can see, or null. */
export async function getPrimaryVisibleConversation(
  ctx: QueryCtx,
  notebookId: Id<"notebooks">,
  viewer: ConversationViewer
): Promise<Doc<"conversations"> | null> {
  const visible = await listVisibleConversations(ctx, notebookId, viewer);
  return visible.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

/** Fields for a conversation a user starts: viewers' threads are private to them. */
export function conversationPrivacy(access: NotebookAccessRole): { isPrivate?: true } {
  return access === "viewer" ? { isPrivate: true } : {};
}
```

- [ ] **Step 4: Rewrite the access checks.** Replace the body of `convex/_lib/conversationAccess.ts` with:

```ts
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isConversationVisible } from "../_model/conversations";
import { getNotebookAccess } from "./notebookAccess";

type DbCtx = QueryCtx | MutationCtx;

/**
 * The conversation if this user may see it: they can read its notebook and it is not another
 * user's private thread (see `isConversationVisible`). Null otherwise.
 */
export async function getConversationIfReadable(
  ctx: DbCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">
): Promise<Doc<"conversations"> | null> {
  const conversation = await ctx.db.get(conversationId);
  if (!conversation) return null;
  const access = await getNotebookAccess(ctx, conversation.notebookId, userId);
  if (!access || !isConversationVisible(conversation, { userId, access })) return null;
  return conversation;
}

export async function assertCanReadConversation(
  ctx: DbCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">
): Promise<Doc<"conversations">> {
  const conversation = await getConversationIfReadable(ctx, conversationId, userId);
  if (!conversation) throw new Error("Conversation not found");
  return conversation;
}

/**
 * Edit (rename, delete, feedback, retry) any conversation the user can see. For owners and
 * editors that is every shared thread; for a viewer it is only their own private threads.
 */
export async function assertCanEditConversation(
  ctx: DbCtx,
  conversationId: Id<"conversations">,
  userId: Id<"users">
): Promise<Doc<"conversations">> {
  return await assertCanReadConversation(ctx, conversationId, userId);
}
```

- [ ] **Step 5: Run tests.** `bun run test:convex -- convex/_lib/conversationAccess.test.ts`. Expected: PASS. If an existing test expected `"Access denied"` from `assertCanEditConversation` for a stranger, it now gets `"Conversation not found"`; update that expectation (the stranger still can't edit).

- [ ] **Step 6: Commit.**

```bash
git add convex/_model/conversations.ts convex/_lib/conversationAccess.ts convex/_lib/conversationAccess.test.ts
git commit -m "feat(chat): private conversations for viewers of public notebooks"
```

---

## Task 4: Chat entry points use visibility

**Files:** Modify `convex/chat/index.ts`, `convex/chat/conversations.ts`, `convex/chat/messages.ts`; test `convex/chat/messages.test.ts`

- [ ] **Step 1: Write failing tests.** Append to `convex/chat/messages.test.ts` (it defines `withAuth(t, userId)` and `modules`):

```ts
describe("viewer chat on a public notebook", () => {
  async function setup() {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const ids = await t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", { name: "Owner" });
      const viewer = await ctx.db.insert("users", { name: "Viewer" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: owner,
        title: "Public",
        isPublic: true,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      const ownerConv = await ctx.db.insert("conversations", {
        userId: owner,
        notebookId,
        createdAt: now,
        updatedAt: now + 1000,
      });
      await ctx.db.insert("messages", {
        conversationId: ownerConv,
        role: "user",
        content: "owner's question",
        createdAt: now,
      });
      return { owner, viewer, notebookId, ownerConv };
    });
    return { t, ...ids };
  }

  test("a viewer's first message starts a private thread, not the owner's", async () => {
    const { t, viewer, notebookId, ownerConv } = await setup();
    const { conversationId } = await withAuth(t, viewer).mutation(
      api.chat.messages.sendMessageOptimistic,
      { notebookId, message: "viewer question" }
    );
    expect(conversationId).not.toBe(ownerConv);
    const conv = await t.run((ctx) => ctx.db.get(conversationId));
    expect(conv?.isPrivate).toBe(true);
    expect(conv?.userId).toBe(viewer);
  });

  test("a viewer does not see the owner's messages", async () => {
    const { t, viewer, notebookId } = await setup();
    const result = await withAuth(t, viewer).query(api.chat.messages.listByNotebook, {
      notebookId,
    });
    expect(result.messages).toEqual([]);
  });

  test("the owner's thread list hides viewers' threads", async () => {
    const { t, owner, viewer, notebookId, ownerConv } = await setup();
    await withAuth(t, viewer).mutation(api.chat.messages.sendMessageOptimistic, {
      notebookId,
      message: "viewer question",
    });
    const ownerList = await withAuth(t, owner).query(api.chat.conversations.listForNotebook, {
      notebookId,
    });
    expect(ownerList.map((c) => c._id)).toEqual([ownerConv]);
    const viewerList = await withAuth(t, viewer).query(api.chat.conversations.listForNotebook, {
      notebookId,
    });
    expect(viewerList).toHaveLength(1);
    expect(viewerList[0]._id).not.toBe(ownerConv);
  });

  test("a viewer cannot post into the owner's thread", async () => {
    const { t, viewer, notebookId, ownerConv } = await setup();
    await expect(
      withAuth(t, viewer).mutation(api.chat.messages.sendMessageOptimistic, {
        notebookId,
        message: "hi",
        conversationId: ownerConv,
      })
    ).rejects.toThrow("Conversation not found");
  });

  test("ensureConversation gives a viewer their own thread", async () => {
    const { t, viewer, notebookId, ownerConv } = await setup();
    const id = await t.mutation(internal.chat.index.ensureConversation, {
      notebookId,
      userId: viewer,
    });
    expect(id).not.toBe(ownerConv);
    expect((await t.run((ctx) => ctx.db.get(id)))?.isPrivate).toBe(true);
  });
});
```

Ensure `api` and `internal` are imported from `../_generated/api`. `sendMessageOptimistic` schedules `generateAndSetTitle`; if the test runner complains about scheduled functions, wrap with `vi.useFakeTimers()` as other tests in the file do, or assert before `t.finishInProgressScheduledFunctions()`.

- [ ] **Step 2: Run to see them fail.** `bun run test:convex -- convex/chat/messages.test.ts`. Expected: new tests FAIL (viewer gets routed into the owner's thread).

- [ ] **Step 3: `ensureConversation`** (`convex/chat/index.ts`). Replace the handler body:

```ts
  handler: async (ctx, args) => {
    const access = await getNotebookAccess(ctx, args.notebookId, args.userId);
    if (!access) {
      throw new Error("Access denied");
    }
    const viewer = { userId: args.userId, access };

    if (args.conversationId) {
      const existing = await ctx.db.get(args.conversationId);
      if (
        existing &&
        existing.notebookId === args.notebookId &&
        ConvModel.isConversationVisible(existing, viewer)
      ) {
        await ctx.db.patch(existing._id, { updatedAt: Date.now() });
        return existing._id;
      }
    }

    const primary = await ConvModel.getPrimaryVisibleConversation(ctx, args.notebookId, viewer);
    if (primary) {
      await ctx.db.patch(primary._id, { updatedAt: Date.now() });
      return primary._id;
    }

    return await ctx.db.insert("conversations", {
      userId: args.userId,
      notebookId: args.notebookId,
      ...ConvModel.conversationPrivacy(access),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
```

- [ ] **Step 4: `listForNotebook`** (`convex/chat/conversations.ts`):

```ts
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const access = await getNotebookAccess(ctx, args.notebookId, userId);
    if (!access) return [];

    const conversations = await Conversations.listVisibleConversations(ctx, args.notebookId, {
      userId,
      access,
    });
    return conversations.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  },
```

Import `getNotebookAccess` from `../_lib/notebookAccess`; drop the now-unused `canReadNotebook` / `assertCanReadNotebook` imports if nothing else uses them (Biome will flag them).

- [ ] **Step 5: `convex/chat/messages.ts`.** Make these edits:

`listByNotebook` — replace the `canReadNotebook` check and the primary lookup:

```ts
    const access = await getNotebookAccess(ctx, args.notebookId, userId);
    if (!access) {
      return { messages: [], chatGenerating: false, chatGenerationStartedAt: null };
    }

    let conversation;
    if (args.conversationId) {
      const c = await getConversationIfReadable(ctx, args.conversationId, userId);
      if (!c || c.notebookId !== args.notebookId) {
        return { messages: [], chatGenerating: false, chatGenerationStartedAt: null };
      }
      conversation = c;
    } else {
      conversation = await ConvModel.getPrimaryVisibleConversation(ctx, args.notebookId, {
        userId,
        access,
      });
    }
```

`createConversation` — use the returned access and mark viewers' threads private:

```ts
    const { notebook, access } = await assertCanReadNotebook(ctx, args.notebookId, userId);

    // Snapshot the notebook's instruction mode onto the conversation (locked at creation)
    const chatSettings = notebook.chatSettings as
      | {
          instructionMode?: "default" | "learningGuide" | "custom";
          customInstructions?: string;
        }
      | undefined;

    const now = Date.now();

    const conversationId = await ctx.db.insert("conversations", {
      userId,
      notebookId: args.notebookId,
      title: args.title,
      ...ConvModel.conversationPrivacy(access),
      instructionMode: chatSettings?.instructionMode,
      customInstructions: chatSettings?.customInstructions,
      createdAt: now,
      updatedAt: now,
    });
```

`sendMessage` and `sendMessageOptimistic` — replace `await assertCanReadNotebook(ctx, args.notebookId, userId);` with `const { access } = await assertCanReadNotebook(ctx, args.notebookId, userId);`, replace each `ConvModel.getPrimaryConversationForNotebook(ctx, args.notebookId)` with `ConvModel.getPrimaryVisibleConversation(ctx, args.notebookId, { userId, access })`, and add `...ConvModel.conversationPrivacy(access),` to the `ctx.db.insert("conversations", {...})` in each.

`releaseChatGeneration` — replace the first `await assertCanReadNotebook(...)` with `const { access } = await assertCanReadNotebook(ctx, args.notebookId, userId);`, delete the duplicate `assertCanReadNotebook` call in the `else` branch, and use `ConvModel.getPrimaryVisibleConversation(ctx, args.notebookId, { userId, access })` there.

`clearHistory` — replace the access block with:

```ts
    const { access } = await assertCanReadNotebook(ctx, args.notebookId, userId);

    let conversation;
    if (args.conversationId) {
      try {
        conversation = await assertCanEditConversation(ctx, args.conversationId, userId);
      } catch {
        return { message: "Conversation not found" };
      }
    } else {
      conversation = await ConvModel.getPrimaryVisibleConversation(ctx, args.notebookId, {
        userId,
        access,
      });
    }
```

Update the import list: add `getNotebookAccess`; remove `assertCanEditNotebook` and `canReadNotebook` if unused.

- [ ] **Step 6: Check for leftover primary lookups.**

```bash
grep -rn "getPrimaryConversationForNotebook\|listConversationsInNotebook" convex --include=*.ts | grep -v "\.test\.ts\|_generated"
```

Any remaining caller that serves a user request must use the visible variants. `getUserConversations` (owned + member notebooks only) can stay as is.

- [ ] **Step 7: Run chat tests.** `bun run test:convex -- convex/chat convex/_lib`. Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add convex/chat convex/_model/conversations.ts
git commit -m "feat(chat): route viewers of public notebooks to private threads"
```

---

## Task 5: Notebook DTO and `isFeatured` lockdown

**Files:** Modify `convex/notebooks/index.ts`, `convex/_model/notebooks.ts`, `convex/folders/index.ts`

- [ ] **Step 1: Write failing tests.** Create `convex/notebooks/index.test.ts` (or append if it exists):

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

describe("notebooks.get access", () => {
  test("a viewer gets the notebook with access=viewer and the owner's name", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const { viewer, notebookId } = await t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", { name: "Ada" });
      const viewer = await ctx.db.insert("users", { name: "Viewer" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: owner,
        title: "Public",
        isPublic: true,
        publishedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      return { viewer, notebookId };
    });
    const nb = await withAuth(t, viewer).query(api.notebooks.index.get, { id: notebookId });
    expect(nb?.access).toBe("viewer");
    expect(nb?.isPublic).toBe(true);
    expect(nb?.ownerName).toBe("Ada");
  });

  test("the owner gets access=owner", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const { owner, notebookId } = await t.run(async (ctx) => {
      const owner = await ctx.db.insert("users", { name: "Ada" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: owner,
        title: "Mine",
        createdAt: now,
        updatedAt: now,
      });
      return { owner, notebookId };
    });
    const nb = await withAuth(t, owner).query(api.notebooks.index.get, { id: notebookId });
    expect(nb?.access).toBe("owner");
    expect(nb?.isPublic).toBe(false);
  });
});
```

- [ ] **Step 2: Run to see them fail.** `bun run test:convex -- convex/notebooks/index.test.ts`. Expected: FAIL (`access` undefined).

- [ ] **Step 3: Update the DTO.** In `convex/notebooks/index.ts`:

1. Add `"isPublic"` to the `Pick<Doc<"notebooks">, ...>` list in `toNotebookDTO`.
2. Change the options type to `options: { access: NotebookAccessRole; ownerName?: string }` (import `type NotebookAccessRole` from `../_lib/notebookAccess`).
3. Return:

```ts
    isFeatured: notebook.isFeatured ?? false,
    isPublic: notebook.isPublic ?? false,
    folderId: notebook.folderId,
    created_at: notebook.createdAt,
    updated_at: notebook.updatedAt,
    access: options.access,
    /** Someone else's notebook you can edit via a cowork link. */
    isSharedNotebook: options.access === "editor",
    ownerName: options.ownerName,
    chatSettings: notebook.chatSettings ?? undefined,
```

4. In `list`, pass `{ access: "owner" }` for owned and `{ access: "editor" }` for memberships.
5. In `get`:

```ts
    const access = await getNotebookAccess(ctx, args.id, userId);
    if (!access) return null;

    const sourceCount = await Notebooks.getDocumentCountByNotebook(ctx, notebook._id);
    const owner = access === "owner" ? null : await ctx.db.get(notebook.userId);
    return toNotebookDTO(notebook, sourceCount, {
      access,
      ownerName: owner ? (owner.name ?? "SolomindLM user") : undefined,
    });
```

6. In `update`, `return toNotebookDTO(updated, sourceCount, { access: "owner" });`.

- [ ] **Step 4: Stop accepting `isFeatured` from users.** Remove `isFeatured: v.optional(v.boolean()),` from the `create` and `update` arg validators and `isFeatured: args.isFeatured,` from the `create` handler; in the `create` return value use `isFeatured: false, isPublic: false, access: "owner" as const,`. In `convex/_model/notebooks.ts`, remove `isFeatured` from `NotebookCreate` and `NotebookUpdate`, and drop `isFeatured: data.isFeatured ?? false,` from `createNotebook`'s insert (the field stays optional in the schema).

- [ ] **Step 5: Folder view DTO.** In `convex/folders/index.ts` (the notebook DTO near line 103), add `isPublic: notebook.isPublic ?? false,` and `access: "owner" as const,` next to `isFeatured`.

- [ ] **Step 6: Run tests and typecheck.** `bun run test:convex -- convex/notebooks convex/folders` then `bun run typecheck:convex`. Expected: PASS. Fix any caller that still passes `isFeatured` (search: `grep -rn "isFeatured" convex --include=*.ts | grep -v _generated`).

- [ ] **Step 7: Commit.**

```bash
git add convex/notebooks/index.ts convex/notebooks/index.test.ts convex/_model/notebooks.ts convex/folders/index.ts
git commit -m "feat(notebooks): return access role and public state; isFeatured becomes admin-only"
```

---

## Task 6: `convex/notebooks/public.ts`

**Files:** Create `convex/notebooks/public.ts`, `convex/notebooks/public.test.ts`

- [ ] **Step 1: Write failing tests.** Create `convex/notebooks/public.test.ts`:

```ts
/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<unknown>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [key.replace(/^\/convex\//, "./"), loader])
);

const ADMIN_EMAIL = "admin@example.com";

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId as string}|session1` });
}

async function setup() {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { name: "Ada", email: "ada@example.com" });
    const other = await ctx.db.insert("users", { name: "Bo", email: "bo@example.com" });
    const admin = await ctx.db.insert("users", { name: "Admin", email: ADMIN_EMAIL });
    const notebookId = await ctx.db.insert("notebooks", {
      userId: owner,
      title: "Econ",
      createdAt: now,
      updatedAt: now,
    });
    return { owner, other, admin, notebookId };
  });
  return { t, ...ids };
}

describe("notebooks.public", () => {
  let savedAdmins: string | undefined;
  beforeEach(() => {
    savedAdmins = process.env.FEEDBACK_ADMIN_EMAILS;
    process.env.FEEDBACK_ADMIN_EMAILS = ADMIN_EMAIL;
  });
  afterEach(() => {
    process.env.FEEDBACK_ADMIN_EMAILS = savedAdmins;
  });

  test("only the owner can publish", async () => {
    const { t, other, notebookId } = await setup();
    await expect(
      withAuth(t, other).mutation(api.notebooks.public.setPublic, { notebookId, isPublic: true })
    ).rejects.toThrow("Notebook not found");
  });

  test("published notebooks appear in listPublic; private ones don't", async () => {
    const { t, owner, other, notebookId } = await setup();
    const before = await withAuth(t, other).query(api.notebooks.public.listPublic, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(before.page).toEqual([]);

    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    const after = await withAuth(t, other).query(api.notebooks.public.listPublic, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(after.page.map((n) => n.id)).toEqual([notebookId]);
    expect(after.page[0].ownerName).toBe("Ada");
    expect(after.page[0].isOwnedByViewer).toBe(false);
  });

  test("unpublishing clears featured", async () => {
    const { t, owner, admin, notebookId } = await setup();
    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    await withAuth(t, admin).mutation(api.notebooks.public.setFeatured, {
      notebookId,
      isFeatured: true,
    });
    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: false,
    });
    const nb = await t.run((ctx) => ctx.db.get(notebookId));
    expect(nb?.isPublic).toBe(false);
    expect(nb?.isFeatured).toBe(false);
  });

  test("featured notebooks move from Community to listFeatured", async () => {
    const { t, owner, admin, other, notebookId } = await setup();
    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    await withAuth(t, admin).mutation(api.notebooks.public.setFeatured, {
      notebookId,
      isFeatured: true,
    });
    const featured = await withAuth(t, other).query(api.notebooks.public.listFeatured, {});
    expect(featured.map((n) => n.id)).toEqual([notebookId]);
    const community = await withAuth(t, other).query(api.notebooks.public.listPublic, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(community.page).toEqual([]);
  });

  test("non-admins cannot feature; private notebooks cannot be featured", async () => {
    const { t, owner, admin, notebookId } = await setup();
    await expect(
      withAuth(t, owner).mutation(api.notebooks.public.setFeatured, {
        notebookId,
        isFeatured: true,
      })
    ).rejects.toThrow("Not authorized");
    await expect(
      withAuth(t, admin).mutation(api.notebooks.public.setFeatured, {
        notebookId,
        isFeatured: true,
      })
    ).rejects.toThrow("Only public notebooks can be featured");
  });

  test("admins can unpublish someone else's notebook", async () => {
    const { t, owner, admin, notebookId } = await setup();
    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    await withAuth(t, admin).mutation(api.notebooks.public.adminUnpublish, { notebookId });
    expect((await t.run((ctx) => ctx.db.get(notebookId)))?.isPublic).toBe(false);
  });

  test("forkPublic copies a public notebook and refuses a private one", async () => {
    const { t, owner, other, notebookId } = await setup();
    await expect(
      withAuth(t, other).mutation(api.notebooks.public.forkPublic, { notebookId })
    ).rejects.toThrow("Notebook not found");

    await withAuth(t, owner).mutation(api.notebooks.public.setPublic, {
      notebookId,
      isPublic: true,
    });
    const { newNotebookId } = await withAuth(t, other).mutation(
      api.notebooks.public.forkPublic,
      { notebookId }
    );
    const fork = await t.run((ctx) => ctx.db.get(newNotebookId));
    expect(fork?.userId).toBe(other);
    expect(fork?.isPublic).toBeUndefined();
  });
});
```

If `env.FEEDBACK_ADMIN_EMAILS` is read once at module load (check `convex/_lib/env.ts`), set the env var in a `vi.stubEnv` call at the top of the file instead, before modules load, and follow how `convex/feedback/*.test.ts` sets admin emails.

- [ ] **Step 2: Run to see them fail.** `bun run test:convex -- convex/notebooks/public.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement.** Create `convex/notebooks/public.ts`:

```ts
import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { mutation, type QueryCtx, query } from "../_generated/server";
import { assertFeedbackAdmin } from "../_lib/feedbackAdmin";
import { checkNotebookLimit } from "../_lib/limits";
import { assertNotebookOwner } from "../_lib/notebookAccess";
import { rateLimiter } from "../_lib/rateLimits";
import * as Notebooks from "../_model/notebooks";
import { getAuthUserId } from "../auth";
import { performNotebookFork } from "./_forkNotebook";

/** The Featured shelf is curated by hand, so a small cap is plenty. */
const FEATURED_LIMIT = 24;

async function toPublicNotebookDTO(
  ctx: QueryCtx,
  notebook: Doc<"notebooks">,
  viewerId: Id<"users">
) {
  const owner = await ctx.db.get(notebook.userId);
  const sourceCount = await Notebooks.getDocumentCountByNotebook(ctx, notebook._id);
  return {
    id: notebook._id,
    title: notebook.title,
    date: new Date(notebook.updatedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    sourceCount,
    coverColor: notebook.coverColor ?? "bg-vintage-brown-300",
    icon: notebook.icon ?? "Book",
    created_at: notebook.createdAt,
    updated_at: notebook.updatedAt,
    isPublic: true,
    isFeatured: notebook.isFeatured ?? false,
    publishedAt: notebook.publishedAt ?? notebook.updatedAt,
    ownerName: owner?.name ?? "SolomindLM user",
    isOwnedByViewer: notebook.userId === viewerId,
  };
}

/** Owner publishes or unpublishes. Unpublishing also drops the notebook from the Featured shelf. */
export const setPublic = mutation({
  args: { notebookId: v.id("notebooks"), isPublic: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    await assertNotebookOwner(ctx, args.notebookId, userId);
    await ctx.db.patch(
      args.notebookId,
      args.isPublic
        ? { isPublic: true, publishedAt: Date.now() }
        : { isPublic: false, isFeatured: false, publishedAt: undefined }
    );
    return { isPublic: args.isPublic };
  },
});

/** Community grid: public, not featured, newest published first. */
export const listPublic = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { page: [], isDone: true, continueCursor: "" };

    const result = await ctx.db
      .query("notebooks")
      .withIndex("by_isPublic_and_publishedAt", (q) => q.eq("isPublic", true))
      .order("desc")
      .filter((q) => q.neq(q.field("isFeatured"), true))
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: await Promise.all(result.page.map((nb) => toPublicNotebookDTO(ctx, nb, userId))),
    };
  },
});

/** Featured shelf: admin-curated public notebooks, newest published first. */
export const listFeatured = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const rows = await ctx.db
      .query("notebooks")
      .withIndex("by_isFeatured_and_publishedAt", (q) => q.eq("isFeatured", true))
      .order("desc")
      .take(FEATURED_LIMIT);

    return await Promise.all(
      rows.filter((nb) => nb.isPublic).map((nb) => toPublicNotebookDTO(ctx, nb, userId))
    );
  },
});

export const setFeatured = mutation({
  args: { notebookId: v.id("notebooks"), isFeatured: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    await assertFeedbackAdmin(ctx, userId);

    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook) throw new Error("Notebook not found");
    if (args.isFeatured && !notebook.isPublic) {
      throw new Error("Only public notebooks can be featured");
    }
    await ctx.db.patch(args.notebookId, { isFeatured: args.isFeatured });
    return { isFeatured: args.isFeatured };
  },
});

/** Admin moderation: take any notebook off the Public tab. */
export const adminUnpublish = mutation({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");
    await assertFeedbackAdmin(ctx, userId);

    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook) throw new Error("Notebook not found");
    await ctx.db.patch(args.notebookId, {
      isPublic: false,
      isFeatured: false,
      publishedAt: undefined,
    });
    return { ok: true as const };
  },
});

/** Copy a public notebook into the caller's account. */
export const forkPublic = mutation({
  args: { notebookId: v.id("notebooks") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthenticated");

    await rateLimiter.limit(ctx, "notebookFork", { key: userId, throws: true });

    const notebook = await ctx.db.get(args.notebookId);
    if (!notebook?.isPublic) throw new Error("Notebook not found");

    await checkNotebookLimit(ctx);
    const newNotebookId = await performNotebookFork(ctx, args.notebookId, userId);
    return { newNotebookId };
  },
});
```

`performNotebookFork` inserts `isFeatured: false` and no `isPublic`, so forks start private — the test above checks this.

- [ ] **Step 4: Codegen.** `npx convex codegen`. Expected: `convex/_generated/api.d.ts` now lists `notebooks/public`.

- [ ] **Step 5: Run tests.** `bun run test:convex -- convex/notebooks/public.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add convex/notebooks/public.ts convex/notebooks/public.test.ts convex/_generated
git commit -m "feat(notebooks): publish, browse, curate and fork public notebooks"
```

---

## Task 7: Fork copies literature tables and reports

**Files:** Modify `convex/notebooks/_forkNotebook.ts`, test `convex/notebooks/_forkNotebook.test.ts`

Only studio-visible outputs are copied (no `literatureReviewSessionId`; those belong to chat threads, which forks don't copy). Citation rows are global, so the copies reuse the same citation ids.

- [ ] **Step 1: Write a failing test.** Append to `convex/notebooks/_forkNotebook.test.ts`:

```ts
describe("performNotebookFork literature outputs", () => {
  test("copies completed studio tables and reports and relinks the report to the copied table", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();
    const { notebookId, citationId } = await t.run(async (ctx) => {
      const ownerId = await ctx.db.insert("users", { name: "Owner" });
      const notebookId = await ctx.db.insert("notebooks", {
        userId: ownerId,
        title: "Review",
        createdAt: now,
        updatedAt: now,
      });
      const citationId = await ctx.db.insert("citations", {
        paperId: "W1",
        title: "Paper",
        authors: ["A"],
        url: "https://example.org/p",
        sourceApi: "openalex",
        citationKey: "a2020",
      });
      const tableId = await ctx.db.insert("literatureTables", {
        title: "Table",
        notebookId,
        userId: ownerId,
        status: "completed",
        columns: [],
        papers: [{ citationId, rowData: {}, isIncluded: true }],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("literatureTables", {
        title: "Still generating",
        notebookId,
        userId: ownerId,
        status: "generating",
        columns: [],
        papers: [],
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("literatureReports", {
        title: "Report",
        notebookId,
        userId: ownerId,
        status: "completed",
        content: "# Review",
        citationStyle: "apa7",
        sections: [],
        citationIds: [citationId],
        tableId,
        createdAt: now,
        updatedAt: now,
      });
      return { notebookId, citationId };
    });

    const forkerId = await t.run((ctx) => ctx.db.insert("users", { name: "Forker" }));
    const forkId = await t.run((ctx) => performNotebookFork(ctx, notebookId, forkerId));

    const { tables, reports } = await t.run(async (ctx) => ({
      tables: await ctx.db
        .query("literatureTables")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect(),
      reports: await ctx.db
        .query("literatureReports")
        .withIndex("by_notebook", (q) => q.eq("notebookId", forkId))
        .collect(),
    }));
    expect(tables.map((r) => r.title)).toEqual(["Table"]);
    expect(tables[0].userId).toBe(forkerId);
    expect(tables[0].papers[0].citationId).toBe(citationId);
    expect(reports).toHaveLength(1);
    expect(reports[0].tableId).toBe(tables[0]._id);
    expect(reports[0].userId).toBe(forkerId);
  });
});
```

- [ ] **Step 2: Run to see it fail.** `bun run test:convex -- convex/notebooks/_forkNotebook.test.ts`. Expected: FAIL (`tables` is empty).

- [ ] **Step 3: Implement.** In `performNotebookFork`, before the `manualNotes` block, add:

```ts
  // Literature tables and reports shown in Studio. Ones tied to a chat review session stay behind
  // with the chat thread, which a fork doesn't copy. Citation rows are global and reused as-is.
  const tableIdMap = new Map<Id<"literatureTables">, Id<"literatureTables">>();
  const literatureTables = await ctx.db
    .query("literatureTables")
    .withIndex("by_notebook", (q) => q.eq("notebookId", sourceNotebookId))
    .collect();
  for (const r of literatureTables) {
    if (r.status !== "completed" || r.literatureReviewSessionId !== undefined) continue;
    const newTableId = await ctx.db.insert("literatureTables", {
      title: r.title,
      description: r.description,
      notebookId: newNotebookId,
      userId: forkUserId,
      status: r.status,
      columns: r.columns,
      papers: r.papers,
      createdAt: now,
      updatedAt: now,
    });
    tableIdMap.set(r._id, newTableId);
  }

  const literatureReports = await ctx.db
    .query("literatureReports")
    .withIndex("by_notebook", (q) => q.eq("notebookId", sourceNotebookId))
    .collect();
  for (const r of literatureReports) {
    if (r.status !== "completed" || r.literatureReviewSessionId !== undefined) continue;
    await ctx.db.insert("literatureReports", {
      title: r.title,
      notebookId: newNotebookId,
      userId: forkUserId,
      status: r.status,
      content: r.content,
      citationStyle: r.citationStyle,
      sections: r.sections,
      citationIds: r.citationIds,
      tableId: r.tableId ? tableIdMap.get(r.tableId) : undefined,
      createdAt: now,
      updatedAt: now,
    });
  }
```

- [ ] **Step 4: Run tests.** `bun run test:convex -- convex/notebooks`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add convex/notebooks/_forkNotebook.ts convex/notebooks/_forkNotebook.test.ts
git commit -m "feat(notebooks): forks keep literature tables and reports"
```

---

## Task 8: Backend gate

- [ ] **Step 1:** `bun run typecheck:convex`. Expected: PASS.
- [ ] **Step 2:** `bun run test:convex`. Expected: all PASS. Pre-existing tests that asserted the old "editor sees every thread" or `isFeatured` behaviour must be updated to the new rules, not deleted.
- [ ] **Step 3:** Check prod for legacy `isFeatured` rows (read-only):

```bash
npx convex data notebooks --prod --limit 10000 --format jsonl | grep -c '"isFeatured":true'
```

Expected: `0`. If not zero, list them in the PR and clear them after deploy with a one-off internal mutation (do not add it to this PR unless needed).

---

## Task 9: Web types and API hooks

**Files:** Modify `apps/web/src/shared/types/index.ts`, `apps/web/src/features/notebooks/services/notebooksApi.ts`, `apps/web/src/features/notebooks/hooks/useNotebookCRUD.ts`

- [ ] **Step 1: Types.** In `NotebookItem` replace the `isFeatured` / `isSharedNotebook` lines with:

```ts
  /** Admin-curated Featured shelf (public notebooks only). */
  isFeatured?: boolean;
  /** Visible to every signed-in user. */
  isPublic?: boolean;
  /** Your role here: owner, editor via a cowork link, or viewer of someone's public notebook. */
  access?: "owner" | "editor" | "viewer";
  /** True when this notebook is owned by someone else and you are an editor via share link */
  isSharedNotebook?: boolean;
  /** Owner's display name, for notebooks you don't own. */
  ownerName?: string;
  /** Public listings: true when you are the owner. */
  isOwnedByViewer?: boolean;
  publishedAt?: number;
```

- [ ] **Step 2: Drop `isFeatured` from updates.** In `notebooksApi.ts` remove `isFeatured` from the `useUpdateNotebook` args type, destructuring (line ~53) and both optimistic patches (lines ~69 and ~95), and from the type near line 118. In `useNotebookCRUD.ts` delete `if (updates.isFeatured !== undefined) updatePayload.isFeatured = updates.isFeatured;`.

- [ ] **Step 3: Public hooks.** Append to `notebooksApi.ts` (add `usePaginatedQuery` to the `convex/react` import):

```ts
const PUBLIC_PAGE_SIZE = 24;

export function usePublicNotebooks() {
  return usePaginatedQuery(
    api.notebooks.public.listPublic,
    {},
    { initialNumItems: PUBLIC_PAGE_SIZE }
  );
}

export function useFeaturedNotebooks() {
  return useQuery(api.notebooks.public.listFeatured, {});
}

export function useSetNotebookPublic() {
  return useMutation(api.notebooks.public.setPublic);
}

export function useForkPublicNotebook() {
  return useMutation(api.notebooks.public.forkPublic);
}

export function useSetNotebookFeatured() {
  return useMutation(api.notebooks.public.setFeatured);
}

export function useAdminUnpublishNotebook() {
  return useMutation(api.notebooks.public.adminUnpublish);
}

export function useIsAdmin() {
  return useQuery(api.feedback.index.isAdmin, {}) ?? false;
}
```

- [ ] **Step 4: Typecheck.** `bun run typecheck:web`. Expected: errors only in files Task 10–11 rewrite (`AppShell.tsx`, `HomePage.tsx`, `FeaturedSection*`). Note them and continue.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/shared/types/index.ts apps/web/src/features/notebooks/services/notebooksApi.ts apps/web/src/features/notebooks/hooks/useNotebookCRUD.ts
git commit -m "feat(web): public notebook types and hooks"
```

---

## Task 10: Notebook card badges, author and admin actions

**Files:** Modify `apps/web/src/features/notebooks/components/cards/NotebookCard.tsx`, test `NotebookCard.test.tsx`

Replace the `featured` prop with a `variant` that says where the card is shown.

- [ ] **Step 1: Write failing tests.** In `NotebookCard.test.tsx`, replace the `"featured and shared notebooks have no actions menu"` test with:

```tsx
  test("public cards show the author and no owner actions", () => {
    render(
      <NotebookCard
        notebook={{ ...nb, isPublic: true, ownerName: "Ada" }}
        viewMode="grid"
        onSelectNotebook={vi.fn()}
        variant="public"
      />
    );
    expect(screen.getByText(/by Ada/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Notebook actions" })).not.toBeInTheDocument();
  });

  test("featured public cards say Featured", () => {
    render(
      <NotebookCard
        notebook={{ ...nb, isPublic: true, isFeatured: true, ownerName: "Ada" }}
        viewMode="grid"
        onSelectNotebook={vi.fn()}
        variant="public"
      />
    );
    expect(screen.getByText("Featured")).toBeInTheDocument();
  });

  test("your own published notebook shows a Public badge in My notebooks", () => {
    render(
      <NotebookCard
        notebook={{ ...nb, isPublic: true }}
        viewMode="grid"
        onSelectNotebook={vi.fn()}
        onDeleteNotebook={vi.fn()}
      />
    );
    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  test("admins get moderation actions on public cards", () => {
    render(
      <NotebookCard
        notebook={{ ...nb, isPublic: true, ownerName: "Ada" }}
        viewMode="grid"
        onSelectNotebook={vi.fn()}
        variant="public"
        adminActions={{ onToggleFeatured: vi.fn(), onUnpublish: vi.fn() }}
      />
    );
    expect(screen.getByRole("button", { name: "Moderation actions" })).toBeInTheDocument();
  });
```

Keep the existing shared-notebook test, changing any `featured` prop to nothing.

- [ ] **Step 2: Run to see them fail.** `bun run test:web -- src/features/notebooks/components/cards/NotebookCard.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Implement.** In `NotebookCard.tsx`:

Props — replace `featured?: boolean;` with:

```ts
  /** "public": shown on the Public tab — author line, no owner actions. */
  variant?: "default" | "public";
  /** Admin moderation on Public-tab cards. */
  adminActions?: { onToggleFeatured: () => void; onUnpublish: () => void };
```

Badges and corner slot (add `Globe, Star, EyeOff` to the lucide import):

```tsx
function StatusBadge({ props }: { props: NotebookCardProps }) {
  const { notebook } = props;
  if (props.variant === "public" && notebook.isFeatured)
    return (
      <Badge variant="secondary" className="shrink-0">
        <Star aria-hidden />
        Featured
      </Badge>
    );
  if (notebook.isSharedNotebook)
    return (
      <Badge variant="secondary" className="shrink-0">
        <Users aria-hidden />
        Shared
      </Badge>
    );
  if (props.variant !== "public" && notebook.isPublic)
    return (
      <Badge variant="secondary" className="shrink-0">
        <Globe aria-hidden />
        Public
      </Badge>
    );
  return null;
}

function moderationActions(props: NotebookCardProps): CardAction[] {
  if (!props.adminActions) return [];
  return [
    {
      label: props.notebook.isFeatured ? "Unfeature" : "Feature",
      icon: Star,
      onSelect: props.adminActions.onToggleFeatured,
    },
    {
      label: "Unpublish",
      icon: EyeOff,
      destructive: true,
      onSelect: props.adminActions.onUnpublish,
    },
  ];
}

/** Grid corner: moderation menu, else the owner's actions menu, else a status badge. */
function CornerSlot({ props, actions }: { props: NotebookCardProps; actions: CardAction[] }) {
  const moderation = moderationActions(props);
  if (moderation.length > 0)
    return <CardActionsMenu label="Moderation actions" actions={moderation} />;
  if (props.variant === "public" || props.notebook.isSharedNotebook || actions.length === 0)
    return <StatusBadge props={props} />;
  return <CardActionsMenu label="Notebook actions" actions={actions} />;
}
```

In `NotebookCard`, make owner actions empty on public cards and add the author line:

```tsx
  const { actions: ownerActions, ConfirmDialogComponent } = useNotebookActions(props);
  const actions = props.variant === "public" ? [] : ownerActions;
  const meta =
    props.variant === "public" && notebook.ownerName
      ? `by ${notebook.ownerName} · ${notebookMeta(notebook)}`
      : notebookMeta(notebook);
```

In the list layout, replace the right-hand menu condition with:

```tsx
          <div className="mr-2 flex w-8 shrink-0 justify-center">
            {moderationActions(props).length > 0 ? (
              <CardActionsMenu label="Moderation actions" actions={moderationActions(props)} />
            ) : (
              actions.length > 0 &&
              !notebook.isSharedNotebook && (
                <CardActionsMenu label="Notebook actions" actions={actions} />
              )
            )}
          </div>
```

In the grid layout, where the card already renders `<CornerSlot ... />` and `meta`, nothing else changes. The owner's own Public badge appears through `StatusBadge` in list view; in grid view the corner shows the actions menu, so also render `<StatusBadge props={props} />` beside the meta line when `props.variant !== "public" && notebook.isPublic` (place it in the same `span` as the meta text, matching list view).

- [ ] **Step 4: Run tests.** Expected: PASS. Also run `bun run test:web -- src/features/notebooks` to catch other `featured` usages; fix callers (only `FeaturedSection`, removed in Task 11).

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/features/notebooks/components/cards
git commit -m "feat(web): public notebook cards with author, badges and moderation"
```

---

## Task 11: Public tab

**Files:** Create `apps/web/src/features/notebooks/components/views/PublicSection.tsx`, `PublicSection.test.tsx`; delete `FeaturedSection.tsx`, `FeaturedSection.test.tsx`; modify `views/index.ts`, `home/HomeHeader.tsx`, `HomePage.tsx`, `useNotebookContext.ts`, `apps/web/src/shell/AppShell.tsx`

`PublicSection` is presentational (data in, cards out) so it tests without Convex. `HomePage` owns the hooks.

- [ ] **Step 1: Write failing tests.** Create `PublicSection.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { NotebookItem } from "@/shared/types/index";
import { PublicSection } from "./PublicSection";

const nb = (id: string, extra: Partial<NotebookItem> = {}): NotebookItem => ({
  id,
  title: `Notebook ${id}`,
  date: "Oct 14, 2026",
  sourceCount: 3,
  isPublic: true,
  ownerName: "Ada",
  ...extra,
});

const base = {
  viewMode: "grid" as const,
  onSelectNotebook: vi.fn(),
  isAdmin: false,
  onToggleFeatured: vi.fn(),
  onUnpublish: vi.fn(),
};

describe("PublicSection", () => {
  test("shows the Featured shelf and the Community grid", () => {
    render(
      <PublicSection
        {...base}
        featured={[nb("f1", { isFeatured: true })]}
        community={[nb("c1")]}
        communityStatus="Exhausted"
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.getByRole("heading", { name: "Featured" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Community" })).toBeInTheDocument();
    expect(screen.getByText("Notebook f1")).toBeInTheDocument();
    expect(screen.getByText("Notebook c1")).toBeInTheDocument();
  });

  test("featuredOnly hides the Community grid", () => {
    render(
      <PublicSection
        {...base}
        featured={[nb("f1", { isFeatured: true })]}
        community={[nb("c1")]}
        communityStatus="Exhausted"
        onLoadMore={vi.fn()}
        featuredOnly
      />
    );
    expect(screen.queryByText("Notebook c1")).not.toBeInTheDocument();
  });

  test("empty state", () => {
    render(
      <PublicSection
        {...base}
        featured={[]}
        community={[]}
        communityStatus="Exhausted"
        onLoadMore={vi.fn()}
      />
    );
    expect(screen.getByText("No public notebooks yet.")).toBeInTheDocument();
  });

  test("load more button when more pages exist", () => {
    const onLoadMore = vi.fn();
    render(
      <PublicSection
        {...base}
        featured={[]}
        community={[nb("c1")]}
        communityStatus="CanLoadMore"
        onLoadMore={onLoadMore}
      />
    );
    screen.getByRole("button", { name: "Load more" }).click();
    expect(onLoadMore).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to see them fail.** `bun run test:web -- src/features/notebooks/components/views/PublicSection.test.tsx`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `PublicSection.tsx`:**

```tsx
import { Button } from "@/shared/components/ui/button";
import type { NotebookItem } from "@/shared/types/index";
import { NotebookCard } from "../cards/NotebookCard";
import { CardGrid, CardGridItem, type ViewMode } from "../home/CardGrid";
import { ListHeader } from "../ListHeader";

type CommunityStatus = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

interface PublicSectionProps {
  featured: NotebookItem[];
  community: NotebookItem[];
  communityStatus: CommunityStatus;
  onLoadMore: () => void;
  viewMode: ViewMode;
  onSelectNotebook: (notebook: NotebookItem) => void;
  isAdmin: boolean;
  onToggleFeatured: (notebook: NotebookItem) => void;
  onUnpublish: (notebook: NotebookItem) => void;
  /** On the All tab: just the curated shelf. */
  featuredOnly?: boolean;
}

function Shelf({
  heading,
  notebooks,
  props,
}: {
  heading: string;
  notebooks: NotebookItem[];
  props: PublicSectionProps;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold text-foreground">{heading}</h2>
      {props.viewMode === "list" && <ListHeader />}
      <CardGrid viewMode={props.viewMode}>
        {notebooks.map((nb, i) => (
          <CardGridItem key={nb.id} index={i}>
            <NotebookCard
              notebook={nb}
              viewMode={props.viewMode}
              onSelectNotebook={props.onSelectNotebook}
              variant="public"
              adminActions={
                props.isAdmin
                  ? {
                      onToggleFeatured: () => props.onToggleFeatured(nb),
                      onUnpublish: () => props.onUnpublish(nb),
                    }
                  : undefined
              }
            />
          </CardGridItem>
        ))}
      </CardGrid>
    </section>
  );
}

export function PublicSection(props: PublicSectionProps) {
  const { featured, community, communityStatus, featuredOnly } = props;

  if (featuredOnly) {
    return featured.length > 0 ? <Shelf heading="Featured" notebooks={featured} props={props} /> : null;
  }

  if (featured.length === 0 && community.length === 0) {
    return communityStatus === "LoadingFirstPage" ? null : (
      <p className="py-12 text-center font-sans text-sm text-muted-foreground">
        No public notebooks yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {featured.length > 0 && <Shelf heading="Featured" notebooks={featured} props={props} />}
      {community.length > 0 && <Shelf heading="Community" notebooks={community} props={props} />}
      {(communityStatus === "CanLoadMore" || communityStatus === "LoadingMore") && (
        <Button
          variant="outline"
          className="self-center"
          disabled={communityStatus === "LoadingMore"}
          onClick={props.onLoadMore}
        >
          Load more
        </Button>
      )}
    </div>
  );
}
```

Update `views/index.ts`: `export { PublicSection } from "./PublicSection";` (replace the FeaturedSection export). Delete `FeaturedSection.tsx` and `FeaturedSection.test.tsx`.

- [ ] **Step 4: Tabs.** In `HomeHeader.tsx`: `export type HomeTab = "all" | "mine" | "public";` and `<TabsTrigger value="public">Public</TabsTrigger>`.

- [ ] **Step 5: HomePage wiring.** In `HomePage.tsx`:

```tsx
import {
  useAdminUnpublishNotebook,
  useCreateNotebook,
  useFeaturedNotebooks,
  useIsAdmin,
  usePublicNotebooks,
  useSetNotebookFeatured,
} from "../services/notebooksApi";
import { PublicSection, RecentSection } from "./views";
```

Remove `const featuredNotebooks = ctx.featuredNotebooks;` and `sortedFeaturedNotebooks`. Add:

```tsx
  const featuredPublic = useFeaturedNotebooks();
  const communityPublic = usePublicNotebooks();
  const isAdmin = useIsAdmin();
  const setFeatured = useSetNotebookFeatured();
  const adminUnpublish = useAdminUnpublishNotebook();
  const { error: toastError } = useToast();

  const runModeration = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toastError(error instanceof Error ? error.message : "Could not update notebook");
    }
  };

  const publicSectionProps = {
    featured: featuredPublic ?? [],
    community: communityPublic.results,
    communityStatus: communityPublic.status,
    onLoadMore: () => communityPublic.loadMore(24),
    viewMode,
    onSelectNotebook,
    isAdmin,
    onToggleFeatured: (nb: NotebookItem) =>
      void runModeration(() =>
        setFeatured({ notebookId: nb.id as Id<"notebooks">, isFeatured: !nb.isFeatured })
      ),
    onUnpublish: (nb: NotebookItem) =>
      void runModeration(() => adminUnpublish({ notebookId: nb.id as Id<"notebooks"> })),
  };
```

Check how `useToast` is imported elsewhere in `features/notebooks` (`@/shared/contexts/useToast`) and match its API (`error` vs `showError` — `ShareNotebookModal.tsx` uses it). Import `Id` from `@convex/_generated/dataModel` and `NotebookItem` from `@/shared/types/index`.

Tabs:

```tsx
            <TabsContent value="all">
              <div className="flex flex-col gap-8">
                <PublicSection {...publicSectionProps} featuredOnly />
                {recentSection}
              </div>
            </TabsContent>
            <TabsContent value="mine">{recentSection}</TabsContent>
            <TabsContent value="public">
              <PublicSection {...publicSectionProps} />
            </TabsContent>
```

In the customize modal lookup, replace `[...featuredNotebooks, ...recentNotebooks]` with `recentNotebooks`.

- [ ] **Step 6: Context.** In `useNotebookContext.ts`, delete `featuredNotebooks: NotebookItem[];`. In `AppShell.tsx`, delete the `featuredNotebooks` memo, make `recentNotebooks` the whole `notebookList`:

```ts
  const recentNotebooks = notebookList;
```

and remove `featuredNotebooks` from `notebookContextValue` and its dependency list.

- [ ] **Step 7: Run tests and typecheck.** `bun run test:web -- src/features/notebooks` then `bun run typecheck:web`. Expected: PASS except AppShell items handled in Task 12.

- [ ] **Step 8: Commit.**

```bash
git add -A apps/web/src/features/notebooks apps/web/src/shell/AppShell.tsx
git commit -m "feat(web): Public tab with Featured shelf and Community grid"
```

---

## Task 12: Opening a public notebook (header byline + Fork)

**Files:** Modify `apps/web/src/shell/AppShell.tsx`, `apps/web/src/shared/ui/Header.tsx`

- [ ] **Step 1: Load notebooks outside your list.** In `AppShell.tsx` replace the `activeNotebook` memo with:

```tsx
  const listedNotebook = useMemo(
    () =>
      urlNotebookId ? notebookList.find((nb: NotebookItem) => nb.id === urlNotebookId) : undefined,
    [urlNotebookId, notebookList]
  );
  // A public notebook you don't own or cowork on isn't in your list; fetch it directly.
  const visitedNotebook = useQuery(
    api.notebooks.index.get,
    urlNotebookId && notebooks !== undefined && !listedNotebook
      ? { id: urlNotebookId as Id<"notebooks"> }
      : "skip"
  );
  const activeNotebook: NotebookItem | undefined = listedNotebook ?? visitedNotebook ?? undefined;
  const isViewingPublic = activeNotebook?.access === "viewer";
```

Replace the title effect so it works for visited notebooks too:

```tsx
  useEffect(() => {
    if (urlNotebookId && activeNotebook) setNotebookTitle(activeNotebook.title);
  }, [urlNotebookId, activeNotebook]);
```

Change the share-modal guard and header props so viewers get neither rename nor share:

```tsx
    if (!urlNotebookId || !activeNotebook || activeNotebook.access !== "owner") {
      setShareModalOpen(false);
    }
```

```tsx
      {shareModalOpen && urlNotebookId && activeNotebook?.access === "owner" && (
        <ShareNotebookModal
          notebookId={urlNotebookId}
          isPublic={activeNotebook.isPublic ?? false}
          onClose={() => setShareModalOpen(false)}
        />
      )}
```

```tsx
          notebookRenamable={
            location.pathname.startsWith("/notebook/") && activeNotebook?.access === "owner"
          }
          onShare={
            location.pathname.startsWith("/notebook/") && activeNotebook?.access === "owner"
              ? () => setShareModalOpen(true)
              : undefined
          }
          byline={
            location.pathname.startsWith("/notebook/") && isViewingPublic
              ? `Public · by ${activeNotebook?.ownerName ?? "SolomindLM user"}`
              : undefined
          }
          onFork={
            location.pathname.startsWith("/notebook/") && isViewingPublic ? handleFork : undefined
          }
```

Note: the old guards used `!isSharedNotebook`; editors still can't rename or share because `access === "editor"`.

Add the fork handler (with `useForkPublicNotebook` from `notebooksApi` and the existing toast hook):

```tsx
  const forkPublic = useForkPublicNotebook();
  const { error: toastError } = useToast();
  const handleFork = useCallback(async () => {
    if (!urlNotebookId) return;
    try {
      const { newNotebookId } = await forkPublic({ notebookId: urlNotebookId as Id<"notebooks"> });
      navigate(`/notebook/${newNotebookId}`);
    } catch (error) {
      toastError(error instanceof Error ? error.message : "Could not fork notebook");
    }
  }, [forkPublic, navigate, toastError, urlNotebookId]);
```

If the notebook-limit error should open the upgrade toast, use `useLimitErrorToast().handleLimitError(error)` first, as `HomePage.tsx` does.

- [ ] **Step 2: Header props.** In `Header.tsx` add to `HeaderProps`:

```ts
  /** Shown under the title, e.g. "Public · by Ada" when viewing someone's public notebook. */
  byline?: string;
  /** Viewing a public notebook: copy it into your account. */
  onFork?: () => void;
```

Destructure them. Wrap the non-editable title `h1` so the byline sits under it:

```tsx
            ) : (
              <div className="flex min-w-0 flex-col">
                <h1
                  className="text-lg font-display font-bold text-foreground tracking-tight truncate min-w-0"
                  title={title}
                >
                  {title}
                </h1>
                {byline && (
                  <span className="truncate font-sans text-xs text-muted-foreground">{byline}</span>
                )}
              </div>
            )}
```

Add the Fork button before the Share button (import `GitFork` from lucide):

```tsx
        {onFork && (
          <Button
            type="button"
            size="sm"
            onClick={onFork}
            title="Copy this notebook to your account"
            className="shrink-0"
          >
            <GitFork aria-hidden />
            <span className="hidden sm:inline">Fork</span>
          </Button>
        )}
```

- [ ] **Step 3: Typecheck.** `bun run typecheck:web`. Expected: PASS except `ShareNotebookModal`'s new `isPublic` prop (Task 13).

- [ ] **Step 4: Commit.**

```bash
git add apps/web/src/shell/AppShell.tsx apps/web/src/shared/ui/Header.tsx
git commit -m "feat(web): open public notebooks with byline and Fork button"
```

---

## Task 13: "Make public" in the share dialog

**Files:** Modify `apps/web/src/features/notebooks/components/modals/ShareNotebookModal.tsx`

- [ ] **Step 1: Add the prop and switch.** Add `isPublic: boolean;` to `ShareNotebookModalProps`. Import `Switch` from `@/shared/components/ui/switch`, `Label` from `@/shared/components/ui/label`, `Globe` from lucide, and `useSetNotebookPublic` from `../../services/notebooksApi`. In the component:

```tsx
  const setNotebookPublic = useSetNotebookPublic();
  const [publicBusy, setPublicBusy] = useState(false);

  const handlePublicChange = async (next: boolean) => {
    setPublicBusy(true);
    try {
      await setNotebookPublic({ notebookId: notebookId as Id<"notebooks">, isPublic: next });
      success(next ? "Notebook is now public" : "Notebook is private again");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Could not change visibility");
    } finally {
      setPublicBusy(false);
    }
  };
```

(The file already has `const { success, error: showError } = useToast();`.)

Insert this block right after the closing `</div>` of the dialog header (`border-b border-border p-6`), before the scroll container:

```tsx
        <div className="flex items-start gap-4 border-b border-border px-6 py-4">
          <Globe aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="notebook-public" className="font-sans text-sm font-semibold">
              Make public
            </Label>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Anyone signed in to SolomindLM can find this notebook on the Public tab, read its
              sources and Studio items, chat with it privately, and fork a copy. They can't change
              it.
            </p>
          </div>
          <Switch
            id="notebook-public"
            checked={isPublic}
            disabled={publicBusy}
            onCheckedChange={(next) => void handlePublicChange(next)}
          />
        </div>
```

`isPublic` comes from the reactive notebook list, so the switch updates when the mutation lands.

- [ ] **Step 2: Typecheck and run the modal's tests if any.** `bun run typecheck:web`; `bun run test:web -- src/features/notebooks/components/modals`. Expected: PASS (add `isPublic={false}` to any existing test render).

- [ ] **Step 3: Commit.**

```bash
git add apps/web/src/features/notebooks/components/modals/ShareNotebookModal.tsx
git commit -m "feat(web): make-public switch in the share dialog"
```

---

## Task 14: Read-only notebook view for viewers

**Files:** Modify `NotebookView.tsx`, `SourcesPanel.tsx`, `SourceList.tsx`, `SourceListItem.tsx`, `StudioPanel.tsx`, `NoteListView.tsx`, `NoteItem.tsx`, `ChatPanel.tsx`; tests `SourceList.test.tsx`, `NoteItem.test.tsx`

Thread one `readOnly` boolean down from `NotebookView`; each component hides its own edit controls. Viewers keep: viewing sources, selecting sources for chat, searching, opening studio items, playing audio, exporting/copying, chatting.

- [ ] **Step 1: Write failing tests.**

In `SourceList.test.tsx` add (reuse the file's existing default props helper; if it has none, copy the props from its first test):

```tsx
  test("read-only hides add, delete and discover", () => {
    renderSourceList({ readOnly: true });
    expect(screen.queryByRole("button", { name: /add source/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete selected" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Discover sources" })).not.toBeInTheDocument();
  });
```

In `NoteItem.test.tsx` add:

```tsx
  test("read-only hides the rename/delete menu", () => {
    renderNoteItem({ readOnly: true });
    expect(screen.queryByRole("button", { name: "More options" })).not.toBeInTheDocument();
  });
```

(`renderSourceList` / `renderNoteItem` stand for whatever render helper or inline render the file already uses; pass `readOnly` through it.)

- [ ] **Step 2: Run to see them fail.** `bun run test:web -- src/features/sources/components/SourceList.test.tsx src/features/studio/components/NoteItem.test.tsx`. Expected: FAIL.

- [ ] **Step 3: Sources.**

`SourceList.tsx`: add `readOnly?: boolean;` to `SourceListProps` and destructure it. Wrap the top action row so only the source search shows:

```tsx
          {!readOnly && (
            <div className="flex items-center gap-2">
              {/* existing Add source button + ButtonGroup (Discover, Refresh all, Delete selected) unchanged */}
            </div>
          )}
```

In the empty state, render the `EmptyContent` add button only when `!readOnly`, and when `readOnly` use the title "No sources" and description "This notebook has no sources yet.". Pass `readOnly={readOnly}` to each `<SourceListItem>`.

`SourceListItem.tsx`: add `readOnly?: boolean;` to `SourceListItemProps`; render the whole `<DropdownMenu ...>` (rename, delete, find full text, upload PDF, refresh) only when `!readOnly`.

`SourcesPanel.tsx`: add `readOnly?: boolean;` to its props; pass it to `<SourceList readOnly={readOnly} ...>`; render `<AddSourceDialog>` only when `!readOnly`; skip the drag-and-drop upload handlers when `readOnly` (search the file for `onDrop`/`handleDrop` and guard: `onDrop={readOnly ? undefined : sourceUpload.handleDrop}`); and in `SourcesPanelHeader` usage pass `onEnterRename={readOnly ? noop : ...}` — simplest is to add `readOnly` to `SourcesPanelHeader` too and render the title as a plain `<span>` instead of the rename button when `readOnly`.

- [ ] **Step 4: Studio.**

`NoteItem.tsx`: add `readOnly?: boolean;`; render the `<DropdownMenu ...>` block only when `!readOnly`.

`NoteListView.tsx`: add `readOnly?: boolean;`; render `<ToolGrid ... />` only when `!readOnly`; pass `readOnly` to each `<NoteItem>`; when `readOnly` and there are no notes, the empty text is "No Studio items in this notebook.".

`StudioPanel.tsx`: add `readOnly?: boolean;` to `StudioPanelProps`; pass `readOnly` to `<NoteListView>`; pass `onEditStart={readOnly ? undefined : handleEditStartFromHeader}` and `onEditReport={readOnly ? undefined : handleEditReport}` to `StudioPanelHeader` if those props are optional there — if they are required, add a `readOnly` prop to `StudioPanelHeader` and hide the rename/edit buttons instead. Leave copy/download/export.

- [ ] **Step 5: Chat.** `ChatPanel.tsx`: add `readOnly?: boolean;` to its props. Hide the menu item at ~line 798 that opens `ConfigureChatModal` when `readOnly`. Pass `onModelChange={readOnly ? undefined : (modelId) => handleSaveChatConfig(...)}` (ChatInput hides the picker when it is undefined). Search ChatPanel for any "save to note" / "Save as note" action and hide it when `readOnly` (`grep -n "Save to note\|saveToNote\|onSaveNote" apps/web/src/features/chat -r`), since notes write to the notebook.

- [ ] **Step 6: Wire `NotebookView`.** In `NotebookView.tsx`:

```tsx
  const readOnly = activeNotebook?.access === "viewer";
```

(`activeNotebook` already comes from `useNotebookContext()` in this file.) Pass `readOnly={readOnly}` to both `<SourcesPanel>` renders, both `<ChatPanel>` renders, and the `<StudioPanel>` in `renderStudioColumn`.

- [ ] **Step 7: Run tests.** `bun run test:web`. Expected: PASS.

- [ ] **Step 8: Manual check in the browser preview** (`bun run dev:web` via the preview tool, with `dev:convex` already running for the dev deployment): as user A publish a notebook; as user B open `/notebook/<id>` — byline and Fork show, no add/delete/generate controls, chat works and A's threads are not visible; Fork lands in B's copy with every control back. Take screenshots for the PR.

- [ ] **Step 9: Commit.**

```bash
git add apps/web/src/features
git commit -m "feat(web): read-only notebook view for public notebook viewers"
```

---

## Task 15: E2E

**Files:** Create `e2e/notebooks/public-notebooks.spec.ts`

- [ ] **Step 1: Write the spec.** Follow `e2e/notebooks/notebook.spec.ts` for fixtures (`auth.fixture.ts`, `notebook.fixture.ts`) and cleanup helpers. The flow, single user:

```ts
import { expect, test } from "../fixtures/notebook.fixture";

test("publishing a notebook lists it on the Public tab", async ({ page, notebook }) => {
  await page.goto(`/notebook/${notebook.id}`);
  await page.getByRole("button", { name: /share/i }).click();
  await page.getByRole("switch", { name: "Make public" }).click();
  await expect(page.getByText("Notebook is now public")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/home");
  await page.getByRole("tab", { name: "Public" }).click();
  await expect(page.getByText(notebook.title)).toBeVisible();

  // Leave the shared e2e account clean.
  await page.goto(`/notebook/${notebook.id}`);
  await page.getByRole("button", { name: /share/i }).click();
  await page.getByRole("switch", { name: "Make public" }).click();
});
```

Adapt the fixture names (`notebook.id`, `notebook.title`) to what `notebook.fixture.ts` actually exposes. The cross-user viewer flow is covered by the Convex tests (Tasks 2–6).

- [ ] **Step 2: Run.** `bun run test:e2e -- e2e/notebooks/public-notebooks.spec.ts`. Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add e2e/notebooks/public-notebooks.spec.ts
git commit -m "test(e2e): publish a notebook to the Public tab"
```

---

## Task 16: Validation gates and PR

- [ ] **Step 1:** `bun run typecheck:web`, `bun run typecheck:convex`, `bun run typecheck:e2e` (one at a time). Expected: PASS.
- [ ] **Step 2:** `bun run lint` and `bun run lint:design`. Expected: PASS.
- [ ] **Step 3:** `bun run test:convex` and `bun run test:web`. Expected: PASS.
- [ ] **Step 4:** `npx convex codegen` and confirm `git status` shows no `convex/_generated` diff.
- [ ] **Step 5:** Push and open the PR (`feat(notebooks): public notebooks`), body: summary, the read-then-write sites reviewed in Task 2 Step 5, the prod `isFeatured` count from Task 8, screenshots from Task 14, and a note that quiz/flashcard/written-answer practice stays edit-only until PR 2 (viewers see an error toast if they try). End with the Claude Code attribution line.
