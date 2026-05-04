import { test, expect } from "../fixtures/notebook.fixture";
import { TOOL_LABELS, openStudioTool } from "../helpers/studio-assertions";
import { openStudioPanel } from "../helpers/navigation";

// Keep layout on md+ (three columns + chat header) so Studio is not forced into mobile tab affordances only
test.use({ viewport: { width: 1440, height: 900 } });
test.describe.configure({ timeout: 90_000 });

test.describe("Studio Tool Grid", () => {
  test("all 8 tool cards render", async ({ notebookPage }) => {
    const page = notebookPage;

    await openStudioPanel(page);

    await expect(page.getByRole("heading", { level: 3, name: "Create" })).toBeVisible({
      timeout: 20_000,
    });

    const grid = page.getByTestId("studio-tool-grid");
    for (const label of TOOL_LABELS) {
      await expect(grid.getByRole("button", { name: label, exact: true })).toBeVisible({
        timeout: 15_000,
      });
    }
  });

  test("clicking Reports tool opens report modal", async ({ notebookPage }) => {
    const page = notebookPage;

    await openStudioTool(page, "Reports");

    // Modal header says "Create report"
    await expect(page.getByRole("heading", { name: /create report/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("clicking Flashcards tool opens flashcard modal", async ({ notebookPage }) => {
    const page = notebookPage;

    await openStudioTool(page, "Flashcards");

    await expect(
      page.getByRole("heading", { name: /customize flashcards/i })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("clicking Quiz tool opens quiz modal", async ({ notebookPage }) => {
    const page = notebookPage;

    await openStudioTool(page, "Quiz");

    await expect(page.getByRole("heading", { name: /customize quiz/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("clicking Audio Overview tool opens audio modal", async ({ notebookPage }) => {
    const page = notebookPage;

    await openStudioTool(page, "Audio Overview");

    await expect(
      page.getByRole("heading", { name: /customize audio overview/i })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("clicking Infographic tool opens infographic modal", async ({ notebookPage }) => {
    const page = notebookPage;

    await openStudioTool(page, "Infographic");

    await expect(
      page.getByRole("heading", { name: /customize infographic/i })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("clicking Written Questions tool opens written questions modal", async ({
    notebookPage,
  }) => {
    const page = notebookPage;

    await openStudioTool(page, "Written Questions");

    await expect(
      page.getByRole("heading", { name: /customize written questions/i })
    ).toBeVisible({ timeout: 15_000 });
  });

  test("clicking Spreadsheets tool opens spreadsheet modal", async ({ notebookPage }) => {
    const page = notebookPage;

    await openStudioTool(page, "Spreadsheets");

    await expect(page.getByRole("heading", { name: /create spreadsheet/i })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("clicking Mind Map with no sources shows needs-sources dialog", async ({ notebookPage }) => {
    const page = notebookPage;

    await openStudioTool(page, "Mind Map");

    await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/no sources selected/i)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
  });
});
