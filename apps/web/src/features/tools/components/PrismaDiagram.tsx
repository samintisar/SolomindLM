import { type Ref, useMemo } from "react";
import type { PrismaFlowState } from "../lib/prismaFlow";
import {
  BOX_PADDING,
  DIAGRAM_FONT,
  FONT_SIZE,
  LINE_HEIGHT,
  layoutPrismaFlow,
  type PrismaBox,
} from "../lib/prismaLayout";

/** Manuscript colours: the figure stays black on white in every theme. */
const INK = "#000000";
const PAPER = "#ffffff";
const BAND = "#e6e6e6";

const PRISMA_DIAGRAM_TITLE = "PRISMA 2020 flow diagram";

/** Stable keys for a box's lines without using their index. */
function keyedLines(boxId: string, lines: string[]) {
  const seen = new Map<string, number>();
  return lines.map((text) => {
    const n = (seen.get(text) ?? 0) + 1;
    seen.set(text, n);
    return { key: `${boxId}:${text}:${n}`, text };
  });
}

function BoxText({ box }: { box: PrismaBox }) {
  if (box.kind === "phase") {
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    return (
      <text
        x={cx}
        y={cy}
        transform={`rotate(-90 ${cx} ${cy})`}
        textAnchor="middle"
        dominantBaseline="central"
        fontWeight="bold"
      >
        {box.lines[0]}
      </text>
    );
  }
  const centered = box.kind === "header";
  const top = centered ? box.y + (box.h - box.lines.length * LINE_HEIGHT) / 2 : box.y + BOX_PADDING;
  const x = centered ? box.x + box.w / 2 : box.x + BOX_PADDING;
  return (
    <text textAnchor={centered ? "middle" : "start"} fontWeight={centered ? "bold" : undefined}>
      {keyedLines(box.id, box.lines).map((line, i) => (
        <tspan key={line.key} x={x} y={top + (i + 1) * LINE_HEIGHT - 4}>
          {line.text}
        </tspan>
      ))}
    </text>
  );
}

type PrismaDiagramProps = {
  state: PrismaFlowState;
  /** Page sizing only; stripped from downloads. */
  className?: string;
  ref?: Ref<SVGSVGElement>;
};

/** The diagram as one self-contained SVG: inline attributes only, so it exports as drawn. */
export function PrismaDiagram({ state, className, ref }: PrismaDiagramProps) {
  const layout = useMemo(() => layoutPrismaFlow(state), [state]);
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      width={layout.width}
      height={layout.height}
      fontFamily={DIAGRAM_FONT}
      fontSize={FONT_SIZE}
      fill={INK}
      role="img"
      aria-label={PRISMA_DIAGRAM_TITLE}
      className={className}
    >
      <title>{PRISMA_DIAGRAM_TITLE}</title>
      <defs>
        <marker
          id="prisma-arrowhead"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto"
        >
          <path d="M0,0 L10,5 L0,10 z" fill={INK} />
        </marker>
      </defs>
      <rect width={layout.width} height={layout.height} fill={PAPER} />
      {layout.boxes.map((box) => (
        <g key={box.id} data-box={box.id}>
          <rect
            x={box.x}
            y={box.y}
            width={box.w}
            height={box.h}
            fill={box.kind === "box" ? PAPER : BAND}
            stroke={box.kind === "box" ? INK : "none"}
            strokeWidth={1}
          />
          <BoxText box={box} />
        </g>
      ))}
      {layout.arrows.map((arrow) => (
        <polyline
          key={arrow.id}
          points={arrow.points.map(([x, y]) => `${x},${y}`).join(" ")}
          fill="none"
          stroke={INK}
          strokeWidth={1}
          markerEnd="url(#prisma-arrowhead)"
        />
      ))}
    </svg>
  );
}
