import React from "react";

/** Renders extraction text as paragraphs or bullet lists (no line clamp). */
export const LiteratureTableExtractionCell: React.FC<{ value: string }> = ({ value }) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return <span className="text-muted-foreground italic">—</span>;
  }

  const lines = trimmed
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const bulletLines = lines.filter((l) => /^[-•*]\s+/.test(l));

  if (bulletLines.length >= 2 && bulletLines.length >= lines.length * 0.5) {
    return (
      <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-foreground">
        {lines.map((line, i) => (
          <li key={i}>{line.replace(/^[-•*]\s+/, "")}</li>
        ))}
      </ul>
    );
  }

  return (
    <p className="text-[15px] leading-[1.65] text-foreground whitespace-pre-wrap">{trimmed}</p>
  );
};
