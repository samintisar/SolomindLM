import { useCallback, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  FileStack,
  Globe,
  Layers,
  MessageCircle,
  PanelLeftOpen,
  PanelRightOpen,
  Search,
  Send,
} from "lucide-react";
import { CreateReportModal } from "@/features/studio/components/CreateReportModal";
import { CustomizeAudioModal } from "@/features/studio/components/CustomizeAudioModal";
import { CustomizeFlashcardsModal } from "@/features/studio/components/CustomizeFlashcardsModal";
import { CustomizeQuizModal } from "@/features/studio/components/CustomizeQuizModal";
import { CustomizeInfographicModal } from "@/features/studio/components/CustomizeInfographicModal";
import { CustomizeSpreadsheetsModal } from "@/features/studio/components/CustomizeSpreadsheetsModal";
import { CustomizeWrittenQuestionsModal } from "@/features/studio/components/CustomizeWrittenQuestionsModal";
import { ToolGrid } from "@/features/studio/components/ToolGrid";
import { STUDIO_TOOLS } from "@/shared/constants";

type HeroMode = "chat" | "studio";

type LandingStudioPreviewModal =
  | null
  | "reports"
  | "flashcards"
  | "quiz"
  | "infographic"
  | "audio"
  | "writtenQuestions"
  | "spreadsheets";

export interface LandingHeroMockupProps {
  onGetStarted?: () => void;
  className?: string;
}

export function LandingHeroMockup({
  onGetStarted: _onGetStarted,
  className,
}: LandingHeroMockupProps) {
  const [mode, setMode] = useState<HeroMode>("chat");
  const [sourceId, setSourceId] = useState<string>("s1");
  const [refKey, setRefKey] = useState<1 | 2 | null>(1);
  const [activityOpen, setActivityOpen] = useState(true);
  const [studioModal, setStudioModal] = useState<LandingStudioPreviewModal>(null);
  const [inputFlash, setInputFlash] = useState(false);

  const sources = useMemo(
    () => [
      { id: "s1", title: "CPSC 304 — notes.pdf", kind: "PDF" },
      { id: "s2", title: "Normal forms explained", kind: "YouTube" },
      { id: "s3", title: "ACM survey (2019)", kind: "Article" },
    ],
    []
  );

  const closeStudioModal = useCallback(() => setStudioModal(null), []);

  const handleStudioToolClick = useCallback((id: string) => {
    if (id === "mindmap") return;
    if (id === "reports") setStudioModal("reports");
    else if (id === "flashcards") setStudioModal("flashcards");
    else if (id === "quiz") setStudioModal("quiz");
    else if (id === "infographic") setStudioModal("infographic");
    else if (id === "audio") setStudioModal("audio");
    else if (id === "writtenQuestions") setStudioModal("writtenQuestions");
    else if (id === "spreadsheets") setStudioModal("spreadsheets");
  }, []);

  const flashInput = useCallback(() => {
    setInputFlash(true);
    window.setTimeout(() => setInputFlash(false), 450);
  }, []);

  const refDetails = useMemo(
    () =>
      ({
        1: {
          sourceTitle: "CPSC 304 — notes.pdf",
          excerpt:
            "A relation is in BCNF when every determinant of a non-trivial FD is a superkey. Decomposition to BCNF can require splitting relations and may lose the ability to enforce certain dependencies without joins.",
        },
        2: {
          sourceTitle: "ACM survey (2019)",
          excerpt:
            "Third normal form relaxes BCNF slightly: transitive dependencies through prime attributes may remain. Teams often accept 3NF when BCNF decomposition would fragment the schema too much for query patterns.",
        },
      }) as const,
    []
  );

  const citeBtnBase =
    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground align-middle transition-colors hover:bg-primary/90 active:bg-primary/80 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <div
      role="region"
      aria-label="Product preview demo"
      className={`relative isolate flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background/95 text-left text-foreground${className ? ` ${className}` : ""}`}
    >
      <div
        className="pointer-events-none absolute inset-0 chat-panel-graph-grid"
        style={{ backgroundColor: "color-mix(in oklch, var(--background) 88%, transparent)" }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-3 pt-3 sm:px-4 sm:pt-4">
        <div
          className="pointer-events-auto relative flex h-10 w-[min(100%,16rem)] items-stretch gap-1 rounded-2xl border border-border/80 bg-linear-to-b from-card/95 via-card/90 to-muted/30 p-1 shadow-[0_8px_30px_-8px_rgba(28,25,23,0.18),inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:h-11 sm:w-[min(100%,17rem)]"
          role="tablist"
          aria-label="Preview mode"
        >
          <div
            className="pointer-events-none absolute bottom-1 left-1 top-1 w-[calc(50%-6px)] rounded-xl bg-background/95 shadow-md ring-1 ring-primary/20 transition-transform duration-300 ease-[cubic-bezier(0.34,1.2,0.64,1)]"
            style={{
              transform:
                mode === "studio" ? "translate3d(calc(100% + 4px), 0, 0)" : "translate3d(0, 0, 0)",
            }}
            aria-hidden
          />
          <button
            type="button"
            role="tab"
            aria-selected={mode === "chat"}
            aria-controls="landing-hero-panel-chat"
            id="landing-hero-tab-chat"
            onClick={() => setMode("chat")}
            className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-xl font-sans text-xs font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:gap-2 sm:text-sm ${
              mode === "chat" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageCircle className="h-3.5 w-3.5 shrink-0 opacity-90 sm:h-4 sm:w-4" aria-hidden />
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "studio"}
            aria-controls="landing-hero-panel-studio"
            id="landing-hero-tab-studio"
            onClick={() => setMode("studio")}
            className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-xl font-sans text-xs font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:gap-2 sm:text-sm ${
              mode === "studio" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="h-3.5 w-3.5 shrink-0 opacity-90 sm:h-4 sm:w-4" aria-hidden />
            Studio
          </button>
        </div>
      </div>

      <div
        id="landing-hero-panel-chat"
        role="tabpanel"
        aria-labelledby="landing-hero-tab-chat"
        hidden={mode !== "chat"}
        className="relative z-10 flex min-h-0 flex-1 flex-col gap-2 pt-18 sm:gap-3 sm:pt-21 md:pt-23"
      >
        <div className="flex min-h-0 flex-1 gap-2 px-3 pb-3 pt-0.5 sm:gap-3 sm:px-4 sm:pb-4 md:gap-4 md:px-5">
          <aside className="flex w-[min(38%,12rem)] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-background/70 shadow-md backdrop-blur-sm sm:w-[min(38%,13.5rem)] sm:rounded-2xl">
            <div className="flex h-11 shrink-0 items-center gap-1.5 border-b border-border bg-background/80 px-3 backdrop-blur-sm sm:h-14 sm:gap-2 sm:px-4">
              <FileStack className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden />
              <span className="font-display text-xs font-bold uppercase tracking-wide sm:text-sm">
                Sources
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto p-3 sm:gap-2 sm:p-4">
              {sources.map((s) => {
                const active = sourceId === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSourceId(s.id)}
                    className={`rounded-lg border px-2 py-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-2.5 sm:py-2 ${
                      active
                        ? "border-primary/50 bg-primary/8 shadow-sm"
                        : "border-border/80 bg-background/60 hover:border-border hover:bg-accent/40"
                    }`}
                  >
                    <p className="truncate font-sans text-[11px] font-medium text-foreground sm:text-xs">
                      {s.title}
                    </p>
                    <p className="mt-0.5 font-sans text-[10px] text-muted-foreground sm:text-[11px]">
                      {s.kind}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background/70 shadow-md backdrop-blur-sm sm:rounded-2xl">
            <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-background/80 px-3 backdrop-blur-sm sm:h-14 sm:px-4">
              <div className="flex items-center gap-1.5 text-foreground sm:gap-2">
                <MessageCircle className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden />
                <span className="font-display text-xs font-bold uppercase tracking-wide sm:text-sm">
                  Chat
                </span>
              </div>
              <div className="flex items-center gap-1.5" aria-hidden>
                <span className="rounded-md border border-border bg-card p-1.5 text-muted-foreground shadow-sm sm:rounded-lg sm:p-2">
                  <PanelLeftOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </span>
                <span className="rounded-md border border-border bg-card p-1.5 text-muted-foreground shadow-sm sm:rounded-lg sm:p-2">
                  <PanelRightOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </span>
              </div>
            </div>

            <div
              className="chat-panel-graph-grid relative min-h-0 flex-1 overflow-y-auto"
              style={{ backgroundColor: "var(--background)" }}
            >
              <div className="relative space-y-3 p-3 text-left sm:space-y-5 sm:p-4 md:p-5">
                <div className="flex flex-col items-end gap-1">
                  <div className="max-w-[95%] rounded-lg bg-[color-mix(in_oklch,var(--primary)_10%,var(--background))] p-3 text-left font-serif text-sm leading-relaxed text-foreground shadow-sm sm:rounded-xl sm:p-4 sm:text-base md:text-lg">
                    What are the tradeoffs between 3NF and BCNF for our schema sketch?
                  </div>
                </div>

                <div className="space-y-1.5 sm:space-y-2">
                  <button
                    type="button"
                    onClick={() => setActivityOpen((o) => !o)}
                    className="flex w-full items-center gap-2 rounded-lg border border-border bg-card/90 px-2.5 py-2 text-left text-xs text-muted-foreground shadow-sm transition hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3 sm:py-2.5 sm:text-sm"
                  >
                    <Search
                      className="h-3.5 w-3.5 shrink-0 text-primary/80 sm:h-4 sm:w-4"
                      aria-hidden
                    />
                    <span className="font-sans">Searching your sources</span>
                    <ChevronDown
                      className={`ml-auto h-3.5 w-3.5 shrink-0 transition sm:h-4 sm:w-4 ${activityOpen ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </button>
                  {activityOpen ? (
                    <ul className="space-y-1 border-l-2 border-primary/20 py-1 pl-2.5 font-sans text-[10px] text-muted-foreground sm:space-y-1.5 sm:pl-3 sm:text-xs">
                      <li className="flex items-center gap-1.5 sm:gap-2">
                        <Check
                          className="h-3 w-3 shrink-0 text-vintage-green-600 sm:h-3.5 sm:w-3.5"
                          aria-hidden
                        />
                        HyDE + embeddings
                      </li>
                      <li className="flex items-center gap-1.5 sm:gap-2">
                        <Check
                          className="h-3 w-3 shrink-0 text-vintage-green-600 sm:h-3.5 sm:w-3.5"
                          aria-hidden
                        />
                        Ranked relevant passages
                      </li>
                      <li className="flex items-start gap-1.5 pt-0.5 sm:gap-2">
                        <Globe
                          className="mt-0.5 h-3 w-3 shrink-0 opacity-70 sm:h-3.5 sm:w-3.5"
                          aria-hidden
                        />
                        <span>Reading: CPSC 304 — notes.pdf</span>
                      </li>
                    </ul>
                  ) : null}
                </div>

                {/* Assistant message — mirrors MessageBubble + inline citation pills (messageRendering) */}
                <div className="flex w-full flex-col items-start gap-1 text-left">
                  <div className="w-full max-w-4xl font-serif text-base leading-relaxed text-foreground sm:text-lg">
                    <div className="prose max-w-none space-y-2 font-serif text-base leading-relaxed text-foreground">
                      <p className="text-left text-base leading-relaxed">
                        BCNF removes every dependency where the determinant isn&apos;t a superkey
                        <button
                          type="button"
                          aria-pressed={refKey === 1}
                          title="Reference 1"
                          onClick={() => setRefKey((k) => (k === 1 ? null : 1))}
                          className={`${citeBtnBase} mx-1 ${refKey === 1 ? "ring-2 ring-primary/55 ring-offset-2 ring-offset-background" : ""}`}
                          style={{ verticalAlign: "middle" }}
                        >
                          1
                        </button>
                        . Third normal form still allows some dependencies when the right-hand side
                        is a prime attribute
                        <button
                          type="button"
                          aria-pressed={refKey === 2}
                          title="Reference 2"
                          onClick={() => setRefKey((k) => (k === 2 ? null : 2))}
                          className={`${citeBtnBase} mx-1 ${refKey === 2 ? "ring-2 ring-primary/55 ring-offset-2 ring-offset-background" : ""}`}
                          style={{ verticalAlign: "middle" }}
                        >
                          2
                        </button>
                        . In practice, pushing all the way to BCNF can mean more joins, so teams
                        weigh anomaly risk against query ergonomics.
                      </p>
                    </div>

                    {refKey !== null ? (
                      <div
                        className="mt-3 max-h-48 w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-popover p-4 text-left shadow-xl animate-in fade-in zoom-in-95 duration-200 sm:mt-4 sm:max-h-52 sm:p-5"
                        role="note"
                        aria-label={`Reference ${refKey}`}
                      >
                        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground sm:text-xs">
                          Reference {refKey} • {refDetails[refKey].sourceTitle}
                        </p>
                        <p className="wrap-break-word font-serif text-sm leading-relaxed text-popover-foreground">
                          {refDetails[refKey].excerpt}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="shrink-0 border-t border-border bg-background/90 p-2 backdrop-blur-sm sm:p-3">
              <div
                className={`flex items-center gap-2 rounded-lg border border-input bg-card px-2.5 py-1.5 shadow-sm transition sm:rounded-xl sm:px-3 sm:py-2 ${
                  inputFlash ? "ring-2 ring-primary/35" : ""
                }`}
              >
                <div className="h-2 min-w-0 flex-1 rounded-full bg-muted/80" />
                <button
                  type="button"
                  onClick={flashInput}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:w-9 sm:rounded-lg"
                  aria-label="Send (demo)"
                >
                  <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        id="landing-hero-panel-studio"
        role="tabpanel"
        aria-labelledby="landing-hero-tab-studio"
        hidden={mode !== "studio"}
        className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden pt-18 sm:pt-21 md:pt-23"
      >
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-sm sm:h-14 sm:gap-2 sm:px-5">
          <Layers className="h-3.5 w-3.5 text-muted-foreground sm:h-4 sm:w-4" aria-hidden />
          <span className="font-display text-xs font-bold uppercase tracking-wide text-foreground sm:text-sm">
            Studio
          </span>
          <span className="hidden font-sans text-[10px] text-muted-foreground sm:ml-2 sm:inline sm:text-xs">
            Create study artifacts from your sources
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5 md:px-6">
          <ToolGrid
            tools={STUDIO_TOOLS}
            onToolClick={handleStudioToolClick}
            width={480}
            activeToolId={studioModal}
          />
        </div>
      </div>

      <CreateReportModal
        embedded
        isOpen={studioModal === "reports"}
        onClose={closeStudioModal}
        onSelectFormat={() => {}}
      />

      <CustomizeFlashcardsModal
        embedded
        isOpen={studioModal === "flashcards"}
        onClose={closeStudioModal}
        onGenerate={() => {}}
      />

      <CustomizeQuizModal
        embedded
        isOpen={studioModal === "quiz"}
        onClose={closeStudioModal}
        onGenerate={() => {}}
      />

      <CustomizeAudioModal
        embedded
        isOpen={studioModal === "audio"}
        onClose={closeStudioModal}
        onGenerate={() => {}}
      />

      <CustomizeWrittenQuestionsModal
        embedded
        isOpen={studioModal === "writtenQuestions"}
        onClose={closeStudioModal}
        onGenerate={() => {}}
      />

      <CustomizeInfographicModal
        embedded
        isOpen={studioModal === "infographic"}
        onClose={closeStudioModal}
        onGenerate={() => {}}
      />

      <CustomizeSpreadsheetsModal
        embedded
        isOpen={studioModal === "spreadsheets"}
        onClose={closeStudioModal}
        onGenerate={() => {}}
      />
    </div>
  );
}
