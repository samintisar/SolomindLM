/** Exports for the free flashcard tool. Pure string builders + one DOM download helper. */

import { toSafeExportCell } from "@/features/studio/components/spreadsheet/sheetModel";
import { downloadBlob } from "@/shared/utils/downloadFile";

export type ExportCard = { front: string; back: string };

/** Anki/Quizlet text imports split fields on tabs and cards on newlines. */
const flatten = (value: string) =>
  value
    .replace(/[\t\r\n]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();

const tabLine = (card: ExportCard) => `${flatten(card.front)}\t${flatten(card.back)}`;

const ankiField = (value: string) => `"${flatten(value).replace(/"/g, '""')}"`;

/**
 * Anki "Import File" plain text with file headers (Anki 2.1.55+). Every field is quoted: an
 * unquoted line starting with "#" is read as a comment and one starting with `"` as quoting.
 */
export function toAnkiText(cards: ExportCard[]): string {
  const lines = cards.map((card) => `${ankiField(card.front)}\t${ankiField(card.back)}`);
  return `${["#separator:tab", "#html:false", "#columns:Front\tBack", ...lines].join("\n")}\n`;
}

/** Paste into Quizlet's "Import" box with "Between term and definition: Tab" and "Between rows: New line". */
export function toQuizletText(cards: ExportCard[]): string {
  return cards.map(tabLine).join("\n");
}

const csvCell = (value: string) => `"${toSafeExportCell(value).replace(/"/g, '""')}"`;

/** BOM so Excel reads UTF-8; CRLF rows per RFC 4180; formula-like cells open as text. */
export function toCsv(cards: ExportCard[]): string {
  const rows = cards.map((c) => `${csvCell(c.front)},${csvCell(c.back)}`);
  return `﻿${["Front,Back", ...rows].join("\r\n")}`;
}

export function exportFileName(title: string, extension: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug ? `${slug}-flashcards.${extension}` : `flashcards.${extension}`;
}

export function downloadTextFile(fileName: string, content: string, mimeType: string): void {
  downloadBlob(new Blob([content], { type: `${mimeType};charset=utf-8` }), fileName);
}
