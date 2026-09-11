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

/**
 * Wrap user-supplied free text in a code fence so GitHub renders it verbatim —
 * no `@mention` notifications, no `#123` cross-links, no injected headings. The
 * fence is made longer than any backtick run inside the text.
 */
function fenceUserText(text: string): string {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  const fence = "`".repeat(Math.max(3, longestRun + 1));
  return `${fence}\n${text}\n${fence}`;
}

/**
 * Wrap a single value in a backtick-delimited inline code span, sized so the
 * value's own backtick runs can't prematurely close it (same idea as
 * `fenceUserText`, for the single-line "- Label: `value`" context lines).
 * Content that starts/ends with a backtick or space gets a padding space per
 * CommonMark's code-span rule. Every context field interpolated into the
 * issue body — not just `body`/`detail` — is client-controlled, so this must
 * run on all of them or a crafted value (e.g. a backtick-and-`@mention`
 * pair in `appVersion`) can break out of code and trigger a live @mention,
 * #-reference, or link in the issue.
 */
function inlineCode(text: string): string {
  const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
  const fence = "`".repeat(Math.max(1, longestRun + 1));
  const needsPad = /^[` ]|[` ]$/.test(text);
  return `${fence}${needsPad ? ` ${text} ` : text}${fence}`;
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
}): string {
  const detailLabel = row.type === "bug" ? "Steps to reproduce" : "Why / what for";
  return [
    fenceUserText(row.body.trim()),
    "",
    `### ${detailLabel}`,
    row.detail?.trim() ? fenceUserText(row.detail.trim()) : "_none provided_",
    "",
    "### Context",
    `- Route: ${inlineCode(row.route)}`,
    `- Plan: ${inlineCode(row.planTier)}`,
    `- Surface: ${inlineCode(row.surface)}`,
    `- App version: ${inlineCode(row.appVersion)}`,
    `- Last requestId: ${inlineCode(row.lastRequestId ?? "n/a")}`,
    "",
    "_Filed from in-app feedback._",
  ].join("\n");
}
