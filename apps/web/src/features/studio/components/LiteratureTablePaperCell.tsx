import {
  BookMarked,
  CirclePlus,
  FileText,
  FlaskConical,
  LockOpen,
  Microscope,
  PieChart,
  Quote,
  Search,
  TriangleAlert,
} from "lucide-react";
import React, { useId } from "react";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Spinner } from "@/shared/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/components/ui/tooltip";
import type { TablePaperRow } from "../utils/literatureTablePaper";
import {
  collectStudyTypeLabels,
  formatPaperAuthors,
  formatPaperMetaLine,
  getPaperTitle,
  type StudyTypePillIcon,
  studyTypeIcon,
} from "../utils/literatureTablePaper";
import type { TableColumn } from "./ColumnManager";

interface LiteratureTablePaperCellProps {
  rank: number;
  paper: TablePaperRow;
  columns: TableColumn[];
  isSelected: boolean;
  isAdding: boolean;
  isInNotebook: boolean;
  onToggleSelect: () => void;
  onCite: () => void;
  onAddToNotebook: () => void;
}

function StudyTypePillIcon({ kind }: { kind: StudyTypePillIcon }) {
  switch (kind) {
    case "systematic":
      return <PieChart aria-hidden />;
    case "literature":
      return <Search aria-hidden />;
    case "trial":
    case "observational":
      return <Microscope aria-hidden />;
    case "empirical":
      return <FlaskConical aria-hidden />;
    default:
      return <FileText aria-hidden />;
  }
}

function StudyTypeBadge({ label }: { label: string }) {
  return (
    <Badge variant="outline" className="max-w-full">
      <StudyTypePillIcon kind={studyTypeIcon(label)} />
      <span className="truncate">{label}</span>
    </Badge>
  );
}

/** A warning on the paper; the detail shows on hover and focus. */
function WarningBadge({ label, detail }: { label: string; detail: string }) {
  const detailId = useId();
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" tabIndex={0} aria-describedby={detailId}>
          <TriangleAlert aria-hidden className="text-warning" />
          {label}
        </Badge>
      </TooltipTrigger>
      <span id={detailId} className="sr-only">
        {detail}
      </span>
      <TooltipContent className="max-w-72">{detail}</TooltipContent>
    </Tooltip>
  );
}

const EXTRACTION_FAILED_DETAIL =
  "We couldn't extract this paper's details, so its columns are empty. The paper may still report them.";

export const LiteratureTablePaperCell: React.FC<LiteratureTablePaperCellProps> = ({
  rank,
  paper,
  columns,
  isSelected,
  isAdding,
  isInNotebook,
  onToggleSelect,
  onCite,
  onAddToNotebook,
}) => {
  const title = getPaperTitle(paper, columns);
  const citation = paper.citation;
  const studyBadges = collectStudyTypeLabels(paper, columns);
  const pdfHref = citation?.pdfUrl?.trim() || citation?.url;
  const isOpenAccess = Boolean(citation?.pdfUrl?.trim());
  /** Included from the user's own notebook (#301), so it's already there. */
  const isNotebookPaper = citation?.sourceApi === "notebook";

  return (
    <div className="relative flex gap-3 pr-10">
      <div className="flex shrink-0 items-start gap-2.5 pt-0.5">
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-full bg-muted font-sans text-xs font-medium text-muted-foreground"
        >
          {rank}
        </span>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect()}
          aria-label={`Select ${title}`}
          className="mt-1.5"
        />
      </div>

      <div className="min-w-0 flex-1 space-y-2.5">
        {citation ? (
          <>
            {citation.url ? (
              <a
                href={citation.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm font-semibold leading-snug text-foreground hover:text-primary hover:underline"
              >
                {title}
              </a>
            ) : (
              <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
            )}
            <p className="text-sm leading-relaxed text-muted-foreground">
              {formatPaperMetaLine(citation)}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {formatPaperAuthors(citation)}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
            {paper.includeReason && (
              <p className="text-sm leading-relaxed text-muted-foreground">{paper.includeReason}</p>
            )}
          </>
        )}

        {(studyBadges.length > 0 || isNotebookPaper || paper.extractionFailed) && (
          <div className="flex flex-wrap gap-2 pt-0.5">
            {isNotebookPaper && (
              <Badge variant="secondary">
                <BookMarked aria-hidden />
                Your paper
              </Badge>
            )}
            {isNotebookPaper && paper.offTopicReason && (
              <WarningBadge label="Off-topic?" detail={paper.offTopicReason} />
            )}
            {paper.extractionFailed && (
              <WarningBadge label="Extraction failed" detail={EXTRACTION_FAILED_DETAIL} />
            )}
            {studyBadges.map((label) => (
              <StudyTypeBadge key={label} label={label} />
            ))}
          </div>
        )}

        {!paper.isIncluded && (
          <span className="text-xs font-medium text-destructive">Excluded from review</span>
        )}

        <div className="flex flex-wrap items-center gap-1 pt-1">
          <Button variant="ghost" size="xs" onClick={onCite} disabled={!citation}>
            <Quote aria-hidden />
            Cite
          </Button>
          {!isNotebookPaper && (
            <Button
              variant="ghost"
              size="xs"
              onClick={onAddToNotebook}
              disabled={isInNotebook || isAdding || !citation}
            >
              {isAdding ? <Spinner aria-hidden /> : <CirclePlus aria-hidden />}
              {isAdding ? "Adding…" : isInNotebook ? "In notebook" : "Add to notebook"}
            </Button>
          )}
        </div>
      </div>

      <div className="absolute right-0 top-1 flex flex-col items-center gap-2">
        {isOpenAccess && (
          <span className="text-studio-literature" title="Open access">
            <LockOpen className="size-4" aria-hidden />
            <span className="sr-only">Open access</span>
          </span>
        )}
        {pdfHref && (
          <Button variant="ghost" size="icon-sm" asChild>
            <a
              href={pdfHref}
              target="_blank"
              rel="noopener noreferrer"
              title="View PDF"
              aria-label="View PDF"
            >
              <FileText className="text-destructive" />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
};
