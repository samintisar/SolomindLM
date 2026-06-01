import {
  CirclePlus,
  FileText,
  FlaskConical,
  Loader2,
  LockOpen,
  Microscope,
  PieChart,
  Quote,
  Search,
} from "lucide-react";
import React from "react";
import type { TablePaperRow } from "../utils/literatureTablePaper";
import {
  collectStudyTypeLabels,
  formatPaperAuthors,
  formatPaperMetaLine,
  getPaperTitle,
  getStudyTypePillStyle,
  type StudyTypePillIcon,
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

function StudyTypePillIcon({ kind, className }: { kind: StudyTypePillIcon; className: string }) {
  const iconClass = `h-3 w-3 shrink-0 ${className}`;
  switch (kind) {
    case "systematic":
      return <PieChart className={iconClass} strokeWidth={2} aria-hidden />;
    case "literature":
      return <Search className={iconClass} strokeWidth={2} aria-hidden />;
    case "trial":
    case "observational":
      return <Microscope className={iconClass} strokeWidth={2} aria-hidden />;
    case "empirical":
      return <FlaskConical className={iconClass} strokeWidth={2} aria-hidden />;
    default:
      return <FileText className={iconClass} strokeWidth={2} aria-hidden />;
  }
}

function StudyTypeBadge({ label }: { label: string }) {
  const style = getStudyTypePillStyle(label);
  return (
    <span className={style.className}>
      <StudyTypePillIcon kind={style.icon} className={style.iconClassName} />
      <span className="truncate">{label}</span>
    </span>
  );
}

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

  return (
    <div className="relative flex gap-3 pr-10">
      <div className="flex shrink-0 items-start gap-2.5 pt-0.5">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-100 text-xs font-medium text-neutral-600 dark:bg-muted dark:text-muted-foreground"
          aria-hidden
        >
          {rank}
        </span>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="mt-1.5 h-4 w-4 rounded border-neutral-300"
          aria-label={`Select ${title}`}
        />
      </div>

      <div className="min-w-0 flex-1 space-y-2.5">
        {citation ? (
          <>
            <a
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[15px] font-semibold leading-snug text-foreground hover:text-primary hover:underline"
            >
              {title}
            </a>
            <p className="text-sm leading-relaxed text-neutral-500">
              {formatPaperMetaLine(citation)}
            </p>
            <p className="text-sm leading-relaxed text-neutral-500">
              {formatPaperAuthors(citation)}
            </p>
          </>
        ) : (
          <>
            <p className="text-[15px] font-semibold leading-snug text-foreground">{title}</p>
            {paper.includeReason && (
              <p className="text-sm leading-relaxed text-neutral-500">{paper.includeReason}</p>
            )}
          </>
        )}

        {studyBadges.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-0.5">
            {studyBadges.map((label) => (
              <StudyTypeBadge key={label} label={label} />
            ))}
          </div>
        )}

        {!paper.isIncluded && (
          <span className="text-xs font-medium text-destructive">Excluded from review</span>
        )}

        <div className="flex flex-wrap items-center gap-4 pt-1 text-sm text-neutral-600">
          <button
            type="button"
            onClick={onCite}
            disabled={!citation}
            className="inline-flex items-center gap-1.5 hover:text-foreground disabled:opacity-50"
          >
            <Quote className="h-4 w-4" strokeWidth={2} />
            <span>Cite</span>
          </button>
          <button
            type="button"
            onClick={onAddToNotebook}
            disabled={isInNotebook || isAdding || !citation}
            className="inline-flex items-center gap-1.5 hover:text-foreground disabled:opacity-50"
          >
            {isAdding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CirclePlus className="h-4 w-4" strokeWidth={2} />
            )}
            <span>{isInNotebook ? "In notebook" : "Add to notebook"}</span>
          </button>
        </div>
      </div>

      <div className="absolute right-0 top-1 flex flex-col items-center gap-2">
        {isOpenAccess && (
          <span className="text-orange-500" title="Open access">
            <LockOpen className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
        )}
        {pdfHref && (
          <a
            href={pdfHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-500 hover:text-red-600"
            title="View PDF"
            aria-label="View PDF"
          >
            <FileText className="h-4 w-4" strokeWidth={2} />
          </a>
        )}
      </div>
    </div>
  );
};
