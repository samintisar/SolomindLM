import type { Id } from "@convex/_generated/dataModel";
import { AlertCircle, Search } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/shared/components/ui/card";
import { Field, FieldLabel } from "@/shared/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/shared/components/ui/input-group";
import { Spinner } from "@/shared/components/ui/spinner";
import { getServiceErrorMessage, parseServiceError } from "@/shared/utils/errorParser";
import { useResolveDoi, useUpload } from "../../services/documentsApi";
import { type StepFormProps, useReportBusy } from "./types";

interface ResolvedPaper {
  title: string;
  authors: string[];
  abstract?: string;
  doi?: string;
  venue?: string;
  publicationYear?: number;
  isOa?: boolean;
  sourceType?: string;
  pdfUrl?: string;
  landingPageUrl?: string;
}

interface DoiFormProps extends StepFormProps {
  notebookId: Id<"notebooks">;
}

export function DoiForm({ notebookId, onDone, onBusyChange }: DoiFormProps) {
  const [doi, setDoi] = useState("");
  const [isResolving, setIsResolving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<ResolvedPaper | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const resolveDoi = useResolveDoi();
  const upload = useUpload();
  useReportBusy(isResolving || isUploading, onBusyChange);

  const handleResolve = useCallback(async () => {
    if (!doi.trim()) return;
    setIsResolving(true);
    setError(null);
    setPreview(null);

    try {
      const result = await resolveDoi({ doi: doi.trim() });
      if (result) {
        setPreview(result);
      } else {
        setError("Could not resolve DOI. Please check the DOI and try again.");
      }
    } catch (err) {
      const parsed = parseServiceError(err);
      setError(parsed ? getServiceErrorMessage(parsed) : "Failed to resolve DOI. Try again.");
    } finally {
      setIsResolving(false);
    }
  }, [doi, resolveDoi]);

  const handleAddToNotebook = useCallback(async () => {
    if (!preview) return;
    setIsUploading(true);
    setError(null);

    try {
      const { title, ...paperRecordFields } = preview;
      await upload({
        notebookId,
        type: "paper_record",
        fileName: title || doi.trim(),
        paperRecord: paperRecordFields,
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add paper");
    } finally {
      setIsUploading(false);
    }
  }, [preview, doi, notebookId, upload, onDone]);

  const meta = [preview?.venue, preview?.publicationYear, preview?.doi && `DOI ${preview.doi}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <Field>
        <FieldLabel htmlFor={id}>DOI or arXiv ID</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={id}
            value={doi}
            onChange={(e) => {
              setDoi(e.target.value);
              // The preview belongs to the DOI that was resolved; a new DOI must be resolved again
              // before anything can be added.
              setPreview(null);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleResolve();
              }
            }}
            placeholder="e.g., 10.1038/s41586-020-2649-2 or 2005.11401"
            autoFocus
            disabled={isResolving || isUploading}
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              onClick={() => void handleResolve()}
              disabled={!doi.trim() || isResolving || isUploading}
            >
              {isResolving ? <Spinner aria-hidden /> : <Search />} Resolve
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {preview && (
        <Card>
          <CardHeader>
            <CardTitle>{preview.title || "Untitled Paper"}</CardTitle>
            {preview.authors.length > 0 && (
              <CardDescription>{preview.authors.join(", ")}</CardDescription>
            )}
          </CardHeader>
          {(preview.abstract || meta) && (
            <CardContent>
              <div className="flex flex-col gap-3">
                {preview.abstract && (
                  <p className="line-clamp-4 text-sm text-muted-foreground">{preview.abstract}</p>
                )}
                {meta && <p className="font-sans text-xs text-muted-foreground">{meta}</p>}
              </div>
            </CardContent>
          )}
        </Card>
      )}
      {preview && (
        <div className="flex justify-end">
          <Button onClick={() => void handleAddToNotebook()} disabled={isUploading}>
            {isUploading ? (
              <>
                <Spinner aria-hidden /> Adding...
              </>
            ) : (
              "Add to notebook"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
