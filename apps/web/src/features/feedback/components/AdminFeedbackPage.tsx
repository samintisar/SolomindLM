import type { toAdminFeedbackRow } from "@convex/_model/feedback";
import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useToast } from "@/shared/contexts/useToast";
import { useAllFeedback, useCreateGithubIssue, useIsFeedbackAdmin } from "../services/feedbackApi";

/** Kept in lockstep with the server shaper so the row shape can't drift. */
type AdminFeedbackRow = ReturnType<typeof toAdminFeedbackRow>;

export function AdminFeedbackPage() {
  const isAdmin = useIsFeedbackAdmin(); // boolean | undefined (undefined while loading)
  // Only subscribe once we know the caller is an admin — listAll throws for
  // everyone else, and useQuery would re-throw that during render before the
  // redirect below can run.
  const rows = useAllFeedback(isAdmin === true);
  const createIssue = useCreateGithubIssue();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (isAdmin === undefined) {
    return <main className="p-6 text-sm text-muted-foreground">Loading…</main>;
  }
  if (!isAdmin) return <Navigate to="/home" replace />;

  const onCreateIssue = async (id: string) => {
    setBusyId(id);
    try {
      const { url } = await createIssue(id);
      toast.success("GitHub issue created", {
        action: { label: "Open", onClick: () => window.open(url, "_blank") },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create issue");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 overflow-auto p-6">
      <h1 className="mb-4 text-xl font-display font-bold">Feedback triage</h1>
      {rows === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No feedback yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {(rows as AdminFeedbackRow[]).map((r) => (
            <li key={r.id} className="flex items-center gap-3 p-3 text-sm">
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                  r.type === "bug"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary"
                }`}
              >
                {r.type === "bug" ? "bug" : "idea"}
              </span>
              <span className="flex-1 truncate" title={r.body}>
                {r.body.split("\n")[0]}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {r.planTier} · {r.surface}
              </span>
              {r.githubIssueNumber ? (
                <a
                  href={r.githubIssueUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs text-primary hover:underline"
                >
                  #{r.githubIssueNumber}
                </a>
              ) : (
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => onCreateIssue(r.id)}
                  className="shrink-0 rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary disabled:opacity-60"
                >
                  {busyId === r.id ? "Creating…" : "Open GitHub issue"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
