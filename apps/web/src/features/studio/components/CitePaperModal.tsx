import { createCitationEngine } from "@convex/_utils/CitationEngine";
import { Copy } from "lucide-react";
import type React from "react";
import { useId, useMemo, useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Field, FieldGroup, FieldLabel, FieldTitle } from "@/shared/components/ui/field";
import { useToast } from "@/shared/contexts/useToast";
import type { RankedPaper } from "../types/rankedPaper";
import { rankedPaperToCitation } from "../utils/rankedPaperMappers";
import { type CitationStyle, CitationStylePicker } from "./CitationStylePicker";

interface CitePaperModalProps {
  paper: RankedPaper;
  paperIndex: number;
  isOpen: boolean;
  onClose: () => void;
}

export const CitePaperModal: React.FC<CitePaperModalProps> = ({
  paper,
  paperIndex,
  isOpen,
  onClose,
}) => {
  const [style, setStyle] = useState<CitationStyle>("apa7");
  const { success: toastSuccess, error: toastError } = useToast();
  const styleId = useId();

  const engine = useMemo(() => createCitationEngine(), []);
  const citation = useMemo(
    () => rankedPaperToCitation(paper, `paper_${paperIndex}`),
    [paper, paperIndex]
  );

  const fullCitation = useMemo(() => {
    try {
      return engine.formatReference(citation, style);
    } catch {
      return engine.formatReference(citation, "apa7");
    }
  }, [citation, engine, style]);

  const inlineCitation = useMemo(() => {
    try {
      const needsIndex = ["ieee", "vancouver", "ama11", "ama10", "acs", "chicago17_notes"].includes(
        style
      );
      return engine.formatInline(citation, style, needsIndex ? 0 : undefined);
    } catch {
      return engine.formatInline(citation, "apa7");
    }
  }, [citation, engine, style]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess(`${label} copied`);
    } catch {
      toastError("Couldn't copy to the clipboard");
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-svh overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cite Paper</DialogTitle>
          <DialogDescription>
            Copy a reference or an in-text citation in the style you need.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={styleId}>Citation style</FieldLabel>
            <CitationStylePicker id={styleId} value={style} onChange={setStyle} />
          </Field>
          <CitationOutput
            label="Full citation"
            text={fullCitation}
            copyLabel="Copy Citation"
            onCopy={() => void copy(fullCitation, "Citation")}
          />
          <CitationOutput
            label="In-text citation"
            text={inlineCitation}
            copyLabel="Copy In-Text"
            onCopy={() => void copy(inlineCitation, "In-text citation")}
          />
        </FieldGroup>
      </DialogContent>
    </Dialog>
  );
};

function CitationOutput({
  label,
  text,
  copyLabel,
  onCopy,
}: {
  label: string;
  text: string;
  copyLabel: string;
  onCopy: () => void;
}) {
  return (
    <Field>
      <FieldTitle>{label}</FieldTitle>
      <p className="rounded-lg bg-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground">
        {text}
      </p>
      {/* The wrapper takes Field's full-width child rule, so the button keeps its own width. */}
      <div>
        <Button variant="ghost" size="sm" onClick={onCopy}>
          <Copy data-icon="inline-start" />
          {copyLabel}
        </Button>
      </div>
    </Field>
  );
}
