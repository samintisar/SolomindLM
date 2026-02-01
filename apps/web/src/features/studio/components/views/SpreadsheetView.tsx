import React from 'react';
import { XCircle, ArrowLeft, Download } from 'lucide-react';
import { SpreadsheetNote } from '@/shared/types/index';

/**
 * Parse CSV content into an array of rows.
 * Handles quoted values with commas inside them.
 */
function parseCSV(content: string): string[][] {
  if (!content || !content.trim()) return [];

  const lines = content.trim().split('\n');
  const rows: string[][] = [];

  for (const line of lines) {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote within quotes
          current += '"';
          i++;
        } else {
          // Toggle quote mode
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // Comma separator outside quotes
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add the last value
    values.push(current.trim());

    // Only add non-empty rows
    if (values.length > 0 && values.some(v => v.length > 0)) {
      rows.push(values);
    }
  }

  return rows;
}

/**
 * Component to render CSV data as a styled table.
 */
interface SpreadsheetTableProps {
  content: string;
  noteTitle: string;
}

const SpreadsheetTable: React.FC<SpreadsheetTableProps> = ({ content, noteTitle }) => {
  const rows = parseCSV(content);

  // Handle empty or error CSV
  if (rows.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-muted-foreground">No data to display</p>
      </div>
    );
  }

  const header = rows[0];
  const dataRows = rows.slice(1);
  const columnCount = header.length;

  // Download CSV function
  const handleDownload = () => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${noteTitle.replace(/[^a-z0-9]/gi, '_')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar with download button */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/20">
        <div className="text-sm text-muted-foreground">
          {dataRows.length} {dataRows.length === 1 ? 'row' : 'rows'} · {columnCount} {columnCount === 1 ? 'column' : 'columns'}
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="p-2 hover:bg-secondary active:bg-secondary/80 active:scale-[0.97] rounded-md transition-colors transition-transform text-foreground/70 hover:text-foreground touch-manipulation"
          title="Download as CSV"
          aria-label="Download as CSV"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Scrollable table container */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-secondary/50 z-10 shadow-sm">
            <tr>
              <th className="px-4 py-3 text-left font-bold text-foreground border-r border-border last:border-r-0 bg-secondary/50 select-none w-10 text-muted-foreground">
                #
              </th>
              {header.map((col, idx) => (
                <th
                  key={idx}
                  className="px-4 py-3 text-left font-bold text-foreground border-r border-border last:border-r-0 whitespace-nowrap"
                >
                  {col || <span className="text-muted-foreground italic">Column {idx + 1}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {dataRows.map((row, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-secondary/20 transition-colors">
                <td className="px-4 py-3 text-muted-foreground text-xs border-r border-border select-none w-10 text-center">
                  {rowIdx + 1}
                </td>
                {Array.from({ length: columnCount }).map((_, colIdx) => {
                  const cellValue = row[colIdx] ?? '';
                  return (
                    <td
                      key={colIdx}
                      className="px-4 py-3 text-foreground border-r border-border last:border-r-0"
                    >
                      {cellValue}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer with row count info */}
      {dataRows.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">
          No data rows found
        </div>
      )}
    </div>
  );
};

export interface SpreadsheetViewProps {
  note: SpreadsheetNote;
  onBack?: () => void;
}

export const SpreadsheetView: React.FC<SpreadsheetViewProps> = ({ note, onBack }) => {
  const isFailed = note.status === 'failed';

  return (
    <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-right-4 duration-300">
      {/* Mobile Back Button */}
      {onBack && (
        <div className="md:hidden flex items-center gap-2 p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
          <button
            onClick={onBack}
            className="p-1.5 hover:bg-secondary rounded-md transition-colors text-foreground flex items-center justify-center shrink-0"
            aria-label="Back to Studio"
          >
            <ArrowLeft className="w-5 h-5 shrink-0" />
          </button>
          <span className="text-sm font-semibold text-foreground truncate">{note.title}</span>
        </div>
      )}

      {/* Error State */}
      {isFailed && (
        <div className="p-4 border-b border-border bg-destructive/10">
          <div className="flex items-center gap-3">
            <XCircle className="w-5 h-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-destructive">Spreadsheet generation failed</p>
              <p className="text-xs text-destructive/70 mt-1">
                {note.metadata?.error || 'An unknown error occurred'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 bg-card border-t border-border min-h-0">
        {note.content ? (
          <SpreadsheetTable content={note.content} noteTitle={note.title} />
        ) : isFailed ? (
          <div className="flex flex-col items-center justify-center py-12">
            <XCircle className="w-12 h-12 text-destructive mb-4" />
            <p className="text-muted-foreground">Spreadsheet generation failed</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground">No content available</p>
          </div>
        )}
      </div>
    </div>
  );
};
