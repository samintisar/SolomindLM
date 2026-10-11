import {
  type Count,
  type ExclusionReason,
  formatCount,
  type PrismaFlowState,
  reasonLabel,
} from "./prismaFlow";

export const DIAGRAM_FONT = "Arial, Helvetica, sans-serif";
export const FONT_SIZE = 12;
export const LINE_HEIGHT = 16;
export const BOX_PADDING = 10;

const MARGIN = 16;
const PHASE_W = 30;
const PHASE_GAP = 16;
const BOX_W = 230;
const ARROW_GAP = 40;
const COLUMN_W = BOX_W * 2 + ARROW_GAP;
const COLUMN_GAP = 40;
const HEADER_H = 32;
const ROW_GAP = 28;
const BOX_TEXT_W = BOX_W - BOX_PADDING * 2;
const HEADER_TEXT_W = COLUMN_W - BOX_PADDING * 2;

export type PrismaBox = {
  id: string;
  kind: "box" | "header" | "phase";
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
};

type PrismaArrow = { id: string; points: [number, number][] };

export type PrismaLayout = {
  width: number;
  height: number;
  boxes: PrismaBox[];
  arrows: PrismaArrow[];
};

/**
 * Arial advance widths in em, rounded up by group, so a wrapped line never runs past its box
 * (capitals and W/M are far wider than the lowercase average).
 */
function glyphEm(char: string): number {
  if (/[\s.,:;!'|ijltfI]/.test(char)) return 0.28;
  if (/[MWmw@%]/.test(char)) return 0.94;
  if (/[A-Z]/.test(char)) return 0.78;
  if (/[⺀-￯]/.test(char)) return 1;
  return 0.58;
}

/** Estimated rendered width of `text` in px at FONT_SIZE. */
export function textWidth(text: string): number {
  let em = 0;
  for (const char of text) em += glyphEm(char);
  return em * FONT_SIZE;
}

/** Splits a word wider than a line into line-wide pieces. */
function splitWord(word: string, maxWidth: number): string[] {
  const parts: string[] = [];
  let part = "";
  for (const char of word) {
    if (part && textWidth(part + char) > maxWidth) {
      parts.push(part);
      part = char;
    } else part += char;
  }
  if (part) parts.push(part);
  return parts;
}

/** Greedy word wrap to `maxWidth` px; words wider than a line are split. */
export function wrapText(text: string, maxWidth: number): string[] {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => (textWidth(word) <= maxWidth ? [word] : splitWord(word, maxWidth)));
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (textWidth(`${line} ${word}`) <= maxWidth) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

type Cell = { id: string; lines: string[] };

/** A box line: plain text, or a label followed by its "(n = …)" count. */
type Line = string | { label: string; count: Count };

/** Wraps the label, then keeps the count suffix whole: on the last line if it fits, else its own. */
function wrapLine(line: Line): string[] {
  if (typeof line === "string") return wrapText(line, BOX_TEXT_W);
  const suffix = formatCount(line.count);
  const lines = wrapText(line.label, BOX_TEXT_W);
  const last = lines[lines.length - 1] ?? "";
  if (textWidth(`${last} ${suffix}`) <= BOX_TEXT_W) lines[lines.length - 1] = `${last} ${suffix}`;
  else lines.push(suffix);
  return lines;
}

const cell = (id: string, ...items: Line[]): Cell => ({ id, lines: items.flatMap(wrapLine) });

const reasonsCell = (id: string, reasons: ExclusionReason[]) =>
  cell(
    id,
    "Reports excluded:",
    ...reasons.map((reason, i) => ({ label: reasonLabel(reason, i), count: reason.count }))
  );

const boxHeight = (lines: number) => BOX_PADDING * 2 + lines * LINE_HEIGHT;

/** Geometry of the PRISMA 2020 flow diagram for new reviews, in SVG user units. */
export function layoutPrismaFlow(state: PrismaFlowState): PrismaLayout {
  const { main, other } = state;
  const o = state.otherMethods;

  // Four columns per row: main box, its side box, then (other methods) the same pair again.
  const rows: (Cell | undefined)[][] = [
    [
      cell(
        "identified",
        "Records identified from:",
        { label: "Databases", count: main.databases },
        { label: "Registers", count: main.registers }
      ),
      cell(
        "removed",
        "Records removed before screening:",
        { label: "Duplicate records removed", count: main.duplicatesRemoved },
        {
          label: "Records marked as ineligible by automation tools",
          count: main.automationRemoved,
        },
        { label: "Records removed for other reasons", count: main.otherRemoved }
      ),
      o
        ? cell(
            "other-identified",
            "Records identified from:",
            { label: "Websites", count: other.websites },
            { label: "Organisations", count: other.organisations },
            { label: "Citation searching", count: other.citationSearching }
          )
        : undefined,
      undefined,
    ],
    [
      cell("screened", { label: "Records screened", count: main.recordsScreened }),
      cell("excluded", { label: "Records excluded", count: main.recordsExcluded }),
      undefined,
      undefined,
    ],
    [
      cell("sought", { label: "Reports sought for retrieval", count: main.reportsSought }),
      cell("not-retrieved", { label: "Reports not retrieved", count: main.reportsNotRetrieved }),
      o
        ? cell("other-sought", {
            label: "Reports sought for retrieval",
            count: other.reportsSought,
          })
        : undefined,
      o
        ? cell("other-not-retrieved", {
            label: "Reports not retrieved",
            count: other.reportsNotRetrieved,
          })
        : undefined,
    ],
    [
      cell("assessed", { label: "Reports assessed for eligibility", count: main.reportsAssessed }),
      reasonsCell("reports-excluded", state.reasons),
      o
        ? cell("other-assessed", {
            label: "Reports assessed for eligibility",
            count: other.reportsAssessed,
          })
        : undefined,
      o ? reasonsCell("other-reports-excluded", state.otherReasons) : undefined,
    ],
    [
      cell(
        "included",
        { label: "Studies included in review", count: main.studiesIncluded },
        { label: "Reports of included studies", count: main.reportsIncluded }
      ),
      undefined,
      undefined,
      undefined,
    ],
  ];

  const mainX = MARGIN + PHASE_W + PHASE_GAP;
  const otherX = mainX + COLUMN_W + COLUMN_GAP;
  const columnXs = [mainX, mainX + BOX_W + ARROW_GAP, otherX, otherX + BOX_W + ARROW_GAP];
  const width = (o ? otherX : mainX) + COLUMN_W + MARGIN;

  const header = (id: string, x: number, text: string): PrismaBox => ({
    id,
    kind: "header",
    x,
    y: MARGIN,
    w: COLUMN_W,
    h: HEADER_H,
    lines: wrapText(text, HEADER_TEXT_W),
  });
  const boxes: PrismaBox[] = [
    header("header-main", mainX, "Identification of studies via databases and registers"),
  ];
  if (o) boxes.push(header("header-other", otherX, "Identification of studies via other methods"));

  const placed = new Map<string, PrismaBox>();
  const rowTops: number[] = [];
  const rowHeights: number[] = [];
  let y = MARGIN + HEADER_H + ROW_GAP;
  for (const row of rows) {
    const cells = row.filter((c): c is Cell => c !== undefined);
    const h = Math.max(...cells.map((c) => boxHeight(c.lines.length)));
    row.forEach((c, column) => {
      if (!c) return;
      const box: PrismaBox = {
        id: c.id,
        kind: "box",
        x: columnXs[column] ?? mainX,
        y,
        w: BOX_W,
        h,
        lines: c.lines,
      };
      boxes.push(box);
      placed.set(c.id, box);
    });
    rowTops.push(y);
    rowHeights.push(h);
    y += h + ROW_GAP;
  }
  const height = y - ROW_GAP + MARGIN;

  const phase = (id: string, label: string, first: number, last: number) => {
    const top = rowTops[first] ?? 0;
    boxes.push({
      id,
      kind: "phase",
      x: MARGIN,
      y: top,
      w: PHASE_W,
      h: (rowTops[last] ?? 0) + (rowHeights[last] ?? 0) - top,
      lines: [label],
    });
  };
  phase("phase-identification", "Identification", 0, 0);
  phase("phase-screening", "Screening", 1, 3);
  phase("phase-included", "Included", 4, 4);

  const get = (id: string) => {
    const box = placed.get(id);
    if (!box) throw new Error(`PRISMA layout: no box ${id}`);
    return box;
  };
  const arrows: PrismaArrow[] = [];
  const down = (from: string, to: string) => {
    const a = get(from);
    const b = get(to);
    arrows.push({
      id: `${from}-${to}`,
      points: [
        [a.x + a.w / 2, a.y + a.h],
        [b.x + b.w / 2, b.y],
      ],
    });
  };
  const right = (from: string, to: string) => {
    const a = get(from);
    const b = get(to);
    arrows.push({
      id: `${from}-${to}`,
      points: [
        [a.x + a.w, a.y + a.h / 2],
        [b.x, b.y + b.h / 2],
      ],
    });
  };

  down("identified", "screened");
  down("screened", "sought");
  down("sought", "assessed");
  down("assessed", "included");
  right("identified", "removed");
  right("screened", "excluded");
  right("sought", "not-retrieved");
  right("assessed", "reports-excluded");
  if (o) {
    down("other-identified", "other-sought");
    down("other-sought", "other-assessed");
    right("other-sought", "other-not-retrieved");
    right("other-assessed", "other-reports-excluded");
    const from = get("other-assessed");
    const to = get("included");
    const midY = to.y + to.h / 2;
    arrows.push({
      id: "other-assessed-included",
      points: [
        [from.x + from.w / 2, from.y + from.h],
        [from.x + from.w / 2, midY],
        [to.x + to.w, midY],
      ],
    });
  }

  return { width, height, boxes, arrows };
}
