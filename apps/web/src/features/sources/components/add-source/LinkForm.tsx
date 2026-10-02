import type React from "react";
import { useId, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Spinner } from "@/shared/components/ui/spinner";
import { Textarea } from "@/shared/components/ui/textarea";
import { useToast } from "@/shared/contexts/useToast";
import { type StepFormProps, useReportBusy } from "./types";

const COPY = {
  website: {
    label: "Website URLs",
    // The hint below the field says how to separate URLs, so the placeholder stays an example.
    placeholder: "https://example.com\nhttps://another-example.com",
    hint: "Separate multiple URLs with spaces or new lines.",
  },
  video: {
    label: "Video URLs",
    placeholder: "Paste URL from YouTube, TikTok, Instagram, or X...",
    hint: "Transcripts are extracted from YouTube, TikTok, Instagram and X. Separate multiple URLs with spaces or new lines.",
  },
} as const;

interface LinkFormProps extends StepFormProps {
  kind: keyof typeof COPY;
  onUpload: (urls: string[]) => Promise<void>;
  isUploading: boolean;
}

export function LinkForm({ kind, onUpload, isUploading, onDone, onBusyChange }: LinkFormProps) {
  const { error: showError } = useToast();
  const [value, setValue] = useState("");
  const id = useId();
  const copy = COPY[kind];
  // Busy blocks closing, so report only this form's own submit: `isUploading` is shared with file
  // uploads started from the menu, which must not trap the user in this step.
  const [submitting, setSubmitting] = useState(false);
  const pending = isUploading || submitting;
  useReportBusy(submitting, onBusyChange);

  const submit = async () => {
    if (!value.trim() || pending) return;
    const urls = value
      .split(/\s+/)
      .map((url) => url.trim())
      .filter((url) => url.startsWith("http://") || url.startsWith("https://"));
    if (urls.length === 0) {
      showError("Please enter at least one valid URL (starting with http:// or https://).");
      return;
    }
    setSubmitting(true);
    try {
      await onUpload(urls);
      onDone();
    } catch {
      // useSourceUpload already toasted; keep the step open so the user can fix the input.
    } finally {
      setSubmitting(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  };

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={id}>{copy.label}</FieldLabel>
          <Textarea
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={copy.placeholder}
            disabled={pending}
            autoFocus
            className="h-32 resize-none"
          />
          <FieldDescription>{copy.hint}</FieldDescription>
        </Field>
      </FieldGroup>
      <div className="flex justify-end">
        <Button type="submit" disabled={!value.trim() || pending}>
          {pending ? (
            <>
              <Spinner aria-hidden /> Adding...
            </>
          ) : (
            "Add Sources"
          )}
        </Button>
      </div>
    </form>
  );
}
