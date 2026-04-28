/// <reference types="vite/client" />
import { describe, it, expect } from "vitest";
import { convexTest } from "convex-test";
import { api } from "../../_generated/api";
import schema from "../../schema.js";
import {
  PROMPT_TEXT_MAX_LENGTH,
  PROMPT_TITLE_MAX_LENGTH,
  PROMPT_REPORT_AUTO_HIDE_THRESHOLD,
  RATING_PRIOR_MEAN,
  RATING_PRIOR_COUNT,
} from "./config.js";

// convex-test resolves function references like api.studio.prompts.index.createPrompt
// by looking up module keys. We need keys relative to convex/ root (e.g. "./studio/prompts/index.ts").
// From this subdirectory, we use a root-relative glob and normalize the keys.
const rawModules = import.meta.glob("/convex/**/*.ts") as Record<string, () => Promise<any>>;
const modules = Object.fromEntries(
  Object.entries(rawModules).map(([key, loader]) => [
    key.replace(/^\/convex\//, "./"),
    loader,
  ]),
);

async function seedUser(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    return await ctx.db.insert("users", {
      name: "Test User",
      email: "test@example.com",
      emailVerificationTime: Date.now(),
      isAnonymous: false,
    });
  });
}

function asUser(t: ReturnType<typeof convexTest>, userId: string) {
  return t.withIdentity({ subject: userId, issuer: "test", tokenIdentifier: `test|${userId}` });
}

describe("Prompt Library — createPrompt", () => {
  it("creates a private prompt", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const promptId = await asUser(t, userId).mutation(api.studio.prompts.index.createPrompt, {
      title: "My Report Prompt",
      description: "A great prompt",
      promptText: "Write a detailed analysis of {{topic}}",
      studioTool: "report",
    });

    expect(promptId).toBeDefined();

    const prompt = await asUser(t, userId).query(api.studio.prompts.index.getPrompt, {
      promptId: promptId as any,
    });

    expect(prompt).toMatchObject({
      title: "My Report Prompt",
      description: "A great prompt",
      promptText: "Write a detailed analysis of {{topic}}",
      studioTool: "report",
      visibility: "private",
      status: "active",
      userId: userId as any,
    });
  });

  it("rejects unauthenticated users", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.studio.prompts.index.createPrompt, {
        title: "Test",
        promptText: "Hello",
        studioTool: "report",
      }),
    ).rejects.toThrow("Unauthenticated");
  });

  it("rejects empty title", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await expect(
      asUser(t, userId).mutation(api.studio.prompts.index.createPrompt, {
        title: "",
        promptText: "Some text",
        studioTool: "report",
      }),
    ).rejects.toThrow("Title is required");
  });

  it("rejects empty prompt text", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await expect(
      asUser(t, userId).mutation(api.studio.prompts.index.createPrompt, {
        title: "My Title",
        promptText: "   ",
        studioTool: "report",
      }),
    ).rejects.toThrow("Prompt text is required");
  });

  it("rejects title exceeding max length", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await expect(
      asUser(t, userId).mutation(api.studio.prompts.index.createPrompt, {
        title: "x".repeat(PROMPT_TITLE_MAX_LENGTH + 1),
        promptText: "Valid text",
        studioTool: "report",
      }),
    ).rejects.toThrow(`Title must be ≤${PROMPT_TITLE_MAX_LENGTH}`);
  });

  it("rejects prompt text exceeding max length", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await expect(
      asUser(t, userId).mutation(api.studio.prompts.index.createPrompt, {
        title: "Valid title",
        promptText: "x".repeat(PROMPT_TEXT_MAX_LENGTH + 1),
        studioTool: "report",
      }),
    ).rejects.toThrow(`Prompt text must be ≤${PROMPT_TEXT_MAX_LENGTH}`);
  });

  it("trims whitespace from title and prompt text", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const promptId = await asUser(t, userId).mutation(api.studio.prompts.index.createPrompt, {
      title: "  Trimmed Title  ",
      promptText: "  Trimmed text  ",
      studioTool: "quiz",
    });

    const prompt = await asUser(t, userId).query(api.studio.prompts.index.getPrompt, {
      promptId: promptId as any,
    });

    expect(prompt!.title).toBe("Trimmed Title");
    expect(prompt!.promptText).toBe("Trimmed text");
  });
});

describe("Prompt Library — publishPrompt / unpublishPrompt", () => {
  it("publishes a private prompt", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const promptId = await asUser(t, userId).mutation(api.studio.prompts.index.createPrompt, {
      title: "Publishable",
      promptText: "Good prompt text",
      studioTool: "report",
    });

    await asUser(t, userId).mutation(api.studio.prompts.index.publishPrompt, {
      promptId: promptId as any,
    });

    const prompt = await asUser(t, userId).query(api.studio.prompts.index.getPrompt, {
      promptId: promptId as any,
    });

    expect(prompt!.visibility).toBe("public");
    expect(prompt!.publishedAt).toBeGreaterThan(0);
  });

  it("rejects publishing another user's prompt", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t);
    const other = await seedUser(t);

    const promptId = await asUser(t, owner).mutation(api.studio.prompts.index.createPrompt, {
      title: "Private",
      promptText: "Secret text",
      studioTool: "report",
    });

    await expect(
      asUser(t, other).mutation(api.studio.prompts.index.publishPrompt, {
        promptId: promptId as any,
      }),
    ).rejects.toThrow("Not found or not owner");
  });

  it("unpublishes a public prompt", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const promptId = await asUser(t, userId).mutation(api.studio.prompts.index.createPrompt, {
      title: "Will Unpublish",
      promptText: "Text",
      studioTool: "report",
    });

    await asUser(t, userId).mutation(api.studio.prompts.index.publishPrompt, {
      promptId: promptId as any,
    });

    await asUser(t, userId).mutation(api.studio.prompts.index.unpublishPrompt, {
      promptId: promptId as any,
    });

    const prompt = await asUser(t, userId).query(api.studio.prompts.index.getPrompt, {
      promptId: promptId as any,
    });

    expect(prompt!.visibility).toBe("private");
  });
});

describe("Prompt Library — savePublicPrompt", () => {
  it("creates a private copy and increments save count", async () => {
    const t = convexTest(schema, modules);
    const author = await seedUser(t);
    const saver = await seedUser(t);

    const promptId = await asUser(t, author).mutation(api.studio.prompts.index.createPrompt, {
      title: "Great Prompt",
      promptText: "Use this template",
      studioTool: "report",
    });

    await asUser(t, author).mutation(api.studio.prompts.index.publishPrompt, {
      promptId: promptId as any,
    });

    const copyId = await asUser(t, saver).mutation(api.studio.prompts.index.savePublicPrompt, {
      publicPromptId: promptId as any,
    });

    expect(copyId).toBeDefined();

    const copy = await asUser(t, saver).query(api.studio.prompts.index.getPrompt, {
      promptId: copyId as any,
    });

    expect(copy).toMatchObject({
      title: "Great Prompt",
      promptText: "Use this template",
      visibility: "private",
      sourcePromptId: promptId as any,
    });

    const original = await asUser(t, author).query(api.studio.prompts.index.getPrompt, {
      promptId: promptId as any,
    });
    expect(original!.saveCount).toBe(1);
  });

  it("does not double-count on repeated saves", async () => {
    const t = convexTest(schema, modules);
    const author = await seedUser(t);
    const saver = await seedUser(t);

    const promptId = await asUser(t, author).mutation(api.studio.prompts.index.createPrompt, {
      title: "Double Save Test",
      promptText: "Text",
      studioTool: "quiz",
    });

    await asUser(t, author).mutation(api.studio.prompts.index.publishPrompt, {
      promptId: promptId as any,
    });

    await asUser(t, saver).mutation(api.studio.prompts.index.savePublicPrompt, {
      publicPromptId: promptId as any,
    });

    await asUser(t, saver).mutation(api.studio.prompts.index.savePublicPrompt, {
      publicPromptId: promptId as any,
    });

    const original = await asUser(t, author).query(api.studio.prompts.index.getPrompt, {
      promptId: promptId as any,
    });
    expect(original!.saveCount).toBe(1);
  });
});

describe("Prompt Library — ratePrompt", () => {
  it("creates a new rating and computes Bayesian average", async () => {
    const t = convexTest(schema, modules);
    const author = await seedUser(t);
    const rater = await seedUser(t);

    const promptId = await asUser(t, author).mutation(api.studio.prompts.index.createPrompt, {
      title: "Rate Me",
      promptText: "Text",
      studioTool: "report",
    });

    await asUser(t, author).mutation(api.studio.prompts.index.publishPrompt, {
      promptId: promptId as any,
    });

    await asUser(t, rater).mutation(api.studio.prompts.index.ratePrompt, {
      publicPromptId: promptId as any,
      rating: 5,
    });

    const prompt = await asUser(t, author).query(api.studio.prompts.index.getPrompt, {
      promptId: promptId as any,
    });

    expect(prompt!.ratingCount).toBe(1);
    expect(prompt!.ratingSum).toBe(5);
    expect(prompt!.ratingAverage).toBe(5);

    const expectedBayesian = (5 + RATING_PRIOR_MEAN * RATING_PRIOR_COUNT) / (1 + RATING_PRIOR_COUNT);
    expect(prompt!.bayesianRating).toBeCloseTo(expectedBayesian, 3);
  });

  it("updates an existing rating", async () => {
    const t = convexTest(schema, modules);
    const author = await seedUser(t);
    const rater = await seedUser(t);

    const promptId = await asUser(t, author).mutation(api.studio.prompts.index.createPrompt, {
      title: "Update Rating",
      promptText: "Text",
      studioTool: "report",
    });

    await asUser(t, author).mutation(api.studio.prompts.index.publishPrompt, {
      promptId: promptId as any,
    });

    await asUser(t, rater).mutation(api.studio.prompts.index.ratePrompt, {
      publicPromptId: promptId as any,
      rating: 3,
    });

    await asUser(t, rater).mutation(api.studio.prompts.index.ratePrompt, {
      publicPromptId: promptId as any,
      rating: 5,
    });

    const prompt = await asUser(t, author).query(api.studio.prompts.index.getPrompt, {
      promptId: promptId as any,
    });

    expect(prompt!.ratingCount).toBe(1);
    expect(prompt!.ratingSum).toBe(5);
    expect(prompt!.ratingAverage).toBe(5);
  });

  it("rejects invalid ratings", async () => {
    const t = convexTest(schema, modules);
    const author = await seedUser(t);
    const rater = await seedUser(t);

    const promptId = await asUser(t, author).mutation(api.studio.prompts.index.createPrompt, {
      title: "Bad Rating",
      promptText: "Text",
      studioTool: "report",
    });

    await asUser(t, author).mutation(api.studio.prompts.index.publishPrompt, {
      promptId: promptId as any,
    });

    await expect(
      asUser(t, rater).mutation(api.studio.prompts.index.ratePrompt, {
        publicPromptId: promptId as any,
        rating: 0,
      }),
    ).rejects.toThrow("Rating must be an integer from 1 to 5");

    await expect(
      asUser(t, rater).mutation(api.studio.prompts.index.ratePrompt, {
        publicPromptId: promptId as any,
        rating: 6,
      }),
    ).rejects.toThrow("Rating must be an integer from 1 to 5");

    await expect(
      asUser(t, rater).mutation(api.studio.prompts.index.ratePrompt, {
        publicPromptId: promptId as any,
        rating: 3.5,
      }),
    ).rejects.toThrow("Rating must be an integer from 1 to 5");
  });
});

describe("Prompt Library — reportPrompt", () => {
  it("records a report and increments report count", async () => {
    const t = convexTest(schema, modules);
    const author = await seedUser(t);
    const reporter = await seedUser(t);

    const promptId = await asUser(t, author).mutation(api.studio.prompts.index.createPrompt, {
      title: "Report Me",
      promptText: "Text",
      studioTool: "report",
    });

    await asUser(t, author).mutation(api.studio.prompts.index.publishPrompt, {
      promptId: promptId as any,
    });

    await asUser(t, reporter).mutation(api.studio.prompts.index.reportPrompt, {
      promptId: promptId as any,
      reason: "Inappropriate",
    });

    const prompt = await asUser(t, author).query(api.studio.prompts.index.getPrompt, {
      promptId: promptId as any,
    });

    expect(prompt!.reportCount).toBe(1);
    expect(prompt!.status).toBe("active");
  });

  it("auto-hides when threshold is reached", async () => {
    const t = convexTest(schema, modules);
    const author = await seedUser(t);

    const promptId = await asUser(t, author).mutation(api.studio.prompts.index.createPrompt, {
      title: "Auto Hide",
      promptText: "Text",
      studioTool: "report",
    });

    await asUser(t, author).mutation(api.studio.prompts.index.publishPrompt, {
      promptId: promptId as any,
    });

    for (let i = 0; i < PROMPT_REPORT_AUTO_HIDE_THRESHOLD; i++) {
      const reporter = await seedUser(t);
      await asUser(t, reporter).mutation(api.studio.prompts.index.reportPrompt, {
        promptId: promptId as any,
      });
    }

    const prompt = await asUser(t, author).query(api.studio.prompts.index.getPrompt, {
      promptId: promptId as any,
    });

    expect(prompt!.reportCount).toBe(PROMPT_REPORT_AUTO_HIDE_THRESHOLD);
    expect(prompt!.status).toBe("hidden");
  });

  it("rejects duplicate reports from the same user", async () => {
    const t = convexTest(schema, modules);
    const author = await seedUser(t);
    const reporter = await seedUser(t);

    const promptId = await asUser(t, author).mutation(api.studio.prompts.index.createPrompt, {
      title: "Dupe Report",
      promptText: "Text",
      studioTool: "report",
    });

    await asUser(t, author).mutation(api.studio.prompts.index.publishPrompt, {
      promptId: promptId as any,
    });

    await asUser(t, reporter).mutation(api.studio.prompts.index.reportPrompt, {
      promptId: promptId as any,
    });

    await expect(
      asUser(t, reporter).mutation(api.studio.prompts.index.reportPrompt, {
        promptId: promptId as any,
      }),
    ).rejects.toThrow("Already reported");
  });
});

describe("Prompt Library — deletePrompt", () => {
  it("hard-deletes a private prompt", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const promptId = await asUser(t, userId).mutation(api.studio.prompts.index.createPrompt, {
      title: "Delete Me",
      promptText: "Text",
      studioTool: "report",
    });

    await asUser(t, userId).mutation(api.studio.prompts.index.deletePrompt, {
      promptId: promptId as any,
    });

    const prompt = await asUser(t, userId).query(api.studio.prompts.index.getPrompt, {
      promptId: promptId as any,
    });

    expect(prompt).toBeNull();
  });

  it("soft-deletes a public prompt", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const promptId = await asUser(t, userId).mutation(api.studio.prompts.index.createPrompt, {
      title: "Public Delete",
      promptText: "Text",
      studioTool: "report",
    });

    await asUser(t, userId).mutation(api.studio.prompts.index.publishPrompt, {
      promptId: promptId as any,
    });

    await asUser(t, userId).mutation(api.studio.prompts.index.deletePrompt, {
      promptId: promptId as any,
    });

    const prompt = await asUser(t, userId).query(api.studio.prompts.index.getPrompt, {
      promptId: promptId as any,
    });

    expect(prompt!.status).toBe("removed");
  });
});

describe("Prompt Library — updatePrompt", () => {
  it("updates title and prompt text", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    const promptId = await asUser(t, userId).mutation(api.studio.prompts.index.createPrompt, {
      title: "Original Title",
      promptText: "Original text",
      studioTool: "report",
    });

    await asUser(t, userId).mutation(api.studio.prompts.index.updatePrompt, {
      promptId: promptId as any,
      title: "Updated Title",
      promptText: "Updated text",
    });

    const prompt = await asUser(t, userId).query(api.studio.prompts.index.getPrompt, {
      promptId: promptId as any,
    });

    expect(prompt!.title).toBe("Updated Title");
    expect(prompt!.promptText).toBe("Updated text");
  });

  it("rejects updates from non-owner", async () => {
    const t = convexTest(schema, modules);
    const owner = await seedUser(t);
    const other = await seedUser(t);

    const promptId = await asUser(t, owner).mutation(api.studio.prompts.index.createPrompt, {
      title: "Owner Only",
      promptText: "Text",
      studioTool: "report",
    });

    await expect(
      asUser(t, other).mutation(api.studio.prompts.index.updatePrompt, {
        promptId: promptId as any,
        title: "Hacked Title",
      }),
    ).rejects.toThrow("Not found or not owner");
  });
});

describe("Prompt Library — listMyPrompts", () => {
  it("returns only the user's prompts", async () => {
    const t = convexTest(schema, modules);
    const user1 = await seedUser(t);
    const user2 = await seedUser(t);

    await asUser(t, user1).mutation(api.studio.prompts.index.createPrompt, {
      title: "User1 Prompt",
      promptText: "Text 1",
      studioTool: "report",
    });

    await asUser(t, user2).mutation(api.studio.prompts.index.createPrompt, {
      title: "User2 Prompt",
      promptText: "Text 2",
      studioTool: "report",
    });

    const result = await asUser(t, user1).query(api.studio.prompts.index.listMyPrompts, {
      paginationOpts: { numItems: 50, cursor: null },
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].title).toBe("User1 Prompt");
  });

  it("filters by studioTool", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);

    await asUser(t, userId).mutation(api.studio.prompts.index.createPrompt, {
      title: "Report Prompt",
      promptText: "Text",
      studioTool: "report",
    });

    await asUser(t, userId).mutation(api.studio.prompts.index.createPrompt, {
      title: "Quiz Prompt",
      promptText: "Text",
      studioTool: "quiz",
    });

    const result = await asUser(t, userId).query(api.studio.prompts.index.listMyPrompts, {
      studioTool: "quiz",
      paginationOpts: { numItems: 50, cursor: null },
    });

    expect(result.page).toHaveLength(1);
    expect(result.page[0].studioTool).toBe("quiz");
  });
});
