import type { LucideIcon } from "lucide-react";
import {
  ArrowUp,
  AudioLines,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  FileText,
  GitFork,
  Globe,
  Layers,
  MessageCircle,
  MessageSquareText,
  Mic,
  PanelLeftClose,
  Plus,
  Share2,
  Sparkles,
  Youtube,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";
import { type Tone, toneIcon } from "../tone";
import { CitationChip, CitationTooltip } from "./CitationDemo";

interface Row {
  title: string;
  meta: string;
  icon: LucideIcon;
  tone: Tone;
}

const SOURCES: Row[] = [
  { title: "Lecture 12 – Beta blockers.pdf", meta: "PDF · 38 slides", icon: FileText, tone: "pdf" },
  { title: "Katzung, ch. 10", meta: "PDF · pp. 151–168", icon: BookOpen, tone: "book" },
  { title: "Dr. Patel – Autonomic pharm", meta: "YouTube · 52 min", icon: Youtube, tone: "video" },
  { title: "NICE asthma guideline", meta: "Web page", icon: Globe, tone: "web" },
  { title: "Tutorial recording", meta: "Audio · 41 min", icon: Mic, tone: "audioFile" },
];

const TOOLS: Array<{ label: string; icon: LucideIcon; tone: Tone }> = [
  { label: "Audio overview", icon: AudioLines, tone: "audio" },
  { label: "Mind map", icon: GitFork, tone: "mindmap" },
  { label: "Report", icon: FileText, tone: "report" },
  { label: "Flashcards", icon: Layers, tone: "flashcard" },
  { label: "Quiz", icon: CircleHelp, tone: "quiz" },
  { label: "Written questions", icon: MessageSquareText, tone: "written" },
];

const SAVED: Array<Row & { selected?: boolean }> = [
  { title: "Beta blockers", meta: "24 flashcards · due today", icon: Layers, tone: "flashcard" },
  {
    title: "Week 6 written questions",
    meta: "5 questions · 2 answered",
    icon: MessageSquareText,
    tone: "written",
    selected: true,
  },
  { title: "Week 6 audio recap", meta: "8 min", icon: AudioLines, tone: "audio" },
];

function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 flex items-center gap-1.5 font-sans text-xs font-bold tracking-wider uppercase">
      {children}
    </p>
  );
}

function RowTile({
  row,
  trailing,
  selected = false,
}: {
  row: Row;
  trailing?: ReactNode;
  selected?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl bg-card p-2 ring-1",
        selected ? "shadow-md ring-primary/45" : "shadow-xs ring-hairline"
      )}
    >
      <span className={toneIcon({ tone: row.tone, className: "size-6 rounded-md" })}>
        <row.icon className="size-3.5" />
      </span>
      <span className="min-w-0 flex-1 font-sans text-xs">
        <span className="block truncate font-semibold">{row.title}</span>
        <span className="block truncate text-muted-foreground">{row.meta}</span>
      </span>
      {trailing}
    </div>
  );
}

function SourcesColumn({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 p-3", className)}>
      <PanelLabel>
        Sources
        <span className="rounded-full bg-muted px-1.5 tracking-normal text-muted-foreground">
          5
        </span>
        <PanelLeftClose className="ml-auto size-3.5 text-muted-foreground" />
      </PanelLabel>
      <div className="mb-1 flex items-center justify-center gap-1.5 rounded-xl bg-primary py-2 font-sans text-xs font-semibold text-primary-foreground">
        <Plus className="size-3.5" />
        Add source
      </div>
      {SOURCES.map((source) => (
        <RowTile
          key={source.title}
          row={source}
          trailing={
            <span className="grid size-3.5 place-items-center rounded-sm bg-primary text-primary-foreground">
              <Check className="size-2.5" />
            </span>
          }
        />
      ))}
    </div>
  );
}

/** The chat column with the citation tooltip open under [1]. Also the phone hero on its own. */
export function ChatColumn({ className }: { className?: string }) {
  return (
    <div className={cn("chat-panel-graph-grid flex flex-col p-4", className)}>
      <PanelLabel>
        <MessageCircle className="size-3.5" />
        Chat
      </PanelLabel>
      <p className="ml-auto w-4/5 rounded-2xl rounded-br-sm bg-card px-3.5 py-2.5 font-serif text-sm shadow-xs ring-1 ring-hairline">
        Why are beta blockers avoided in patients with asthma?
      </p>
      <div className="mt-4 space-y-2 font-serif text-sm leading-relaxed">
        <p>
          Non-selective beta blockers such as propranolol also block β<sub>2</sub> receptors in the
          airways, which relax bronchial smooth muscle. Blocking them{" "}
          <strong>can trigger bronchospasm</strong>{" "}
          <span className="relative">
            <CitationChip n={1} active />
            <CitationTooltip className="absolute top-full left-0 z-10 mt-2.5 max-md:-left-24" />
          </span>
          .
        </p>
        <p>
          Cardioselective agents like bisoprolol act mainly on β<sub>1</sub> receptors in the heart,
          so they carry less risk, but guidelines still advise caution <CitationChip n={2} />{" "}
          <CitationChip n={3} />.
        </p>
      </div>
      <div className="mt-auto rounded-2xl bg-card p-3 shadow-lg ring-1 ring-hairline">
        <p className="font-serif text-sm text-muted-foreground">Ask about your sources…</p>
        <div className="mt-3 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-lg bg-card px-2 py-1 font-sans text-xs font-semibold shadow-xs ring-1 ring-hairline">
            <MessageCircle className="size-3" />
            Chat
            <ChevronDown className="size-3" />
          </span>
          <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
            <ArrowUp className="size-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}

function StudioColumn({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col p-3", className)}>
      <PanelLabel>
        <Sparkles className="size-3.5" />
        Studio
      </PanelLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {TOOLS.map((tool) => (
          <div
            key={tool.label}
            className="rounded-xl bg-card p-2 font-sans text-xs font-medium shadow-xs ring-1 ring-hairline"
          >
            <span className={toneIcon({ tone: tool.tone, className: "mb-1.5 size-5 rounded-md" })}>
              <tool.icon className="size-3" />
            </span>
            {tool.label}
          </div>
        ))}
      </div>
      <PanelLabel>
        <span className="mt-4">Saved</span>
      </PanelLabel>
      <div className="flex flex-col gap-1.5">
        {SAVED.map((item) => (
          <RowTile key={item.title} row={item} selected={item.selected} />
        ))}
      </div>
    </div>
  );
}

function PreviewHeader() {
  return (
    <div className="flex h-11 shrink-0 items-center justify-between border-b border-border/50 px-4">
      <div className="flex items-center gap-2.5 font-display text-sm font-bold">
        <img src="/SolomindLM_logo.png" alt="" className="size-5 object-contain" />
        <span className="h-4 w-px bg-border" />
        Pharmacology · Week 6
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-lg bg-card px-2 py-1 font-sans text-xs font-semibold shadow-xs ring-1 ring-hairline">
          <Share2 className="size-3" />
          Share
        </span>
        <span className="size-6 rounded-full bg-accent" />
      </div>
    </div>
  );
}

/** The notebook window at app size. Place it in an 860 × 640 box and scale it at the call site. */
export function PreviewWindow({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-hairline",
        className
      )}
    >
      <PreviewHeader />
      <div className="grid min-h-0 flex-1 grid-cols-12">
        <SourcesColumn className="col-span-3" />
        <ChatColumn className="col-span-6 border-x border-border/50" />
        <StudioColumn className="col-span-3" />
      </div>
    </div>
  );
}
