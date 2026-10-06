import { Bookmark } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/shared/components/ui/field";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/utils/cn";
import type { StudioTool } from "../../services/promptsApi";
import { SaveAsPromptModal } from "../SaveAsPromptModal";
import { useStudioCustomizePreview } from "./dialogContext";

interface PromptFieldProps {
  label: string;
  description?: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** The prompt library that "Save as reusable prompt" saves into. */
  studioTool: StudioTool;
  /** A taller box, for long instructions (Report, Spreadsheet). */
  tall?: boolean;
  /**
   * Focus the box when it mounts: for a step that replaces the control the user just used (the
   * Report/Spreadsheet prompt step), so focus doesn't fall back to the dialog.
   */
  autoFocus?: boolean;
  /** Ids of more text that describes the box (the chosen format's title), after `description`. */
  describedBy?: string;
}

/** A Customize dialog's free-text prompt, with "Save as reusable prompt" under it (not in previews). */
export function PromptField({
  label,
  description,
  placeholder,
  value,
  onChange,
  studioTool,
  tall = false,
  autoFocus = false,
  describedBy,
}: PromptFieldProps) {
  const id = useId();
  const descriptionId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // A layout effect, so focus lands before Radix's focus scope sees the removed control and
  // moves focus to the dialog.
  useLayoutEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);
  const ariaDescribedBy =
    [description ? descriptionId : undefined, describedBy].filter(Boolean).join(" ") || undefined;
  const [saveOpen, setSaveOpen] = useState(false);
  const preview = useStudioCustomizePreview();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {description && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
      <Textarea
        ref={textareaRef}
        id={id}
        aria-describedby={ariaDescribedBy}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn("resize-none", tall ? "h-56" : "h-36")}
      />
      {/* The wrapper takes Field's full-width child rule, so the button keeps its own width. */}
      {!preview && (
        <div>
          <SaveAsPromptModal
            isOpen={saveOpen}
            onOpen={() => setSaveOpen(true)}
            onClose={() => setSaveOpen(false)}
            studioTool={studioTool}
            initialPromptText={value}
            trigger={
              <Button variant="ghost" size="sm" disabled={!value.trim()}>
                <Bookmark data-icon="inline-start" />
                Save as reusable prompt
              </Button>
            }
          />
        </div>
      )}
    </Field>
  );
}
