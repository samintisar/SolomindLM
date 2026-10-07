import {
  countWords,
  FREE_FLASHCARD_MAX_PDF_PAGES,
  FREE_FLASHCARD_MAX_WORDS,
  FREE_FLASHCARD_MIN_WORDS,
} from "@convex/_lib/freeToolBounds";
import { FileText, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Spinner } from "@/shared/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Textarea } from "@/shared/components/ui/textarea";
import { extractPdfText } from "../lib/extractPdfText";

export type SourceState = { text: string; label: string };

type Tab = "pdf" | "paste";

type PdfStatus =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "ready"; source: SourceState; note?: string }
  | { kind: "error"; message: string };

const PASTED_LABEL = "Pasted notes";

function pastedSource(value: string): SourceState | null {
  return countWords(value) >= FREE_FLASHCARD_MIN_WORDS
    ? { text: value, label: PASTED_LABEL }
    : null;
}

/** PDF upload (text read in the browser) or pasted notes; reports the active tab's usable source. */
export function SourceInput({ onChange }: { onChange: (source: SourceState | null) => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [pasted, setPasted] = useState("");
  const [pdfStatus, setPdfStatus] = useState<PdfStatus>({ kind: "idle" });
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave also fire for the button's children; count to know when the file truly left.
  const dragDepth = useRef(0);

  const readPdf = async (file: File) => {
    setPdfStatus({ kind: "reading" });
    onChange(null);
    try {
      const { text, pagesRead, totalPages } = await extractPdfText(file);
      if (countWords(text) < FREE_FLASHCARD_MIN_WORDS) {
        setPdfStatus({
          kind: "error",
          message:
            "We couldn't find enough text in this PDF. It may be scanned. Paste the text instead, or sign up free to use OCR.",
        });
        return;
      }
      const source = { text, label: file.name };
      const note =
        totalPages > pagesRead ? `Read the first ${pagesRead} of ${totalPages} pages.` : undefined;
      setPdfStatus({ kind: "ready", source, note });
      onChange(source);
    } catch {
      setPdfStatus({ kind: "error", message: "That file couldn't be opened as a PDF." });
    }
  };

  const updatePasted = (value: string) => {
    setPasted(value);
    onChange(pastedSource(value));
  };

  // Switching tabs hands back the source the newly shown tab already holds.
  const switchTab = (tab: string) => {
    if ((tab as Tab) === "pdf") onChange(pdfStatus.kind === "ready" ? pdfStatus.source : null);
    else onChange(pastedSource(pasted));
  };

  const pastedWords = countWords(pasted);

  return (
    <Tabs defaultValue="pdf" className="w-full" onValueChange={switchTab}>
      <TabsList>
        <TabsTrigger value="pdf">Upload PDF</TabsTrigger>
        <TabsTrigger value="paste">Paste notes</TabsTrigger>
      </TabsList>

      <TabsContent value="pdf" className="mt-4">
        <div className="space-y-3">
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            tabIndex={-1}
            aria-label="Choose a PDF"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Clear so choosing the same file again still fires a change.
              event.target.value = "";
              if (file) void readPdf(file);
            }}
          />
          <Button
            type="button"
            variant="dropzone"
            size="lg"
            className="h-32 w-full flex-col"
            data-dragging={dragging}
            onClick={() => fileInput.current?.click()}
            onDragEnter={(event) => {
              event.preventDefault();
              dragDepth.current += 1;
              setDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => {
              dragDepth.current = Math.max(0, dragDepth.current - 1);
              if (dragDepth.current === 0) setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void readPdf(file);
            }}
          >
            {pdfStatus.kind === "reading" ? (
              <Spinner />
            ) : pdfStatus.kind === "ready" ? (
              <FileText />
            ) : (
              <Upload />
            )}
            <span>
              {dragging
                ? "Drop your PDF to read it"
                : pdfStatus.kind === "ready"
                  ? pdfStatus.source.label
                  : pdfStatus.kind === "reading"
                    ? "Reading your PDF…"
                    : "Drop a PDF here or click to choose"}
            </span>
            <span className="text-xs font-normal text-muted-foreground">
              Text PDFs up to {FREE_FLASHCARD_MAX_PDF_PAGES} pages · stays in your browser
            </span>
          </Button>
          {pdfStatus.kind === "ready" && pdfStatus.note ? (
            <p className="text-sm text-muted-foreground">{pdfStatus.note}</p>
          ) : null}
          {pdfStatus.kind === "error" ? (
            <Alert variant="warning">
              <AlertDescription>{pdfStatus.message}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </TabsContent>

      <TabsContent value="paste" className="mt-4">
        <div className="space-y-2">
          <Textarea
            value={pasted}
            onChange={(event) => updatePasted(event.target.value)}
            placeholder="Paste lecture notes, a chapter or an article…"
            className="min-h-48"
            aria-label="Notes to turn into flashcards"
          />
          <p className="text-sm text-muted-foreground">
            {pastedWords.toLocaleString()} words
            {pastedWords > 0 && pastedWords < FREE_FLASHCARD_MIN_WORDS
              ? ` · add at least ${FREE_FLASHCARD_MIN_WORDS - pastedWords} more`
              : pastedWords > FREE_FLASHCARD_MAX_WORDS
                ? ` · the first ${FREE_FLASHCARD_MAX_WORDS.toLocaleString()} words will be used`
                : ""}
          </p>
        </div>
      </TabsContent>
    </Tabs>
  );
}
