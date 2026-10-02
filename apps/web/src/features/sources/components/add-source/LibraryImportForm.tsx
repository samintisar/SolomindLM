import type { Id } from "@convex/_generated/dataModel";
import { AlertCircle, BookOpen, Library } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/shared/components/ui/item";
import { Spinner } from "@/shared/components/ui/spinner";
import { splitNewPapers } from "../../lib/paperDedupe";
import {
  useBulkUpload,
  useGetExistingPapers,
  useParseBibliography,
} from "../../services/documentsApi";
import { PaperFileDrop } from "./PaperFileDrop";
import { type StepFormProps, useReportBusy } from "./types";

const LIBRARY = {
  zotero: { name: "Zotero", icon: BookOpen },
  mendeley: { name: "Mendeley", icon: Library },
} as const;

interface ParsedPaper {
  title: string;
  authors: string[];
  abstract?: string;
  doi?: string;
  venue?: string;
  publicationYear?: number;
  isOa?: boolean;
  sourceType?: string;
}

interface LibraryImportFormProps extends StepFormProps {
  notebookId: Id<"notebooks">;
  source: keyof typeof LIBRARY;
}

export function LibraryImportForm({
  notebookId,
  source,
  onDone,
  onBusyChange,
}: LibraryImportFormProps) {
  const { name, icon: Icon } = LIBRARY[source];
  const [fileName, setFileName] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [papers, setPapers] = useState<ParsedPaper[]>([]);
  const [hasParsed, setHasParsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseBibliography = useParseBibliography();
  const bulkUpload = useBulkUpload();
  const existing = useGetExistingPapers(notebookId);
  useReportBusy(isParsing || isImporting, onBusyChange);

  const { fresh, duplicates } = useMemo(
    () => splitNewPapers(papers, existing ?? undefined),
    [papers, existing]
  );

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);
      setPapers([]);
      setHasParsed(false);
      setFileName(file.name);

      setIsParsing(true);
      try {
        const text = await file.text();
        const result = await parseBibliography({ content: text, format: "auto" });
        setPapers(result.papers);
        setHasParsed(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse file");
      } finally {
        setIsParsing(false);
      }
    },
    [parseBibliography]
  );

  const handleImport = useCallback(async () => {
    if (fresh.length === 0) return;
    setIsImporting(true);
    setError(null);

    try {
      const papersWithTitle = fresh.map((p) => ({
        title: p.title || "Untitled",
        abstract: p.abstract || "",
        authors: p.authors || [],
        doi: p.doi,
        venue: p.venue,
        publicationYear: p.publicationYear,
        isOa: p.isOa ?? false,
        sourceType: source,
      }));

      await bulkUpload({ notebookId, papers: papersWithTitle });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import papers");
    } finally {
      setIsImporting(false);
    }
  }, [fresh, source, notebookId, bulkUpload, onDone]);

  // `existing` is undefined while the dedupe query loads; importing then would skip the dedupe.
  const checking = existing === undefined;
  const showResults = papers.length > 0 && !isParsing;
  const showEmpty = hasParsed && papers.length === 0 && !isParsing && !error;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Export your {name} library as BibTeX (.bib), then choose the file.
      </p>
      <PaperFileDrop
        accept=".bib"
        hint={`A .bib file exported from ${name}`}
        fileName={fileName}
        disabled={isParsing || isImporting}
        autoFocus
        onFile={(file) => void handleFile(file)}
      />

      {isParsing && (
        <p
          role="status"
          className="flex items-center gap-2 font-sans text-sm text-muted-foreground"
        >
          <Spinner aria-hidden /> Parsing bibliography...
        </p>
      )}

      {showResults && checking && (
        <p
          role="status"
          className="flex items-center gap-2 font-sans text-sm text-muted-foreground"
        >
          <Spinner aria-hidden /> Checking your notebook...
        </p>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showEmpty && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon />
            </EmptyMedia>
            <EmptyTitle>No papers found in this file</EmptyTitle>
            <EmptyDescription>
              Check that it is a BibTeX (.bib) export from {name}, then choose it again.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {showResults && !checking && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{papers.length} found</Badge>
          {duplicates.length > 0 && (
            <Badge variant="outline">{duplicates.length} already in notebook</Badge>
          )}
          <Badge variant="outline">{fresh.length} new</Badge>
        </div>
      )}

      {showResults && !checking && fresh.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon />
            </EmptyMedia>
            <EmptyTitle>Nothing new to import</EmptyTitle>
            <EmptyDescription>
              All papers from this file are already in your notebook.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {showResults && fresh.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="max-h-64 overflow-y-auto">
            <ItemGroup variant="grouped">
              {fresh.map((p, i) => (
                <Item key={i} size="sm" role="listitem">
                  <ItemMedia variant="icon">
                    <Icon />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>
                      <span className="line-clamp-2">{p.title || "Untitled"}</span>
                    </ItemTitle>
                    <ItemDescription>
                      {[p.authors?.slice(0, 3).join(", "), p.publicationYear]
                        .filter(Boolean)
                        .join(" · ")}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void handleImport()}
              disabled={isImporting || checking}
            >
              {isImporting ? (
                <>
                  <Spinner aria-hidden /> Importing...
                </>
              ) : (
                `Import ${fresh.length} paper${fresh.length === 1 ? "" : "s"}`
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
