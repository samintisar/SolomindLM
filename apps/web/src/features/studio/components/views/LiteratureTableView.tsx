import React, { useState, useCallback, useMemo } from "react";
import {
  ArrowLeft,
  Plus,
  Settings,
  Save,
  Download,
  Eye,
  EyeOff,
  GripVertical,
  X,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
} from "lucide-react";

// ── Types (mirror convex/schema.ts) ──────────────────────────────────────

export interface TableColumn {
  id: string;
  name: string;
  type: "paper_title" | "authors" | "year" | "study_type" | "custom";
  instructions?: string;
  isVisible: boolean;
  isSystem: boolean;
  order: number;
}

export interface TablePaper {
  citationId: string;
  rowData: Record<string, string>;
  includeReason?: string;
  isIncluded: boolean;
}

export interface LiteratureTable {
  title: string;
  columns: TableColumn[];
  papers: TablePaper[];
}

export interface LiteratureTableViewProps {
  table: LiteratureTable;
  onBack?: () => void;
  onSave?: (table: LiteratureTable) => void;
  onExport?: (format: "csv" | "excel") => void;
  onAddPapers?: () => void;
  paperTitles?: Record<string, string>; // citationId -> title
}

// ── Constants ────────────────────────────────────────────────────────────

const SUGGESTED_COLUMNS: Omit<TableColumn, "id" | "order">[] = [
  { name: "Predictive Validity", type: "custom", isVisible: false, isSystem: false },
  { name: "Benchmark Limitations", type: "custom", isVisible: false, isSystem: false },
  { name: "Notable Results & Trends", type: "custom", isVisible: false, isSystem: false },
  { name: "Study Design & Evaluation", type: "custom", isVisible: false, isSystem: false },
];

const DEFAULT_COLUMNS: Omit<TableColumn, "id" | "order">[] = [
  { name: "Insights", type: "custom", isVisible: false, isSystem: false },
  { name: "TL;DR", type: "custom", isVisible: false, isSystem: false },
  { name: "Summary", type: "custom", isVisible: false, isSystem: false },
  { name: "Research Question", type: "custom", isVisible: false, isSystem: false },
  { name: "Methodology", type: "custom", isVisible: false, isSystem: false },
  { name: "Key Findings", type: "custom", isVisible: false, isSystem: false },
  { name: "Limitations", type: "custom", isVisible: false, isSystem: false },
  { name: "Conclusion", type: "custom", isVisible: false, isSystem: false },
];

// ── Helpers ──────────────────────────────────────────────────────────────

function generateId(): string {
  return `col_${Math.random().toString(36).slice(2, 9)}`;
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// ── Components ───────────────────────────────────────────────────────────

const ColumnSidebar: React.FC<{
  columns: TableColumn[];
  onToggle: (id: string) => void;
  onReorder: (id: string, direction: "up" | "down") => void;
  onAddCustom: (name: string, instructions: string) => void;
  onClose: () => void;
}> = ({ columns, onToggle, onAddCustom, onClose }) => {
  const [customName, setCustomName] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    suggested: true,
    default: true,
    custom: true,
    active: true,
  });

  const activeColumns = columns.filter((c) => c.isVisible).sort((a, b) => a.order - b.order);
  const customColumns = columns.filter((c) => c.type === "custom" && !c.isSystem);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="w-80 h-full bg-card border-l border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-semibold text-foreground">Manage Columns</h3>
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-secondary rounded-md transition-colors"
          aria-label="Close sidebar"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Active Columns */}
        <div>
          <button
            onClick={() => toggleSection("active")}
            className="flex items-center gap-2 w-full text-sm font-medium text-foreground mb-2"
          >
            {expandedSections.active ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Active Columns ({activeColumns.length})
          </button>
          {expandedSections.active && (
            <div className="space-y-1">
              {activeColumns.map((col) => (
                <div
                  key={col.id}
                  className="flex items-center gap-2 p-2 rounded-md bg-secondary/30 group"
                >
                  <GripVertical className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
                  <span className="flex-1 text-sm truncate">{col.name}</span>
                  <button
                    onClick={() => onToggle(col.id)}
                    className="p-1 hover:bg-secondary rounded"
                    aria-label={`Hide ${col.name}`}
                  >
                    <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Suggested Columns */}
        <div>
          <button
            onClick={() => toggleSection("suggested")}
            className="flex items-center gap-2 w-full text-sm font-medium text-foreground mb-2"
          >
            {expandedSections.suggested ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Suggested
          </button>
          {expandedSections.suggested && (
            <div className="space-y-1">
              {SUGGESTED_COLUMNS.map((col) => {
                const existing = columns.find((c) => c.name === col.name);
                const isActive = existing?.isVisible;
                return (
                  <div
                    key={col.name}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-secondary/30 transition-colors"
                  >
                    <span className="flex-1 text-sm">{col.name}</span>
                    <button
                      onClick={() => existing && onToggle(existing.id)}
                      className={cn(
                        "p-1 rounded",
                        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                      aria-label={isActive ? `Hide ${col.name}` : `Show ${col.name}`}
                    >
                      {isActive ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Default Columns */}
        <div>
          <button
            onClick={() => toggleSection("default")}
            className="flex items-center gap-2 w-full text-sm font-medium text-foreground mb-2"
          >
            {expandedSections.default ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Default
          </button>
          {expandedSections.default && (
            <div className="space-y-1">
              {DEFAULT_COLUMNS.map((col) => {
                const existing = columns.find((c) => c.name === col.name);
                const isActive = existing?.isVisible;
                return (
                  <div
                    key={col.name}
                    className="flex items-center gap-2 p-2 rounded-md hover:bg-secondary/30 transition-colors"
                  >
                    <span className="flex-1 text-sm">{col.name}</span>
                    <button
                      onClick={() => existing && onToggle(existing.id)}
                      className={cn(
                        "p-1 rounded",
                        isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                      )}
                      aria-label={isActive ? `Hide ${col.name}` : `Show ${col.name}`}
                    >
                      {isActive ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Custom Columns */}
        <div>
          <button
            onClick={() => toggleSection("custom")}
            className="flex items-center gap-2 w-full text-sm font-medium text-foreground mb-2"
          >
            {expandedSections.custom ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Custom ({customColumns.length})
          </button>
          {expandedSections.custom && (
            <div className="space-y-2">
              {customColumns.map((col) => (
                <div
                  key={col.id}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-secondary/30 transition-colors"
                >
                  <span className="flex-1 text-sm truncate">{col.name}</span>
                  <button
                    onClick={() => onToggle(col.id)}
                    className={cn(
                      "p-1 rounded",
                      col.isVisible ? "text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {col.isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </div>
              ))}

              {showCustomForm ? (
                <div className="space-y-2 p-2 border border-border rounded-md">
                  <input
                    type="text"
                    placeholder="Column name"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <textarea
                    placeholder="Instructions for extraction (optional)"
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    rows={2}
                    className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (customName.trim()) {
                          onAddCustom(customName.trim(), customInstructions.trim());
                          setCustomName("");
                          setCustomInstructions("");
                          setShowCustomForm(false);
                        }
                      }}
                      className="flex-1 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowCustomForm(false);
                        setCustomName("");
                        setCustomInstructions("");
                      }}
                      className="px-3 py-1.5 text-sm border border-border rounded-md hover:bg-secondary transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCustomForm(true)}
                  className="flex items-center gap-1.5 w-full p-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/30 rounded-md transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Create custom column
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────

function exportToCSV(table: LiteratureTable, filename: string) {
  const visibleColumns = table.columns.filter((c) => c.isVisible).sort((a, b) => a.order - b.order);
  const headers = ["Paper", ...visibleColumns.filter((c) => c.type !== "paper_title").map((c) => c.name)];

  const rows = table.papers.map((paper) => {
    const titleCol = table.columns.find((c) => c.type === "paper_title");
    const title = titleCol ? paper.rowData[titleCol.id] || "Untitled Paper" : "Untitled Paper";
    const values = visibleColumns
      .filter((c) => c.type !== "paper_title")
      .map((col) => paper.rowData[col.id] || "");
    return [title, ...values];
  });

  const escapeCSV = (value: string) => {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const csvContent = [headers.map(escapeCSV).join(","), ...rows.map((row) => row.map(escapeCSV).join(","))].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const LiteratureTableView: React.FC<LiteratureTableViewProps> = ({
  table: initialTable,
  onBack,
  onSave,
  onExport,
  onAddPapers,
  paperTitles = {},
}) => {
  const [table, setTable] = useState<LiteratureTable>(initialTable);
  const [showSidebar, setShowSidebar] = useState(false);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);

  // Sort columns by order
  const visibleColumns = useMemo(
    () => table.columns.filter((c) => c.isVisible).sort((a, b) => a.order - b.order),
    [table.columns]
  );

  // Toggle column visibility
  const handleToggleColumn = useCallback((id: string) => {
    setTable((prev) => ({
      ...prev,
      columns: prev.columns.map((c) => (c.id === id ? { ...c, isVisible: !c.isVisible } : c)),
    }));
  }, []);

  // Reorder column
  const handleReorderColumn = useCallback((id: string, direction: "up" | "down") => {
    setTable((prev) => {
      const cols = [...prev.columns].sort((a, b) => a.order - b.order);
      const idx = cols.findIndex((c) => c.id === id);
      if (idx === -1) return prev;
      const newIdx = direction === "up" ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= cols.length) return prev;

      // Swap orders
      const temp = cols[idx].order;
      cols[idx].order = cols[newIdx].order;
      cols[newIdx].order = temp;

      return { ...prev, columns: cols };
    });
  }, []);

  // Add custom column
  const handleAddCustom = useCallback((name: string, instructions: string) => {
    setTable((prev) => {
      const maxOrder = Math.max(0, ...prev.columns.map((c) => c.order));
      const newColumn: TableColumn = {
        id: generateId(),
        name,
        type: "custom",
        instructions: instructions || undefined,
        isVisible: true,
        isSystem: false,
        order: maxOrder + 1,
      };
      return { ...prev, columns: [...prev.columns, newColumn] };
    });
  }, []);

  // Get paper title for display
  const getPaperTitle = useCallback(
    (paper: TablePaper) => {
      if (paperTitles[paper.citationId]) return paperTitles[paper.citationId];
      // Fallback: try to get from rowData if there's a paper_title column
      const titleCol = table.columns.find((c) => c.type === "paper_title");
      if (titleCol) return paper.rowData[titleCol.id] || "Untitled Paper";
      return "Untitled Paper";
    },
    [paperTitles, table.columns]
  );

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Mobile Back Button */}
      {onBack && (
        <div className="md:hidden flex items-center gap-2 p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-secondary active:bg-secondary/80 active:scale-[0.97] rounded-md transition-colors transition-transform text-foreground flex items-center justify-center shrink-0 touch-manipulation"
            aria-label="Back to Studio"
          >
            <ArrowLeft className="w-5 h-5 shrink-0" />
          </button>
          <span className="text-sm font-semibold text-foreground truncate">{table.title}</span>
        </div>
      )}

      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              onClick={onBack}
              className="hidden md:flex p-1.5 hover:bg-secondary rounded-md transition-colors text-foreground"
              aria-label="Back to Studio"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <h2 className="text-lg font-semibold text-foreground truncate">{table.title}</h2>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onAddPapers}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Papers</span>
          </button>
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md transition-colors",
              showSidebar ? "bg-secondary text-foreground" : "hover:bg-secondary text-foreground"
            )}
          >
            <Settings className="w-4 h-4" />
            <span className="hidden sm:inline">Columns</span>
          </button>
          <button
            onClick={() => onSave?.(table)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-secondary transition-colors text-foreground"
          >
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">Save</span>
          </button>
          <button
            onClick={() => onExport ? onExport("csv") : exportToCSV(table, `${table.title.replace(/\s+/g, "_")}.csv`)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-md hover:bg-secondary transition-colors text-foreground"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">Export</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Paper List (Left Panel) - Hidden on mobile */}
        <div className="hidden lg:flex flex-col w-64 border-r border-border bg-card">
          <div className="p-3 border-b border-border">
            <h3 className="text-sm font-medium text-muted-foreground">
              Papers ({table.papers.length})
            </h3>
          </div>
          <div className="flex-1 overflow-y-auto">
            {table.papers.map((paper) => {
              const title = getPaperTitle(paper);
              const isSelected = selectedPaperId === paper.citationId;
              return (
                <button
                  key={paper.citationId}
                  onClick={() => setSelectedPaperId(paper.citationId)}
                  className={cn(
                    "w-full text-left p-3 border-b border-border transition-colors",
                    isSelected ? "bg-primary/5 border-l-2 border-l-primary" : "hover:bg-secondary/30 border-l-2 border-l-transparent"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{title}</p>
                      {!paper.isIncluded && (
                        <span className="text-xs text-destructive">Excluded</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Table Area */}
        <div className="flex-1 flex flex-col min-w-0">
          {table.papers.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">No papers in this table yet</p>
                <button
                  onClick={onAddPapers}
                  className="mt-4 px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Add Papers
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-secondary/80 z-10">
                  <tr>
                    {/* Sticky first column for paper title */}
                    <th className="sticky left-0 bg-secondary/80 px-4 py-3 text-left font-bold text-foreground border-r border-border min-w-[200px] z-20">
                      Paper
                    </th>
                    {visibleColumns
                      .filter((c) => c.type !== "paper_title")
                      .map((col) => (
                        <th
                          key={col.id}
                          className="px-4 py-3 text-left font-bold text-foreground border-r border-border last:border-r-0 whitespace-nowrap min-w-[150px]"
                        >
                          {col.name}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {table.papers.map((paper) => {
                    const title = getPaperTitle(paper);
                    const isSelected = selectedPaperId === paper.citationId;
                    return (
                      <tr
                        key={paper.citationId}
                        className={cn(
                          "transition-colors",
                          isSelected ? "bg-primary/5" : "hover:bg-secondary/20"
                        )}
                      >
                        {/* Sticky first column */}
                        <td className="sticky left-0 bg-background px-4 py-3 text-foreground border-r border-border min-w-[200px] z-10">
                          <div className="font-medium">{title}</div>
                          {paper.includeReason && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {paper.includeReason}
                            </div>
                          )}
                        </td>
                        {visibleColumns
                          .filter((c) => c.type !== "paper_title")
                          .map((col) => (
                            <td
                              key={col.id}
                              className="px-4 py-3 text-foreground border-r border-border last:border-r-0 min-w-[150px] max-w-[300px]"
                            >
                              <div className="line-clamp-3">
                                {paper.rowData[col.id] || (
                                  <span className="text-muted-foreground italic">—</span>
                                )}
                              </div>
                            </td>
                          ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Column Sidebar */}
        {showSidebar && (
          <ColumnSidebar
            columns={table.columns}
            onToggle={handleToggleColumn}
            onReorder={handleReorderColumn}
            onAddCustom={handleAddCustom}
            onClose={() => setShowSidebar(false)}
          />
        )}
      </div>
    </div>
  );
};
