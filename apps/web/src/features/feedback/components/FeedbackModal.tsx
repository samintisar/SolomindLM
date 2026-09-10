import { Bug, Lightbulb, Loader2, Paperclip, X } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Textarea } from "@/shared/components/ui/textarea";
import { useToast } from "@/shared/contexts/useToast";
import { useFeedback } from "../FeedbackContext";
import { captureFeedbackContext, type FeedbackType, validateFeedbackDraft } from "../feedbackTypes";
import { useSubmitFeedback, useUploadFeedbackScreenshot } from "../services/feedbackApi";

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export function FeedbackModal() {
  const { isOpen, defaultType, close } = useFeedback();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        {/* Remounts on every open, so the form always starts from defaultType with cleared fields. */}
        {isOpen && <FeedbackForm defaultType={defaultType} onDone={close} />}
      </DialogContent>
    </Dialog>
  );
}

function FeedbackForm({ defaultType, onDone }: { defaultType: FeedbackType; onDone: () => void }) {
  const [type, setType] = useState<FeedbackType>(defaultType);
  const [body, setBody] = useState("");
  const [detail, setDetail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const submitFeedback = useSubmitFeedback();
  const uploadScreenshot = useUploadFeedbackScreenshot();
  const toast = useToast();
  const location = useLocation();

  const isBug = type === "bug";

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_SCREENSHOT_BYTES) {
      setError("Screenshot must be under 5 MB");
      return;
    }
    setError(null);
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
      onDone();
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-display font-bold">Send feedback</DialogTitle>
        <DialogDescription>Tell us what's broken or what you'd like to see.</DialogDescription>
      </DialogHeader>

      <Tabs value={type} onValueChange={(v) => setType(v as FeedbackType)}>
        <TabsList className="w-full">
          <TabsTrigger value="bug" className="flex-1">
            <Bug className="size-4" />
            Bug
          </TabsTrigger>
          <TabsTrigger value="feature" className="flex-1">
            <Lightbulb className="size-4" />
            Idea
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="feedback-body">{isBug ? "What happened?" : "What do you want?"}</Label>
          <Textarea
            id="feedback-body"
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              if (error) setError(null);
            }}
            rows={4}
            autoFocus
            placeholder={
              isBug
                ? "Written questions won't submit — clicking Finish just spins."
                : "Let me export flashcards to Anki."
            }
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="feedback-detail" className="text-muted-foreground">
            {isBug ? "Steps to reproduce" : "Why / what for?"}
            <span className="font-normal">(optional)</span>
          </Label>
          <Textarea
            id="feedback-detail"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={3}
          />
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onFile}
            className="hidden"
          />
          {file ? (
            <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
              <Paperclip className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Remove screenshot"
              >
                <X className="size-4" />
              </button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start font-normal text-muted-foreground"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="size-4" />
              Attach screenshot (optional)
            </Button>
          )}
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          We automatically attach the current page, your plan, and app version to help us debug.
        </p>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={submitting}>
          Cancel
        </Button>
        <Button type="button" onClick={onSubmit} disabled={submitting}>
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {submitting ? "Sending…" : "Send"}
        </Button>
      </DialogFooter>
    </>
  );
}
