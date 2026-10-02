import type { Id } from "@convex/_generated/dataModel";
import { AlertCircle } from "lucide-react";
import { useCallback, useId, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
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
import { useBulkUpload, useParseBibliography } from "../../services/documentsApi";
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
      const text = await file.text();
      setFileName(file.name);
      void handleParse(text);
    },
    [handleParse]
  );

  const handleImport = useCallback(async () => {
    if (selected.size === 0) return;
    setIsImporting(true);
    setError(null);

    try {
      const chosen = Array.from(selected).map((i) => papers[i]);
      const papersWithTitle = chosen.map((p) => ({
        title: p.title || "Untitled",
        abstract: p.abstract || "",
        authors: p.authors || [],
        doi: p.doi,
        venue: p.venue,
        publicationYear: p.publicationYear,
        isOa: p.isOa ?? false,
        sourceType: p.sourceType || "bibtex",
      }));

      await bulkUpload({ notebookId, papers: papersWithTitle });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import papers");
    } finally {
      setIsImporting(false);
    }
  }, [selected, papers, notebookId, bulkUpload, onDone]);

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

  const allSelected = papers.length > 0 && selected.size === papers.length;
  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(papers.map((_, i) => i)));
  }, [allSelected, papers]);

  const withoutDoiCount = papers.filter((p) => !p.doi).length;
  const busy = isParsing || isImporting;

  return (
    <div className="flex flex-col gap-6">
      <Tabs defaultValue="file">
        <TabsList>
          <TabsTrigger value="file">Upload file</TabsTrigger>
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
                {isParsing && <Spinner />} Parse bibliography
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {isParsing && (
        <p className="flex items-center gap-2 font-sans text-sm text-muted-foreground">
          <Spinner /> Parsing bibliography...
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
          {stats.malformed > 0 && <Badge variant="outline">{stats.malformed} skipped</Badge>}
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

      {papers.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between font-sans text-sm text-muted-foreground">
            <span>
              {selected.size} of {papers.length} selected
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
              {allSelected ? "Deselect all" : "Select all"}
            </Button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <ItemGroup variant="grouped">
              {papers.map((p, i) => (
                <Item key={i} size="sm" role="listitem">
                  <ItemMedia>
                    <Checkbox
                      id={`${baseId}-${i}`}
                      checked={selected.has(i)}
                      onCheckedChange={() => togglePaper(i)}
                      aria-label={`Include ${p.title || "Untitled"}`}
                    />
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
              disabled={selected.size === 0 || isImporting}
            >
              {isImporting ? (
                <>
                  <Spinner /> Importing...
                </>
              ) : (
                `Import ${selected.size} selected paper${selected.size === 1 ? "" : "s"}`
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
