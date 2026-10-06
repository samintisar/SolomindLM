import { Bookmark } from "lucide-react";
import { useId, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/shared/components/ui/field";
import { Textarea } from "@/shared/components/ui/textarea";
import { cn } from "@/shared/utils/cn";
import type { StudioTool } from "../../services/promptsApi";
import { SaveAsPromptModal } from "../SaveAsPromptModal";
import { useStudioCustomizePreview } from "./StudioCustomizeDialog";

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
}: PromptFieldProps) {
  const id = useId();
  const descriptionId = useId();
  const [saveOpen, setSaveOpen] = useState(false);
  const preview = useStudioCustomizePreview();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {description && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
      <Textarea
        id={id}
        aria-describedby={description ? descriptionId : undefined}
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
