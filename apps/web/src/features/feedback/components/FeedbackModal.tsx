import { Bug, Lightbulb, Paperclip, X } from "lucide-react";
import { type ChangeEvent, useState } from "react";
import { useLocation } from "react-router-dom";
import { useToast } from "@/shared/contexts/useToast";
import { useFeedback } from "../FeedbackContext";
import { captureFeedbackContext, type FeedbackType, validateFeedbackDraft } from "../feedbackTypes";
import { useSubmitFeedback, useUploadFeedbackScreenshot } from "../services/feedbackApi";

export function FeedbackModal() {
  const { isOpen, defaultType, close } = useFeedback();
  const [type, setType] = useState<FeedbackType>(defaultType);
  const [body, setBody] = useState("");
  const [detail, setDetail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submitFeedback = useSubmitFeedback();
  const uploadScreenshot = useUploadFeedbackScreenshot();
  const toast = useToast();
  const location = useLocation();

  // Re-sync the local type when the modal is (re)opened with a preset.
  if (isOpen && type !== defaultType && body === "" && detail === "" && !file && !error) {
    setType(defaultType);
  }
  if (!isOpen) return null;

  const reset = () => {
    setBody("");
    setDetail("");
    setFile(null);
    setError(null);
    setSubmitting(false);
  };
  const onClose = () => {
    reset();
    close();
  };

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > 5 * 1024 * 1024) {
      setError("Screenshot must be under 5 MB");
      return;
    }
    setFile(f);
  };

  const onSubmit = async () => {
    const check = validateFeedbackDraft({ body });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const screenshotId = file ? await uploadScreenshot(file) : undefined;
      await submitFeedback({
        type,
        body,
        detail: detail.trim() || undefined,
        screenshotId,
        ...captureFeedbackContext({ pathname: location.pathname, search: location.search }),
      });
      toast.success("Thanks — we got it.");
      onClose();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  };

  const isBug = type === "bug";
  const bodyLabel = isBug ? "What happened?" : "What do you want?";
  const detailLabel = isBug ? "Steps to reproduce (optional)" : "Why / what for? (optional)";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Send feedback"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">Send feedback</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setType("bug")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                isBug
                  ? "border-destructive/40 bg-destructive/10 text-destructive"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Bug className="h-4 w-4" /> Bug
            </button>
            <button
              type="button"
              onClick={() => setType("feature")}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                !isBug
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Lightbulb className="h-4 w-4" /> Idea
            </button>
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{bodyLabel}</span>
            <textarea
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                if (error) setError(null);
              }}
              rows={4}
              className="w-full rounded-md border border-border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{detailLabel}</span>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-border bg-background p-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2 rounded-md bg-secondary px-3 py-2 text-xs text-muted-foreground">
            <Paperclip className="h-4 w-4" />
            {file ? file.name : "Attach screenshot (optional)"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={onFile}
              className="hidden"
            />
          </label>

          <p className="rounded-md bg-secondary/60 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
            We automatically attach the current page, your plan, and app version to help us debug.
          </p>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={submitting}
              className="flex-1 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
