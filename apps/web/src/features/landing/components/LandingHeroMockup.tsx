import { useCallback, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  FileStack,
  FileText,
  Globe,
  HardDrive,
  Layers,
  MessageCircle,
  PanelLeftOpen,
  PanelRightOpen,
  Search,
  Send,
  Video,
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
      { id: "s1", title: "Mixtral 8x7B — Technical Report.pdf", kind: "PDF", icon: FileText, color: "text-orange-500" },
      { id: "s2", title: "DeepSeek-V2: Efficient MoE LLM", kind: "Article", icon: Globe, color: "text-blue-500" },
      { id: "s3", title: "Switch Transformers (Google)", kind: "PDF", icon: FileText, color: "text-red-500" },
      { id: "s4", title: "Mixture of Experts Explained", kind: "YouTube", icon: Video, color: "text-red-600" },
      { id: "s5", title: "Efficient LLMs: A Survey (2024)", kind: "Article", icon: Globe, color: "text-emerald-500" },
      { id: "s6", title: "Google Drive: MoE Research", kind: "Google Drive", icon: HardDrive, color: "text-cyan-500" },
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
          sourceTitle: "Mixtral 8x7B — Technical Report.pdf",
          excerpt:
            "Mixtral 8x7B uses a sparse mixture-of-experts architecture with 8 expert networks, each 7B parameters. For every token, only 2 experts are activated (12B active parameters out of 46B total), enabling faster inference than a 70B dense model while matching its quality on most benchmarks.",
        },
        2: {
          sourceTitle: "DeepSeek-V2: Efficient MoE LLM",
          excerpt:
            "DeepSeek-V2 achieves training cost reduction of 5× compared to dense models through multi-head latent attention (MLA) and a fine-grained MoE architecture with shared experts. The model activates only 21B parameters per token out of 236B total (8.9% sparsity).",
        },
      }) as const,
    []
  );

  const citeBtnBase =
    "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground align-middle transition-colors hover:bg-primary/90 active:bg-primary/80";

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
        <div className="flex min-h-0 flex-1 gap-3 px-4 pb-4 pt-0.5 sm:gap-4 sm:px-5 sm:pb-5 md:gap-5 md:px-6">
          <aside className="flex w-[min(42%,14rem)] shrink-0 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-sm backdrop-blur-sm sm:w-[min(42%,15rem)]">
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/40 bg-background/60 px-4 backdrop-blur-sm sm:h-14 sm:px-5">
              <FileStack className="h-4 w-4 shrink-0 text-muted-foreground sm:h-5 sm:w-5" aria-hidden />
              <span className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground sm:text-sm">
                Sources
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3 sm:gap-3 sm:p-4">
              {sources.map((s) => {
                const active = sourceId === s.id;
                const Icon = s.icon;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSourceId(s.id)}
                    className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:px-3.5 sm:py-3 ${
                      active
                        ? "border-primary/30 bg-primary/[0.06] shadow-sm"
                        : "border-transparent bg-background/40 hover:border-border/60 hover:bg-accent/30"
                    }`}
                  >
                    <div className={`mt-0.5 shrink-0 rounded-lg bg-background p-1.5 shadow-sm sm:p-2`}>
                      <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${s.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-sans text-[11px] font-semibold text-foreground leading-snug sm:text-xs">
                        {s.title}
                      </p>
                      <p className="mt-0.5 font-sans text-[10px] text-muted-foreground/70 sm:text-[11px]">
                        {s.kind}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/40 shadow-sm backdrop-blur-sm">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/40 bg-background/60 px-4 backdrop-blur-sm sm:h-14 sm:px-5">
              <div className="flex items-center gap-2 text-foreground sm:gap-2.5">
                <MessageCircle className="h-4 w-4 shrink-0 sm:h-5 sm:w-5" aria-hidden />
                <span className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground sm:text-sm">
                  Chat
                </span>
              </div>
              <div className="flex items-center gap-1.5" aria-hidden>
                <span className="rounded-lg border border-border/60 bg-card p-1.5 text-muted-foreground/60 shadow-sm sm:p-2">
                  <PanelLeftOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </span>
                <span className="rounded-lg border border-border/60 bg-card p-1.5 text-muted-foreground/60 shadow-sm sm:p-2">
                  <PanelRightOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </span>
              </div>
            </div>

            <div
              className="chat-panel-graph-grid relative min-h-0 flex-1 overflow-y-auto"
              style={{ backgroundColor: "var(--background)" }}
            >
              <div className="relative space-y-4 p-4 text-left sm:space-y-6 sm:p-5 md:p-6">
                <div className="flex flex-col items-end gap-1">
                  <div className="max-w-[90%] rounded-2xl bg-[color-mix(in_oklch,var(--primary)_8%,var(--background))] p-3.5 text-left font-serif text-sm leading-relaxed text-foreground shadow-sm sm:rounded-2xl sm:p-4 sm:text-base">
                    What are the tradeoffs between mixture-of-experts and dense architectures for LLMs?
                  </div>
                </div>

                <div className="space-y-2 sm:space-y-2.5">
                  <button
                    type="button"
                    onClick={() => setActivityOpen((o) => !o)}
                    className="flex w-full items-center gap-2.5 rounded-xl border border-border/50 bg-card/70 px-3 py-2 text-left text-xs text-muted-foreground shadow-sm transition hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3.5 sm:py-2.5 sm:text-sm"
                  >
                    <Search
                      className="h-3.5 w-3.5 shrink-0 text-primary/70 sm:h-4 sm:w-4"
                      aria-hidden
                    />
                    <span className="font-sans">Searching your sources</span>
                    <ChevronDown
                      className={`ml-auto h-3.5 w-3.5 shrink-0 transition sm:h-4 sm:w-4 ${activityOpen ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </button>
                  {activityOpen ? (
                    <ul className="space-y-1.5 border-l-2 border-primary/15 py-1.5 pl-3 font-sans text-[11px] text-muted-foreground/80 sm:space-y-2 sm:pl-4 sm:text-xs">
                      <li className="flex items-center gap-2 sm:gap-2.5">
                        <Check
                          className="h-3.5 w-3.5 shrink-0 text-emerald-600/80 sm:h-4 sm:w-4"
                          aria-hidden
                        />
                        HyDE + embeddings
                      </li>
                      <li className="flex items-center gap-2 sm:gap-2.5">
                        <Check
                          className="h-3.5 w-3.5 shrink-0 text-emerald-600/80 sm:h-4 sm:w-4"
                          aria-hidden
                        />
                        Ranked relevant passages
                      </li>
                      <li className="flex items-start gap-2 pt-0.5 sm:gap-2.5">
                        <Globe
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60 sm:h-4 sm:w-4"
                          aria-hidden
                        />
                        <span>Reading: Mixtral 8x7B — Technical Report.pdf</span>
                      </li>
                    </ul>
                  ) : null}
                </div>

                <div className="flex w-full flex-col items-start gap-1 text-left">
                  <div className="w-full max-w-3xl font-serif text-sm leading-relaxed text-foreground sm:text-base">
                    <div className="prose max-w-none space-y-3 font-serif text-sm leading-relaxed text-foreground sm:space-y-4 sm:text-base">
                      <p className="text-left">
                        MoE architectures activate only a subset of parameters per token, achieving
                        better inference efficiency
                        <button
                          type="button"
                          aria-pressed={refKey === 1}
                          title="Reference 1"
                          onClick={() => setRefKey((k) => (k === 1 ? null : 1))}
                          className={`${citeBtnBase} mx-1 ${refKey === 1 ? "ring-2 ring-primary/40 ring-offset-2 ring-offset-background" : ""}`}
                          style={{ verticalAlign: "middle" }}
                        >
                          1
                        </button>
                        . Dense models use all parameters for every token, which simplifies
                        deployment but increases compute costs significantly at scale
                        <button
                          type="button"
                          aria-pressed={refKey === 2}
                          title="Reference 2"
                          onClick={() => setRefKey((k) => (k === 2 ? null : 2))}
                          className={`${citeBtnBase} mx-1 ${refKey === 2 ? "ring-2 ring-primary/40 ring-offset-2 ring-offset-background" : ""}`}
                          style={{ verticalAlign: "middle" }}
                        >
                          2
                        </button>
                        . For production, MoE excels when batch sizes are large and latency
                        requirements are moderate, while dense models remain preferable for
                        low-latency applications.
                      </p>
                    </div>

                    {refKey !== null ? (
                      <div
                        className="mt-4 max-h-44 w-full max-w-lg overflow-y-auto rounded-2xl border border-border/60 bg-popover p-4 text-left shadow-lg animate-in fade-in zoom-in-95 duration-200 sm:mt-5 sm:max-h-48 sm:p-5"
                        role="note"
                        aria-label={`Reference ${refKey}`}
                      >
                        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 sm:text-xs">
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

            <div className="shrink-0 border-t border-border/40 bg-background/80 p-2.5 backdrop-blur-sm sm:p-3">
              <div
                className={`flex items-center gap-2.5 rounded-xl border border-input/60 bg-card/80 px-3 py-2 shadow-sm transition sm:px-3.5 sm:py-2.5 ${
                  inputFlash ? "ring-2 ring-primary/25" : ""
                }`}
              >
                <div className="h-2.5 min-w-0 flex-1 rounded-full bg-muted/60" />
                <button
                  type="button"
                  onClick={flashInput}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:w-9"
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
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/40 bg-background/60 px-4 backdrop-blur-sm sm:h-14 sm:gap-2.5 sm:px-6">
          <Layers className="h-4 w-4 text-muted-foreground/60 sm:h-5 sm:w-5" aria-hidden />
          <span className="font-display text-xs font-bold uppercase tracking-wide text-muted-foreground sm:text-sm">
            Studio
          </span>
          <span className="hidden font-sans text-[10px] text-muted-foreground/50 sm:ml-2 sm:inline sm:text-xs">
            Create study artifacts from your sources
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6 md:px-8">
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
        showDiscoverPrompts={false}
        isOpen={studioModal === "reports"}
        onClose={closeStudioModal}
        onSelectFormat={() => {}}
      />

      <CustomizeFlashcardsModal
        embedded
        showDiscoverPrompts={false}
        isOpen={studioModal === "flashcards"}
        onClose={closeStudioModal}
        onGenerate={() => {}}
      />

      <CustomizeQuizModal
        embedded
        showDiscoverPrompts={false}
        isOpen={studioModal === "quiz"}
        onClose={closeStudioModal}
        onGenerate={() => {}}
      />

      <CustomizeAudioModal
        embedded
        showDiscoverPrompts={false}
        isOpen={studioModal === "audio"}
        onClose={closeStudioModal}
        onGenerate={() => {}}
      />

      <CustomizeWrittenQuestionsModal
        embedded
        showDiscoverPrompts={false}
        isOpen={studioModal === "writtenQuestions"}
        onClose={closeStudioModal}
        onGenerate={() => {}}
      />

      <CustomizeInfographicModal
        embedded
        showDiscoverPrompts={false}
        isOpen={studioModal === "infographic"}
        onClose={closeStudioModal}
        onGenerate={() => {}}
      />

      <CustomizeSpreadsheetsModal
        embedded
        showDiscoverPrompts={false}
        isOpen={studioModal === "spreadsheets"}
        onClose={closeStudioModal}
        onGenerate={() => {}}
      />
    </div>
  );
}
