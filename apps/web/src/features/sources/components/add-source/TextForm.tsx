import type React from "react";
import { useId, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import { Spinner } from "@/shared/components/ui/spinner";
import { Textarea } from "@/shared/components/ui/textarea";
import { type StepFormProps, useReportBusy } from "./types";

interface TextFormProps extends StepFormProps {
  /** `title` is what the user typed; empty means one is written from the text. */
  onUpload: (text: string, title: string) => Promise<void>;
  isUploading: boolean;
}

export function TextForm({ onUpload, isUploading, onDone, onBusyChange }: TextFormProps) {
  const [value, setValue] = useState("");
  const [title, setTitle] = useState("");
  const id = useId();
  const titleId = useId();
  // Busy blocks closing, so report only this form's own submit: `isUploading` is shared with file
  // uploads started from the menu, which must not trap the user in this step.
  const [submitting, setSubmitting] = useState(false);
  const pending = isUploading || submitting;
  useReportBusy(submitting, onBusyChange);

  const submit = async () => {
    if (!value.trim() || pending) return;
    setSubmitting(true);
    try {
      await onUpload(value, title.trim());
      onDone();
    } catch {
      // useSourceUpload already toasted; keep the step open so the text is not lost.
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
          <FieldLabel htmlFor={titleId}>Title (optional)</FieldLabel>
          <Input
            id={titleId}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="e.g. Lecture 3 notes"
            disabled={pending}
          />
          <FieldDescription>Leave blank and a title is written from the text.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={id}>Text</FieldLabel>
          <Textarea
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Paste your text here..."
            disabled={pending}
            autoFocus
            className="h-48 resize-none"
          />
        </Field>
      </FieldGroup>
      <div className="flex justify-end">
        <Button type="submit" disabled={!value.trim() || pending}>
          {pending ? (
            <>
              <Spinner aria-hidden /> Adding...
            </>
          ) : (
            "Add Source"
          )}
        </Button>
      </div>
    </form>
  );
}
