export const FEEDBACK_TYPES = ["bug", "feature"] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

const TITLE_PREFIX = "[Feedback] ";
const TITLE_MAX = 80;

export interface FeedbackRowLike {
  _id: string;
  _creationTime: number;
  type: FeedbackType;
  body: string;
  detail?: string;
  status: string;
  route: string;
  planTier: string;
  surface: string;
  appVersion: string;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  createdAt: number;
}

/** Fields safe to show a user about their own submission. */
export function toMyFeedbackRow(row: FeedbackRowLike) {
  return {
    id: row._id,
    type: row.type,
    body: row.body,
    status: row.status,
    createdAt: row.createdAt,
  };
}

/** Fields shown in the staff triage list. */
export function toAdminFeedbackRow(row: FeedbackRowLike) {
  return {
    id: row._id,
    type: row.type,
    body: row.body,
    detail: row.detail,
    status: row.status,
    route: row.route,
    planTier: row.planTier,
    surface: row.surface,
    appVersion: row.appVersion,
    githubIssueNumber: row.githubIssueNumber,
    githubIssueUrl: row.githubIssueUrl,
    createdAt: row.createdAt,
  };
}

export function feedbackIssueTitle(body: string): string {
  const firstLine = (body.split("\n")[0] ?? "").trim();
  if (!firstLine) return `${TITLE_PREFIX}New submission`;
  const clipped = firstLine.length > TITLE_MAX ? firstLine.slice(0, TITLE_MAX) : firstLine;
  return `${TITLE_PREFIX}${clipped}`;
}

export function feedbackIssueLabels(type: FeedbackType): string[] {
  return [type === "bug" ? "type:bug" : "type:feature", "status:triage"];
}

export function feedbackIssueBody(row: {
  type: FeedbackType;
  body: string;
  detail?: string;
  route: string;
  planTier: string;
  surface: string;
  appVersion: string;
  lastRequestId?: string;
  userId: string;
}): string {
  const detailLabel = row.type === "bug" ? "Steps to reproduce" : "Why / what for";
  return [
    row.body.trim(),
    "",
    `### ${detailLabel}`,
    row.detail?.trim() ? row.detail.trim() : "_none provided_",
    "",
    "### Context",
    `- Route: \`${row.route}\``,
    `- Plan: \`${row.planTier}\``,
    `- Surface: \`${row.surface}\``,
    `- App version: \`${row.appVersion}\``,
    `- Last requestId: \`${row.lastRequestId ?? "n/a"}\``,
    "",
    `_Filed from in-app feedback by user \`${row.userId}\`._`,
  ].join("\n");
}
