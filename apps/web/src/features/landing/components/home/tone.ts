import { cva, type VariantProps } from "class-variance-authority";

/** A tinted icon square. Size and radius come from the call site (`toneIcon({ tone, className })`). */
export const toneIcon = cva("grid shrink-0 place-items-center", {
  variants: {
    tone: {
      chat: "bg-info-muted text-info",
      research: "bg-studio-mindmap/12 text-studio-mindmap",
      literature: "bg-studio-literature/12 text-studio-literature",
      audio: "bg-studio-audio/12 text-studio-audio",
      mindmap: "bg-studio-mindmap/12 text-studio-mindmap",
      report: "bg-studio-report/12 text-studio-report",
      flashcard: "bg-studio-flashcard/12 text-studio-flashcard",
      quiz: "bg-studio-quiz/12 text-studio-quiz",
      infographic: "bg-studio-infographic/12 text-studio-infographic",
      written: "bg-studio-written/12 text-studio-written",
      spreadsheet: "bg-studio-spreadsheet/12 text-studio-spreadsheet",
      share: "bg-primary/10 text-primary",
      pdf: "bg-destructive-muted text-destructive",
      video: "bg-destructive-muted text-destructive",
      web: "bg-success-muted text-success",
      book: "bg-info-muted text-info",
      audioFile: "bg-warning-muted text-warning-muted-foreground",
    },
  },
});

export type Tone = NonNullable<VariantProps<typeof toneIcon>["tone"]>;

/** Notebook cover colours for the sample notebooks (semantic tones, not persisted cover swatches). */
export const notebookCover = cva("", {
  variants: {
    cover: {
      info: "bg-info-muted text-info",
      destructive: "bg-destructive-muted text-destructive",
      success: "bg-success-muted text-success",
      warning: "bg-warning-muted text-warning-muted-foreground",
    },
  },
});

export type CoverTone = NonNullable<VariantProps<typeof notebookCover>["cover"]>;
