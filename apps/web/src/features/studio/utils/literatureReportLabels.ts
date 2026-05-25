/** Sidebar/toolbar label for chat-generated literature report artifacts. */
export function literatureReportToolbarLabel(
  literatureReviewSessionId: string | undefined
): "Literature Report" | "Deep Research" {
  return literatureReviewSessionId ? "Literature Report" : "Deep Research";
}
