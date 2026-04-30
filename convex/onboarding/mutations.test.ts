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

function withAuth(t: ReturnType<typeof convexTest>, userId: string) {
  return t.withIdentity({ subject: `${userId}|session1` });
}

type OnboardingPatch = {
  tourStatus?: "pending" | "active" | "skipped" | "completed";
  currentStepId?:
    | "createNotebook"
    | "addSource"
    | "askQuestion"
    | "generateArtifact";
  tourNotebookId?: Id<"notebooks">;
  checklistDismissed?: boolean;
  startedAt?: number;
  completedAt?: number;
};

async function seedRow(
  t: ReturnType<typeof convexTest>,
  patch: OnboardingPatch = {},
) {
  return await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "U" });
    await ctx.db.insert("userOnboarding", {
      userId,
      tourStatus: patch.tourStatus ?? "pending",
      currentStepId: patch.currentStepId,
      tourNotebookId: patch.tourNotebookId,
      checklistDismissed: patch.checklistDismissed ?? false,
      startedAt: patch.startedAt,
      completedAt: patch.completedAt,
    });
    return userId;
  });
}

async function readRow(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("userOnboarding")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique(),
  );
}

async function insertNotebookFor(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("notebooks", {
      userId,
      title: "N",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

describe("startTour", () => {
  test("happy path: pending -> active with createNotebook", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedRow(t, { tourStatus: "pending" });
    await withAuth(t, userId).mutation(
      api.onboarding.mutations.startTour,
      {},
    );
    const row = await readRow(t, userId);
    expect(row).toMatchObject({
      tourStatus: "active",
      currentStepId: "createNotebook",
    });
    expect(row?.startedAt).toBeTypeOf("number");
  });

  test("no-op when status is active", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedRow(t, {
      tourStatus: "active",
      currentStepId: "addSource",
    });
    await withAuth(t, userId).mutation(
      api.onboarding.mutations.startTour,
      {},
    );
    const row = await readRow(t, userId);
    expect(row?.tourStatus).toBe("active");
    expect(row?.currentStepId).toBe("addSource");
  });

  test("no-op when status is completed", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedRow(t, { tourStatus: "completed" });
    await withAuth(t, userId).mutation(
      api.onboarding.mutations.startTour,
      {},
    );
    const row = await readRow(t, userId);
    expect(row?.tourStatus).toBe("completed");
  });

  test("no-op when status is skipped", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedRow(t, { tourStatus: "skipped" });
    await withAuth(t, userId).mutation(
      api.onboarding.mutations.startTour,
      {},
    );
    const row = await readRow(t, userId);
    expect(row?.tourStatus).toBe("skipped");
  });
});

describe("advanceTourStep", () => {
  test("walks linearly from createNotebook to generateArtifact, then completed", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedRow(t, {
      tourStatus: "active",
      currentStepId: "createNotebook",
    });
    const auth = withAuth(t, userId);
    const tourNb = await insertNotebookFor(t, userId);

    await auth.mutation(api.onboarding.mutations.advanceTourStep, {
      expectedCurrentStepId: "createNotebook",
      tourNotebookId: tourNb,
    });
    expect((await readRow(t, userId))?.currentStepId).toBe("addSource");
    expect((await readRow(t, userId))?.tourNotebookId).toBe(tourNb);

    await auth.mutation(api.onboarding.mutations.advanceTourStep, {
      expectedCurrentStepId: "addSource",
    });
    expect((await readRow(t, userId))?.currentStepId).toBe("askQuestion");

    await auth.mutation(api.onboarding.mutations.advanceTourStep, {
      expectedCurrentStepId: "askQuestion",
    });
    expect((await readRow(t, userId))?.currentStepId).toBe("generateArtifact");

    await auth.mutation(api.onboarding.mutations.advanceTourStep, {
      expectedCurrentStepId: "generateArtifact",
    });
    const finalRow = await readRow(t, userId);
    expect(finalRow?.tourStatus).toBe("completed");
    expect(finalRow?.completedAt).toBeTypeOf("number");
  });

  test("rejects when expectedCurrentStepId mismatches", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedRow(t, {
      tourStatus: "active",
      currentStepId: "createNotebook",
    });
    await expect(
      withAuth(t, userId).mutation(
        api.onboarding.mutations.advanceTourStep,
        { expectedCurrentStepId: "addSource" },
      ),
    ).rejects.toThrow();
  });

  test("silent no-op when tour is not active (stale currentStepId)", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedRow(t, {
      tourStatus: "skipped",
      currentStepId: "addSource",
    });
    await expect(
      withAuth(t, userId).mutation(
        api.onboarding.mutations.advanceTourStep,
        { expectedCurrentStepId: "addSource" },
      ),
    ).resolves.toBeNull();
    const row = await readRow(t, userId);
    expect(row?.tourStatus).toBe("skipped");
    expect(row?.currentStepId).toBe("addSource");
  });
});

describe("skipTour", () => {
  test("sets tourStatus to skipped, leaves checklistDismissed alone", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedRow(t, {
      tourStatus: "active",
      currentStepId: "addSource",
      checklistDismissed: false,
    });
    await withAuth(t, userId).mutation(
      api.onboarding.mutations.skipTour,
      {},
    );
    const row = await readRow(t, userId);
    expect(row?.tourStatus).toBe("skipped");
    expect(row?.checklistDismissed).toBe(false);
  });

  test("clears currentStepId after skip", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedRow(t, {
      tourStatus: "active",
      currentStepId: "addSource",
    });
    await withAuth(t, userId).mutation(
      api.onboarding.mutations.skipTour,
      {},
    );
    const row = await readRow(t, userId);
    expect(row?.currentStepId).toBeUndefined();
  });
});

describe("completeTour", () => {
  test("sets completed and completedAt", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedRow(t, {
      tourStatus: "active",
      currentStepId: "generateArtifact",
    });
    await withAuth(t, userId).mutation(
      api.onboarding.mutations.completeTour,
      {},
    );
    const row = await readRow(t, userId);
    expect(row?.tourStatus).toBe("completed");
    expect(row?.completedAt).toBeTypeOf("number");
  });

  test("clears currentStepId after complete", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedRow(t, {
      tourStatus: "active",
      currentStepId: "generateArtifact",
    });
    await withAuth(t, userId).mutation(
      api.onboarding.mutations.completeTour,
      {},
    );
    const row = await readRow(t, userId);
    expect(row?.currentStepId).toBeUndefined();
  });
});

describe("dismissChecklist", () => {
  test("sets only checklistDismissed", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedRow(t, {
      tourStatus: "active",
      currentStepId: "addSource",
      checklistDismissed: false,
    });
    await withAuth(t, userId).mutation(
      api.onboarding.mutations.dismissChecklist,
      {},
    );
    const row = await readRow(t, userId);
    expect(row?.checklistDismissed).toBe(true);
    expect(row?.tourStatus).toBe("active");
  });
});

describe("restartTour", () => {
  test("sets active + createNotebook, clears tourNotebookId", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", { name: "U" }),
    );
    const tourNb = await insertNotebookFor(t, userId);
    await t.run(async (ctx) =>
      ctx.db.insert("userOnboarding", {
        userId,
        tourStatus: "completed",
        tourNotebookId: tourNb,
        checklistDismissed: false,
        completedAt: Date.now(),
      }),
    );
    await withAuth(t, userId).mutation(
      api.onboarding.mutations.restartTour,
      {},
    );
    const row = await readRow(t, userId);
    expect(row?.tourStatus).toBe("active");
    expect(row?.currentStepId).toBe("createNotebook");
    expect(row?.tourNotebookId).toBeUndefined();
    expect(row?.completedAt).toBeUndefined();
    expect(row?.startedAt).toBeTypeOf("number");
  });

  test("resets checklistDismissed to false", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedRow(t, {
      tourStatus: "completed",
      checklistDismissed: true,
    });
    await withAuth(t, userId).mutation(
      api.onboarding.mutations.restartTour,
      {},
    );
    const row = await readRow(t, userId);
    expect(row?.checklistDismissed).toBe(false);
  });
});

describe("showChecklist", () => {
  test("sets checklistDismissed back to false", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedRow(t, {
      tourStatus: "active",
      checklistDismissed: true,
    });
    await withAuth(t, userId).mutation(
      api.onboarding.mutations.showChecklist,
      {},
    );
    const row = await readRow(t, userId);
    expect(row?.checklistDismissed).toBe(false);
  });
});

describe("auth requirement", () => {
  test.each([
    ["startTour"],
    ["skipTour"],
    ["completeTour"],
    ["dismissChecklist"],
    ["restartTour"],
    ["showChecklist"],
  ] as const)("%s throws when unauthenticated", async (name) => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(
        api.onboarding.mutations[
          name as
            | "startTour"
            | "skipTour"
            | "completeTour"
            | "dismissChecklist"
            | "restartTour"
            | "showChecklist"
        ],
        {},
      ),
    ).rejects.toThrow();
  });

  test("advanceTourStep throws when unauthenticated", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.onboarding.mutations.advanceTourStep, {
        expectedCurrentStepId: "createNotebook",
      }),
    ).rejects.toThrow();
  });
});
