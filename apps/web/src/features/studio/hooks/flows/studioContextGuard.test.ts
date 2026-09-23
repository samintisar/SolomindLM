import { describe, expect, it, vi } from "vitest";
import { confirmStudioContextBudget, getStudioContextWarning } from "./studioContextGuard";

// ~540k estimated tokens — well over any model's studio budget.
const overBudgetWords = 400_000;

describe("getStudioContextWarning", () => {
  it("returns null when the selection fits the budget", () => {
    expect(getStudioContextWarning([{ selected: true, wordCount: 5_000 }])).toBeNull();
  });

  it("ignores unselected sources", () => {
    expect(
      getStudioContextWarning([
        { selected: true, wordCount: 5_000 },
        { selected: false, wordCount: overBudgetWords },
      ])
    ).toBeNull();
  });

  it("suggests selecting fewer, more targeted sources when over budget", () => {
    const warning = getStudioContextWarning([{ selected: true, wordCount: overBudgetWords }]);
    expect(warning).not.toBeNull();
    expect(warning?.message).toMatch(/fewer, more targeted sources/);
    expect(warning?.message).toContain("about 400,000 words");
  });
});

describe("confirmStudioContextBudget", () => {
  const overBudget = [{ selected: true, wordCount: overBudgetWords }];

  it("proceeds without prompting when within budget", async () => {
    const confirm = vi.fn();
    await expect(
      confirmStudioContextBudget({ sources: [{ selected: true, wordCount: 10 }], confirm })
    ).resolves.toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("prompts with proceed / adjust options when over budget", async () => {
    const confirm = vi.fn().mockResolvedValue(true);
    await expect(confirmStudioContextBudget({ sources: overBudget, confirm })).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        confirmText: "Generate anyway",
        cancelText: "Adjust sources",
        variant: "warning",
      })
    );
  });

  it("stops when the user chooses to adjust sources", async () => {
    const confirm = vi.fn().mockResolvedValue(false);
    await expect(confirmStudioContextBudget({ sources: overBudget, confirm })).resolves.toBe(false);
  });

  it("proceeds when no confirm dialog is available", async () => {
    await expect(confirmStudioContextBudget({ sources: overBudget })).resolves.toBe(true);
  });
});
