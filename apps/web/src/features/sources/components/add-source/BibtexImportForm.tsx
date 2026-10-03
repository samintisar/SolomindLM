import type { Id } from "@convex/_generated/dataModel";
import { AlertCircle, Library } from "lucide-react";
import { useCallback, useId, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/shared/components/ui/empty";
import { Field, FieldLabel } from "@/shared/components/ui/field";
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/shared/components/ui/item";
import { Spinner } from "@/shared/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Textarea } from "@/shared/components/ui/textarea";
import { splitNewPapers } from "../../lib/paperDedupe";
import {
  useBulkUpload,
  useGetExistingPapers,
  useParseBibliography,
} from "../../services/documentsApi";
import { PaperFileDrop } from "./PaperFileDrop";
import { type StepFormProps, useReportBusy } from "./types";

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

interface ParseStats {
  total: number;
  withDoi: number;
  withoutDoi: number;
  malformed: number;
}

interface BibtexImportFormProps extends StepFormProps {
  notebookId: Id<"notebooks">;
}

const detectFormat = (content: string): "auto" | "ris" =>
  content.trim().startsWith("TY  -") ? "ris" : "auto";

export function BibtexImportForm({ notebookId, onDone, onBusyChange }: BibtexImportFormProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [pasteContent, setPasteContent] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [papers, setPapers] = useState<ParsedPaper[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [stats, setStats] = useState<ParseStats | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const baseId = useId();

  const parseBibliography = useParseBibliography();
  const bulkUpload = useBulkUpload();
  const existing = useGetExistingPapers(notebookId);
  useReportBusy(isParsing || isImporting, onBusyChange);

  const handleParse = useCallback(
    async (content: string) => {
      if (!content.trim()) return;
      setIsParsing(true);
      setError(null);
      setPapers([]);
      setSelected(new Set());
      setStats(null);
      setWarnings([]);

      try {
        const result = await parseBibliography({ content, format: detectFormat(content) });
        setPapers(result.papers);
        setStats(result.stats);
        setWarnings(result.warnings || []);
        setSelected(new Set(result.papers.map((_paper: ParsedPaper, i: number) => i)));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse bibliography");
      } finally {
        setIsParsing(false);
      }
    },
    [parseBibliography]
  );

  const handleFile = useCallback(
    async (file: File) => {
      // Drop the previous file's results first: a failed read (or an empty file, which
      // handleParse skips) must not leave the old papers importable under the new file's error.
      setFileName(null);
      setPapers([]);
      setSelected(new Set());
      setStats(null);
      setWarnings([]);
      setError(null);
      try {
        const text = await file.text();
        setFileName(file.name);
        void handleParse(text);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to read file");
      }
    },
    [handleParse]
  );

  // `existing` is undefined while the dedupe query loads; importing then could add duplicates.
  const checking = existing === undefined;
  // Indices into `papers` of entries already in the notebook: shown, but never selectable.
  const duplicates = useMemo(() => {
    const indexed = papers.map((p, index) => ({ ...p, index }));
    return new Set(splitNewPapers(indexed, existing ?? undefined).duplicates.map((p) => p.index));
  }, [papers, existing]);
  const freshIndices = useMemo(
    () => papers.map((_, i) => i).filter((i) => !duplicates.has(i)),
    [papers, duplicates]
  );
  const chosenIndices = freshIndices.filter((i) => selected.has(i));

  const handleImport = useCallback(async () => {
    if (chosenIndices.length === 0 || checking) return;
    setIsImporting(true);
    setError(null);

    try {
      // Indices follow the parsed list, so papers import in their parsed order.
      const papersWithTitle = chosenIndices.map((i) => {
        const p = papers[i];
        return {
          title: p.title || "Untitled",
          abstract: p.abstract || "",
          authors: p.authors || [],
          doi: p.doi,
          venue: p.venue,
          publicationYear: p.publicationYear,
          isOa: p.isOa ?? false,
          sourceType: p.sourceType || "bibtex",
        };
      });

      await bulkUpload({ notebookId, papers: papersWithTitle });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import papers");
    } finally {
      setIsImporting(false);
    }
  }, [chosenIndices, checking, papers, notebookId, bulkUpload, onDone]);

  const togglePaper = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const allSelected = freshIndices.length > 0 && chosenIndices.length === freshIndices.length;
  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(freshIndices));
  }, [allSelected, freshIndices]);

  const withoutDoiCount = papers.filter((p) => !p.doi).length;
  const busy = isParsing || isImporting;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        In Zotero or Mendeley, export your library as BibTeX (.bib), then upload it here.
      </p>
      <Tabs defaultValue="file">
        <TabsList>
          <TabsTrigger value="file" autoFocus>
            Upload file
          </TabsTrigger>
          <TabsTrigger value="paste">Paste text</TabsTrigger>
        </TabsList>
        <TabsContent value="file">
          <PaperFileDrop
            accept=".bib,.ris"
            hint="A BibTeX (.bib) or RIS (.ris) file"
            fileName={fileName}
            disabled={busy}
            onFile={(file) => void handleFile(file)}
          />
        </TabsContent>
        <TabsContent value="paste">
          <div className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor={`${baseId}-paste`}>Bibliography</FieldLabel>
              <Textarea
                id={`${baseId}-paste`}
                rows={8}
                value={pasteContent}
                onChange={(e) => setPasteContent(e.target.value)}
                placeholder={"@article{key,\n  title={...},\n  author={...}\n}"}
                disabled={busy}
              />
            </Field>
            <div className="flex justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleParse(pasteContent)}
                disabled={!pasteContent.trim() || busy}
              >
                {isParsing && <Spinner aria-hidden />} Parse bibliography
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {isParsing && (
        <p
          role="status"
          className="flex items-center gap-2 font-sans text-sm text-muted-foreground"
        >
          <Spinner aria-hidden /> Parsing bibliography...
        </p>
      )}

      {papers.length > 0 && checking && (
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

      {warnings.length > 0 && (
        <Alert variant="warning">
          <AlertCircle />
          <AlertTitle>Some entries had problems</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {stats && (
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{stats.total} found</Badge>
          <Badge variant="outline">{stats.withDoi} with DOI</Badge>
          {stats.withoutDoi > 0 && <Badge variant="outline">{stats.withoutDoi} missing DOI</Badge>}
          {stats.malformed > 0 && <Badge variant="outline">{stats.malformed} skipped</Badge>}
          {duplicates.size > 0 && (
            <Badge variant="outline">{duplicates.size} already in notebook</Badge>
          )}
        </div>
      )}

      {withoutDoiCount > 0 && (
        <Alert variant="warning">
          <AlertCircle />
          <AlertDescription>
            {withoutDoiCount} paper{withoutDoiCount !== 1 ? "s" : ""} missing DOI. These may have
            limited metadata.
          </AlertDescription>
        </Alert>
      )}

      {papers.length > 0 && !checking && freshIndices.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Library />
            </EmptyMedia>
            <EmptyTitle>Nothing new to import</EmptyTitle>
            <EmptyDescription>
              All papers from this file are already in your notebook.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {papers.length > 0 && (checking || freshIndices.length > 0) && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between font-sans text-sm text-muted-foreground">
            <span>
              {chosenIndices.length} of {freshIndices.length} selected
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
              {allSelected ? "Deselect all" : "Select all"}
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <ItemGroup variant="grouped">
              {papers.map((p, i) => {
                const title = p.title || "Untitled";
                const inNotebook = duplicates.has(i);
                return (
                  <div key={i} role="listitem">
                    <Item asChild size="sm">
                      <label
                        htmlFor={`${baseId}-${i}`}
                        className={inNotebook ? "cursor-default" : "cursor-pointer"}
                      >
                        <ItemMedia>
                          <Checkbox
                            id={`${baseId}-${i}`}
                            checked={inNotebook || selected.has(i)}
                            disabled={inNotebook}
                            onCheckedChange={() => togglePaper(i)}
                            aria-label={
                              inNotebook ? `${title}, already in notebook` : `Include ${title}`
                            }
                          />
                        </ItemMedia>
                        <ItemContent>
                          <ItemTitle>
                            <span className="line-clamp-2">{title}</span>
                          </ItemTitle>
                          <ItemDescription>
                            {[p.authors?.slice(0, 3).join(", "), p.publicationYear]
                              .filter(Boolean)
                              .join(" · ")}
                          </ItemDescription>
                          {(inNotebook || !p.doi) && (
                            <div className="flex flex-wrap gap-1">
                              {inNotebook && <Badge variant="outline">In notebook</Badge>}
                              {!p.doi && <Badge variant="outline">No DOI</Badge>}
                            </div>
                          )}
                        </ItemContent>
                      </label>
                    </Item>
                  </div>
                );
              })}
            </ItemGroup>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => void handleImport()}
              disabled={chosenIndices.length === 0 || isImporting || checking}
            >
              {isImporting ? (
                <>
                  <Spinner aria-hidden /> Importing...
                </>
              ) : (
                `Import ${chosenIndices.length} selected paper${chosenIndices.length === 1 ? "" : "s"}`
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
