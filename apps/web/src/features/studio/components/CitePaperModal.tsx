import React, { useMemo, useState } from "react";
import { X, Copy, Quote } from "lucide-react";
import { createCitationEngine } from "@convex/_utils/CitationEngine";
import { CitationStylePicker, type CitationStyle } from "./CitationStylePicker";
import type { RankedPaper } from "../types/rankedPaper";
import { rankedPaperToCitation } from "../utils/rankedPaperMappers";
import { useToast } from "@/shared/contexts/useToast";

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
  const { success: toastSuccess } = useToast();

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
      // ignore
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <Dialog onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <Quote className="h-5 w-5 text-primary" />
            <h2 id="cite-paper-title" className="text-lg font-semibold text-foreground">
              Cite Paper
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto flex-1 min-h-0">
          <Field label="Citation style">
            <CitationStylePicker value={style} onChange={setStyle} />
          </Field>

          <Field label="Full citation">
            <CitationBox text={fullCitation} />
            <CopyButton label="Copy Citation" onClick={() => void copy(fullCitation, "Citation")} />
          </Field>

          <Field label="In-text citation">
            <CitationBox text={inlineCitation} />
            <CopyButton
              label="Copy In-Text"
              onClick={() => void copy(inlineCitation, "In-text citation")}
            />
          </Field>
        </div>
      </Dialog>
    </div>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function CitationBox({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm leading-relaxed text-foreground">
      {text}
    </div>
  );
}

function CopyButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
    >
      <Copy className="h-4 w-4" />
      {label}
    </button>
  );
}

function Dialog({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
      onClick={onClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cite-paper-title"
    >
      {children}
    </div>
  );
}
