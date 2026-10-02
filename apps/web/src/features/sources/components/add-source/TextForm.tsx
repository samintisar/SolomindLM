import type React from "react";
import { useId, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Spinner } from "@/shared/components/ui/spinner";
import { Textarea } from "@/shared/components/ui/textarea";
import { type StepFormProps, useReportBusy } from "./types";

interface TextFormProps extends StepFormProps {
  onUpload: (text: string) => Promise<void>;
  isUploading: boolean;
}

export function TextForm({ onUpload, isUploading, onDone, onBusyChange }: TextFormProps) {
  const [value, setValue] = useState("");
  const id = useId();
  useReportBusy(isUploading, onBusyChange);

  const submit = async () => {
    if (!value.trim() || isUploading) return;
    try {
      await onUpload(value);
      onDone();
    } catch {
      // useSourceUpload already toasted; keep the step open so the text is not lost.
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
          <FieldLabel htmlFor={id}>Text</FieldLabel>
          <Textarea
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Paste your text here..."
            disabled={isUploading}
            autoFocus
            className="h-48 resize-none"
          />
        </Field>
      </FieldGroup>
      <div className="flex justify-end">
        <Button type="submit" disabled={!value.trim() || isUploading}>
          {isUploading ? (
            <>
              <Spinner /> Adding...
            </>
          ) : (
            "Add Source"
          )}
        </Button>
      </div>
    </form>
  );
}
