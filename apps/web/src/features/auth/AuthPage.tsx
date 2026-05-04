import { useCallback, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
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
import { useAuth } from "@/features/auth/useAuth";
import { isNativeShell } from "@/utils/platformDetection";
import { AuthFormPanel, type AuthFormInitialMode } from "@/features/auth/components/AuthFormPanel";
import { CreateReportModal } from "@/features/studio/components/CreateReportModal";
import { CustomizeAudioModal } from "@/features/studio/components/CustomizeAudioModal";
import { CustomizeFlashcardsModal } from "@/features/studio/components/CustomizeFlashcardsModal";
import { CustomizeQuizModal } from "@/features/studio/components/CustomizeQuizModal";
import { CustomizeInfographicModal } from "@/features/studio/components/CustomizeInfographicModal";
import { CustomizeSpreadsheetsModal } from "@/features/studio/components/CustomizeSpreadsheetsModal";
import { CustomizeWrittenQuestionsModal } from "@/features/studio/components/CustomizeWrittenQuestionsModal";
import { ToolGrid } from "@/features/studio/components/ToolGrid";
import { useToast } from "@/shared/contexts/useToast";
import { STUDIO_TOOLS } from "@/shared/constants";

type HeroMode = "chat" | "studio";

type AuthStudioPreviewModal =
  | null
  | "reports"
  | "flashcards"
  | "quiz"
  | "infographic"
  | "audio"
  | "writtenQuestions"
  | "spreadsheets";

function AuthHeroMockup() {
  const { info } = useToast();
  const [mode, setMode] = useState<HeroMode>("chat");
  const [sourceId, setSourceId] = useState<string>("s1");
  const [refKey, setRefKey] = useState<1 | 2 | null>(1);
  const [activityOpen, setActivityOpen] = useState(true);
  const [studioModal, setStudioModal] = useState<AuthStudioPreviewModal>(null);
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

  const afterPreviewAction = useCallback(() => {
    closeStudioModal();
    info("Sign in to generate this in your notebook.");
  }, [closeStudioModal, info]);

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
      aria-label="Product preview"
      className="relative hidden h-full min-h-[min(93svh,65rem)] w-full flex-col overflow-hidden rounded-3xl border border-border bg-background/90 text-left text-foreground shadow-[0_28px_90px_-28px_rgba(28,25,23,0.22)] backdrop-blur-md lg:flex"
    >
      <div
        className="pointer-events-none absolute inset-0 chat-panel-graph-grid"
        style={{ backgroundColor: "color-mix(in oklch, var(--background) 88%, transparent)" }}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-4 pt-5 sm:pt-6">
        <div
          className="pointer-events-auto relative flex h-11 w-[min(100%,17rem)] items-stretch gap-1 rounded-2xl border border-border/80 bg-linear-to-b from-card/95 via-card/90 to-muted/30 p-1 shadow-[0_8px_30px_-8px_rgba(28,25,23,0.18),inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-md"
          role="tablist"
          aria-label="Preview mode"
        >
          <div
            className="pointer-events-none absolute left-1 top-1 bottom-1 w-[calc(50%-6px)] rounded-xl bg-background/95 shadow-md ring-1 ring-primary/20 transition-transform duration-300 ease-[cubic-bezier(0.34,1.2,0.64,1)]"
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
            aria-controls="auth-hero-panel-chat"
            id="auth-hero-tab-chat"
            onClick={() => setMode("chat")}
            className={`relative z-10 flex flex-1 items-center justify-center gap-2 rounded-xl font-sans text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              mode === "chat" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <MessageCircle className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "studio"}
            aria-controls="auth-hero-panel-studio"
            id="auth-hero-tab-studio"
            onClick={() => setMode("studio")}
            className={`relative z-10 flex flex-1 items-center justify-center gap-2 rounded-xl font-sans text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              mode === "studio" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            Studio
          </button>
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <div
            id="auth-hero-panel-chat"
            role="tabpanel"
            aria-labelledby="auth-hero-tab-chat"
            hidden={mode !== "chat"}
            className="absolute inset-0 flex min-h-0 flex-col gap-3 overflow-hidden pt-20 sm:pt-21"
          >
          <div className="flex min-h-0 flex-1 gap-3 px-4 pb-4 pt-1 sm:gap-4 sm:px-5 sm:pb-5">
            <aside className="flex w-[min(38%,13.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-background/70 shadow-lg backdrop-blur-sm">
              <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-sm">
                <FileStack className="h-4 w-4 shrink-0" aria-hidden />
                <span className="font-display text-sm font-bold uppercase tracking-wide">
                  Sources
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4 sm:p-5">
                {sources.map((s) => {
                  const active = sourceId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSourceId(s.id)}
                      className={`rounded-lg border px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                        active
                          ? "border-primary/50 bg-primary/8 shadow-sm"
                          : "border-border/80 bg-background/60 hover:border-border hover:bg-accent/40"
                      }`}
                    >
                      <p className="truncate font-sans text-xs font-medium text-foreground">
                        {s.title}
                      </p>
                      <p className="mt-0.5 font-sans text-[11px] text-muted-foreground">{s.kind}</p>
                    </button>
                  );
                })}
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-background/70 shadow-lg backdrop-blur-sm">
              <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-foreground">
                  <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="font-display text-sm font-bold uppercase tracking-wide">
                    Chat
                  </span>
                </div>
                <div className="flex items-center gap-2" aria-hidden>
                  <span className="rounded-lg border border-border bg-card p-2 text-muted-foreground shadow-sm">
                    <PanelLeftOpen className="h-4 w-4" />
                  </span>
                  <span className="rounded-lg border border-border bg-card p-2 text-muted-foreground shadow-sm">
                    <PanelRightOpen className="h-4 w-4" />
                  </span>
                </div>
              </div>

              <div
                className="chat-panel-graph-grid relative min-h-0 flex-1 overflow-y-auto"
                style={{ backgroundColor: "var(--background)" }}
              >
                <div className="relative space-y-5 p-4 text-left sm:p-5">
                  <div className="flex flex-col items-end gap-1">
                    <div className="max-w-[95%] rounded-xl bg-[color-mix(in_oklch,var(--primary)_10%,var(--background))] p-4 text-left font-serif text-base leading-relaxed text-foreground shadow-sm sm:text-lg">
                      What are the tradeoffs between 3NF and BCNF for our schema sketch?
                    </div>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setActivityOpen((o) => !o)}
                      className="flex w-full items-center gap-2 rounded-lg border border-border bg-card/90 px-3 py-2.5 text-left text-sm text-muted-foreground shadow-sm transition hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Search className="h-4 w-4 shrink-0 text-primary/80" aria-hidden />
                      <span className="font-sans">Searching your sources</span>
                      <ChevronDown
                        className={`ml-auto h-4 w-4 shrink-0 transition ${activityOpen ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                    </button>
                    {activityOpen ? (
                      <ul className="space-y-1.5 border-l-2 border-primary/20 py-1 pl-3 font-sans text-xs text-muted-foreground">
                        <li className="flex items-center gap-2">
                          <Check
                            className="h-3.5 w-3.5 shrink-0 text-vintage-green-600"
                            aria-hidden
                          />
                          HyDE + embeddings
                        </li>
                        <li className="flex items-center gap-2">
                          <Check
                            className="h-3.5 w-3.5 shrink-0 text-vintage-green-600"
                            aria-hidden
                          />
                          Ranked relevant passages
                        </li>
                        <li className="flex items-start gap-2 pt-0.5">
                          <Globe className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                          <span>Reading: CPSC 304 — notes.pdf</span>
                        </li>
                      </ul>
                    ) : null}
                  </div>

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
                          . Third normal form still allows some dependencies when the right-hand
                          side is a prime attribute
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
                          className="mt-4 max-h-52 w-full max-w-md overflow-y-auto rounded-2xl border border-border bg-popover p-5 text-left shadow-xl animate-in fade-in zoom-in-95 duration-200"
                          role="note"
                          aria-label={`Reference ${refKey}`}
                        >
                          <p className="mb-2 font-mono text-xs font-bold uppercase tracking-widest text-muted-foreground">
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

              <div className="shrink-0 border-t border-border bg-background/90 p-3 backdrop-blur-sm">
                <div
                  className={`flex items-center gap-2 rounded-xl border border-input bg-card px-3 py-2 shadow-sm transition ${
                    inputFlash ? "ring-2 ring-primary/35" : ""
                  }`}
                >
                  <div className="h-2 min-w-0 flex-1 rounded-full bg-muted/80" />
                  <button
                    type="button"
                    onClick={flashInput}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Send (demo)"
                  >
                    <Send className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

          <div
            id="auth-hero-panel-studio"
            role="tabpanel"
            aria-labelledby="auth-hero-tab-studio"
            hidden={mode !== "studio"}
            className="absolute inset-0 flex min-h-0 flex-col overflow-hidden pt-20 sm:pt-21"
          >
            <div className="flex min-h-0 flex-1 px-4 pb-4 pt-1 sm:px-5 sm:pb-5">
              <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-background/70 shadow-lg backdrop-blur-sm">
                <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-sm sm:px-5">
                  <Layers className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
                    Studio
                  </span>
                  <span className="ml-2 min-w-0 flex-1 truncate font-sans text-xs text-muted-foreground">
                    Create study artifacts from your sources
                  </span>
                </div>
                <div
                  className="chat-panel-graph-grid relative min-h-0 flex-1 overflow-y-auto"
                  style={{ backgroundColor: "var(--background)" }}
                >
                  <div className="p-4 sm:p-5">
                    <ToolGrid
                      tools={STUDIO_TOOLS}
                      onToolClick={handleStudioToolClick}
                      width={420}
                      activeToolId={studioModal}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CreateReportModal
        isOpen={studioModal === "reports"}
        onClose={closeStudioModal}
        onSelectFormat={() => {
          afterPreviewAction();
        }}
      />

      <CustomizeFlashcardsModal
        isOpen={studioModal === "flashcards"}
        onClose={closeStudioModal}
        onGenerate={() => {
          afterPreviewAction();
        }}
      />

      <CustomizeQuizModal
        isOpen={studioModal === "quiz"}
        onClose={closeStudioModal}
        onGenerate={() => {
          afterPreviewAction();
        }}
      />

      <CustomizeAudioModal
        isOpen={studioModal === "audio"}
        onClose={closeStudioModal}
        onGenerate={() => {
          afterPreviewAction();
        }}
      />

      <CustomizeWrittenQuestionsModal
        isOpen={studioModal === "writtenQuestions"}
        onClose={closeStudioModal}
        onGenerate={() => {
          afterPreviewAction();
        }}
      />

      <CustomizeInfographicModal
        isOpen={studioModal === "infographic"}
        onClose={closeStudioModal}
        onGenerate={() => {
          afterPreviewAction();
        }}
      />

      <CustomizeSpreadsheetsModal
        isOpen={studioModal === "spreadsheets"}
        onClose={closeStudioModal}
        onGenerate={() => {
          afterPreviewAction();
        }}
      />
    </div>
  );
}

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const nativeShell = isNativeShell();

  const { returnTo, bannerMessage, initialMode } = useMemo(() => {
    const state = location.state as { from?: string; message?: string } | null | undefined;
    const rawFrom = state?.from;
    const fromPath = typeof rawFrom === "string" && rawFrom.startsWith("/") ? rawFrom : "/home";
    const modeParam = new URLSearchParams(location.search).get("mode");
    const mode: AuthFormInitialMode = modeParam === "signup" ? "signUp" : "signIn";
    return {
      returnTo: fromPath,
      bannerMessage: state?.message,
      initialMode: mode,
    };
  }, [location.state, location.search]);

  const handleAuthenticated = () => {
    navigate(returnTo, { replace: true });
  };

  if (!isLoading && isAuthenticated) {
    return <Navigate to={returnTo} replace />;
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#FDFBF7] text-stone-900 antialiased">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.4]"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% -20%, rgba(166,141,118,0.12), transparent), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(142, 180, 160, 0.08), transparent)",
        }}
      />

      <header className="relative z-1 flex shrink-0 items-center justify-between px-6 py-5 sm:px-10">
        {nativeShell ? (
          <div className="flex items-center gap-2.5 text-stone-900">
            <img src="/SolomindLM_logo.png" alt="" className="h-8 w-8 object-contain" />
            <span className="font-serif text-lg font-semibold tracking-tight">SolomindLM</span>
          </div>
        ) : (
          <>
            <Link
              to="/"
              className="flex items-center gap-2.5 text-stone-900 transition hover:opacity-80"
              aria-label="SolomindLM home"
            >
              <img src="/SolomindLM_logo.png" alt="" className="h-8 w-8 object-contain" />
              <span className="font-serif text-lg font-semibold tracking-tight">SolomindLM</span>
            </Link>
            <Link
              to="/"
              className="rounded-xl border border-stone-300/80 bg-white/60 px-4 py-2 text-base font-sans font-medium text-stone-700 shadow-sm transition hover:bg-white"
            >
              Back to home
            </Link>
          </>
        )}
      </header>

      <main
        className="chat-panel-graph-grid relative z-1 flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-6 py-10 sm:px-10 sm:py-12"
        style={{ backgroundColor: "#FDFBF7" }}
      >
        <div
          className={
            nativeShell
              ? "mx-auto grid w-full max-w-lg grid-cols-1 gap-8 py-4"
              : "mx-auto grid w-full max-w-7xl -translate-y-4 grid-cols-1 gap-12 sm:-translate-y-6 lg:grid-cols-[minmax(0,32rem)_minmax(0,1fr)] lg:items-stretch lg:gap-x-10 lg:gap-y-8 lg:-translate-y-10 xl:gap-x-14 2xl:max-w-360"
          }
        >
          <div className="flex w-full justify-center lg:h-full lg:min-h-0 lg:justify-end">
            <div className="flex w-full max-w-lg flex-col lg:h-full lg:min-h-0">
              <div className="flex w-full flex-col items-center lg:h-full lg:min-h-0 lg:justify-center">
                <div className="w-full">
                  {!nativeShell && (
                    <div className="relative z-10 px-2 text-center sm:px-0 lg:pointer-events-none">
                      <h1 className="mx-auto max-w-[18ch] font-serif text-4xl font-normal leading-tight tracking-tight text-stone-900 sm:max-w-none sm:text-5xl lg:text-[2.75rem]">
                        Think deeper,
                        <br />
                        learn faster.
                      </h1>
                      <p className="mx-auto mt-3 max-w-md font-sans text-base text-stone-600 sm:mt-4 sm:text-lg">
                        Ground your research in real sources.
                      </p>
                    </div>
                  )}
                  <div className={nativeShell ? "relative z-0 mt-2" : "relative z-0 mt-10 lg:mt-8"}>
                    <AuthFormPanel
                      authError={bannerMessage}
                      onAuthenticated={handleAuthenticated}
                      initialMode={initialMode}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {!nativeShell && (
            <div className="flex h-full w-full min-h-0 justify-center lg:min-h-[min(93svh,65rem)] lg:justify-start">
              <AuthHeroMockup />
            </div>
          )}
        </div>
      </main>

      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#FDFBF7]/85 backdrop-blur-sm">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-stone-200 border-t-primary" />
        </div>
      )}
    </div>
  );
}
