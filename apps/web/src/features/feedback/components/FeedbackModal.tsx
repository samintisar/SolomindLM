import { Bug, Lightbulb, Loader2 } from "lucide-react";
import { useState } from "react";
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
import { useSubmitFeedback } from "../services/feedbackApi";

export function FeedbackModal() {
  const { isOpen, defaultType, close } = useFeedback();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        {/* Radix doesn't render DialogContent's children while closed, so this
            remounts on every open — the form always starts from defaultType
            with cleared fields. */}
        <FeedbackForm defaultType={defaultType} onDone={close} />
      </DialogContent>
    </Dialog>
  );
}

function FeedbackForm({ defaultType, onDone }: { defaultType: FeedbackType; onDone: () => void }) {
  const [type, setType] = useState<FeedbackType>(defaultType);
  const [body, setBody] = useState("");
  const [detail, setDetail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submitFeedback = useSubmitFeedback();
  const toast = useToast();
  const location = useLocation();

  const isBug = type === "bug";

  const onSubmit = async () => {
    const check = validateFeedbackDraft({ body, detail });
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitFeedback({
        type,
        body,
        detail: detail.trim() || undefined,
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
            onChange={(e) => {
              setDetail(e.target.value);
              if (error) setError(null);
            }}
            rows={3}
          />
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
