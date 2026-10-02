import type { Id } from "@convex/_generated/dataModel";
import { AlertCircle } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import { Input } from "@/shared/components/ui/input";
import { Spinner } from "@/shared/components/ui/spinner";
import { Textarea } from "@/shared/components/ui/textarea";
import { useUpload } from "../../services/documentsApi";
import { type StepFormProps, useReportBusy } from "./types";

interface ManualPaperFormProps extends StepFormProps {
  notebookId: Id<"notebooks">;
}

export function ManualPaperForm({ notebookId, onDone, onBusyChange }: ManualPaperFormProps) {
  const [title, setTitle] = useState("");
  const [authors, setAuthors] = useState("");
  const [abstract, setAbstract] = useState("");
  const [doi, setDoi] = useState("");
  const [venue, setVenue] = useState("");
  const [year, setYear] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const baseId = useId();

  const upload = useUpload();
  useReportBusy(isUploading, onBusyChange);

  const isValid = Boolean(title.trim() && authors.trim());

  const handleSubmit = useCallback(async () => {
    if (!isValid) return;
    setIsUploading(true);
    setError(null);

    try {
      const authorList = authors
        .split(",")
        .map((a) => a.trim())
        .filter(Boolean);
      const publicationYear = year.trim() ? parseInt(year.trim(), 10) : undefined;

      await upload({
        notebookId,
        type: "paper_record",
        fileName: title.trim(),
        paperRecord: {
          abstract: abstract.trim(),
          authors: authorList,
          doi: doi.trim() || undefined,
          venue: venue.trim() || undefined,
          publicationYear:
            publicationYear && !Number.isNaN(publicationYear) ? publicationYear : undefined,
          isOa: false,
          pdfUrl: pdfUrl.trim() || undefined,
          sourceType: "manual",
        },
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add paper");
    } finally {
      setIsUploading(false);
    }
  }, [isValid, title, authors, abstract, doi, venue, year, pdfUrl, notebookId, upload, onDone]);

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        void handleSubmit();
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${baseId}-title`}>
            Title{" "}
            <span aria-hidden className="text-destructive">
              *
            </span>
          </FieldLabel>
          <Input
            id={`${baseId}-title`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Paper title"
            aria-required="true"
            autoFocus
            disabled={isUploading}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${baseId}-authors`}>
            Authors{" "}
            <span aria-hidden className="text-destructive">
              *
            </span>
          </FieldLabel>
          <Input
            id={`${baseId}-authors`}
            value={authors}
            onChange={(e) => setAuthors(e.target.value)}
            placeholder="Author names, comma-separated"
            aria-required="true"
            disabled={isUploading}
          />
          <FieldDescription>Separate authors with commas</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${baseId}-abstract`}>Abstract</FieldLabel>
          <Textarea
            id={`${baseId}-abstract`}
            rows={4}
            value={abstract}
            onChange={(e) => setAbstract(e.target.value)}
            placeholder="Paper abstract"
            disabled={isUploading}
          />
        </Field>
        <div className="grid gap-x-4 gap-y-7 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`${baseId}-doi`}>DOI</FieldLabel>
            <Input
              id={`${baseId}-doi`}
              value={doi}
              onChange={(e) => setDoi(e.target.value)}
              placeholder="e.g., 10.1038/s41586-020-2649-2"
              disabled={isUploading}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${baseId}-venue`}>Venue</FieldLabel>
            <Input
              id={`${baseId}-venue`}
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              placeholder="Journal or conference"
              disabled={isUploading}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${baseId}-year`}>Year</FieldLabel>
            <Input
              id={`${baseId}-year`}
              inputMode="numeric"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              placeholder="Publication year"
              disabled={isUploading}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`${baseId}-pdf`}>PDF URL</FieldLabel>
            <Input
              id={`${baseId}-pdf`}
              type="url"
              value={pdfUrl}
              onChange={(e) => setPdfUrl(e.target.value)}
              placeholder="https://..."
              disabled={isUploading}
            />
          </Field>
        </div>
      </FieldGroup>
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex justify-end">
        <Button type="submit" disabled={!isValid || isUploading}>
          {isUploading ? (
            <>
              <Spinner aria-hidden /> Adding...
            </>
          ) : (
            "Add Paper"
          )}
        </Button>
      </div>
    </form>
  );
}
