import type { FunctionReference } from "convex/server";
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";

const modules = {
  "./studio/literature_tables/index.ts": () => import("./index.js"),
  "./notes/index.ts": () => import("../../notes/index.js"),
  "./auth.ts": () => import("../../auth.js"),
  "./_generated/server.js": () => import("../../_generated/server.js"),
  "./_generated/api.js": () => import("../../_generated/api.js"),
};

function withAuth(t: ReturnType<typeof convexTest>, userId: Id<"users">) {
  return t.withIdentity({ subject: `${userId}|session1` });
}

async function seedUser(t: ReturnType<typeof convexTest>): Promise<Id<"users">> {
  return t.run(async (ctx) => ctx.db.insert("users", { name: "Test User" }));
}

async function seedNotebook(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">
): Promise<Id<"notebooks">> {
  return t.run(async (ctx) =>
    ctx.db.insert("notebooks", {
      userId,
      title: "Test Notebook",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

async function seedLiteratureReport(
  t: ReturnType<typeof convexTest>,
  userId: Id<"users">,
  notebookId: Id<"notebooks">
): Promise<Id<"literatureReports">> {
  return t.run(async (ctx) =>
    ctx.db.insert("literatureReports", {
      userId,
      notebookId,
      title: "Literature Report",
      status: "completed",
      content: "# Literature Report\n\nFindings with citations.",
      citationStyle: "apa7",
      sections: [{ heading: "Findings", content: "Findings with citations." }],
      citationIds: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

describe("saveLiteratureReportAsStudioReport", () => {
  test("copies a literature report into the Studio saved reports list", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    const notebookId = await seedNotebook(t, userId);
    const literatureReportId = await seedLiteratureReport(t, userId, notebookId);

    const saveLiteratureReportAsStudioReport = (
      api.studio.literature_tables.index as {
        saveLiteratureReportAsStudioReport: FunctionReference<
          "mutation",
          "public",
          { reportId: Id<"literatureReports"> },
          Id<"reports">
        >;
      }
    ).saveLiteratureReportAsStudioReport;

    const reportId = await withAuth(t, userId).mutation(saveLiteratureReportAsStudioReport, {
      reportId: literatureReportId,
    });

    const savedReports = await withAuth(t, userId).query(api.notes.index.list, {
      notebookId,
    });

    expect(reportId).toBeTruthy();
    expect(savedReports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: reportId,
          _type: "report",
          title: "Literature Report",
          status: "completed",
          content: "# Literature Report\n\nFindings with citations.",
          metadata: expect.objectContaining({
            reportType: "literature_review",
            sourceLiteratureReportId: literatureReportId,
            citationStyle: "apa7",
          }),
        }),
      ])
    );
  });
});
