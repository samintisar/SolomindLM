import { useNavigate } from "react-router-dom";
import { useFeedback } from "../FeedbackContext";
import { useMyFeedback } from "../services/feedbackApi";

const STATUS_LABEL: Record<string, string> = {
  received: "Received",
  planned: "Planned",
  shipped: "Shipped",
  closed: "Closed",
};

type MyFeedbackRow = {
  id: string;
  type: "bug" | "feature";
  body: string;
  status: string;
  createdAt: number;
};

export function MyFeedbackPage() {
  const rows = useMyFeedback();
  const navigate = useNavigate();
  const { open } = useFeedback();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 overflow-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-display font-bold">My feedback</h1>
        <button
          type="button"
          onClick={() => open("bug")}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-secondary"
        >
          Send feedback
        </button>
      </div>

      {rows === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">You haven't sent any feedback yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {(rows as MyFeedbackRow[]).map((r) => (
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
              <span className="flex-1 truncate">{r.body.split("\n")[0]}</span>
              <span className="text-xs text-muted-foreground">
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => navigate("/home")}
        className="mt-4 text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to home
      </button>
    </main>
  );
}
