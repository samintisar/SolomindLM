import { describe, expect, it } from "vitest";
import {
  FEEDBACK_TYPES,
  feedbackIssueBody,
  feedbackIssueLabels,
  feedbackIssueTitle,
  toAdminFeedbackRow,
} from "./feedback";

const base = {
  _id: "fb1",
  _creationTime: 1000,
  type: "bug" as const,
  body: "Quiz won't submit\nmore detail on line 2",
  detail: "1. open quiz 2. click finish",
  status: "received",
  route: "/notebook/abc/quiz",
  planTier: "pro",
  surface: "web",
  appVersion: "2.4.1",
  githubIssueNumber: undefined as number | undefined,
  githubIssueUrl: undefined as string | undefined,
  createdAt: 1000,
};

describe("feedback model", () => {
  it("exposes the two feedback types", () => {
    expect(FEEDBACK_TYPES).toEqual(["bug", "feature"]);
  });

  it("toAdminFeedbackRow keeps triage fields", () => {
    const row = toAdminFeedbackRow(base);
    expect(row).toMatchObject({
      id: "fb1",
      type: "bug",
      route: "/notebook/abc/quiz",
      planTier: "pro",
      surface: "web",
      appVersion: "2.4.1",
    });
  });

  it("feedbackIssueTitle uses the first line, prefixed and clipped", () => {
    expect(feedbackIssueTitle(base.body)).toBe("[Feedback] Quiz won't submit");
    expect(feedbackIssueTitle("x".repeat(200))).toHaveLength("[Feedback] ".length + 80);
    expect(feedbackIssueTitle("   ")).toBe("[Feedback] New submission");
  });

  it("feedbackIssueLabels maps type to the repo taxonomy", () => {
    expect(feedbackIssueLabels("bug")).toEqual(["type:bug", "status:triage"]);
    expect(feedbackIssueLabels("feature")).toEqual(["type:feature", "status:triage"]);
  });

  it("feedbackIssueBody is deterministic and includes context", () => {
    const md = feedbackIssueBody(base);
    expect(md).toContain("Quiz won't submit");
    expect(md).toContain("### Steps to reproduce");
    expect(md).toContain("1. open quiz 2. click finish");
    expect(md).toContain("- Route: `/notebook/abc/quiz`");
    expect(md).toContain("- Plan: `pro`");
    expect(md).toContain("_Filed from in-app feedback._");
  });

  it("does not leak an internal user id into the issue body", () => {
    expect(feedbackIssueBody({ ...base, userId: "user123" } as never)).not.toContain("user123");
  });

  it("feedbackIssueBody labels the detail section by type and handles missing detail", () => {
    const md = feedbackIssueBody({
      ...base,
      type: "feature",
      detail: undefined,
    });
    expect(md).toContain("### Why / what for");
    expect(md).toContain("_none provided_");
  });
});
