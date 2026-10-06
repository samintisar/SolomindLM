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
import { useCallback, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { type AuthFormInitialMode, AuthFormPanel } from "@/features/auth/components/AuthFormPanel";
import { useAuth } from "@/features/auth/useAuth";
import { CustomizeAudioModal } from "@/features/studio/components/CustomizeAudioModal";
import { CustomizeFlashcardsModal } from "@/features/studio/components/CustomizeFlashcardsModal";
import { CustomizeInfographicModal } from "@/features/studio/components/CustomizeInfographicModal";
import { CustomizeQuizModal } from "@/features/studio/components/CustomizeQuizModal";
import { CustomizeReportModal } from "@/features/studio/components/CustomizeReportModal";
import { CustomizeSpreadsheetsModal } from "@/features/studio/components/CustomizeSpreadsheetsModal";
import { CustomizeWrittenQuestionsModal } from "@/features/studio/components/CustomizeWrittenQuestionsModal";
import { ToolGrid } from "@/features/studio/components/ToolGrid";
import { Button } from "@/shared/components/ui/button";
import { Spinner } from "@/shared/components/ui/spinner";
import { STUDIO_TOOLS } from "@/shared/constants";
import { useToast } from "@/shared/contexts/useToast";
import { cn } from "@/shared/utils/cn";
import { isNativeShell } from "@/utils/platformDetection";

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
    "inline-flex size-5 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-bold text-primary-foreground align-middle transition-colors hover:bg-primary/90 active:bg-primary/80 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

  return (
    <div
      role="region"
      aria-label="Product preview"
      className="relative hidden h-full min-h-auth-hero w-full flex-col overflow-hidden rounded-3xl border border-border bg-background/90 text-left text-foreground shadow-2xl backdrop-blur-md lg:flex"
    >
      <div className="pointer-events-none absolute inset-0 chat-panel-graph-grid bg-background/88" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center px-4 pt-5 sm:pt-6">
        <div
          className="pointer-events-auto relative grid h-11 w-full max-w-68 grid-cols-2 rounded-2xl border border-border/80 bg-linear-to-b from-card/95 via-card/90 to-muted/30 p-1 shadow-lg backdrop-blur-md"
          role="tablist"
          aria-label="Preview mode"
        >
          <div
            data-mode={mode}
            className="pointer-events-none col-start-1 row-start-1 rounded-xl bg-background/95 shadow-md ring-1 ring-primary/20 transition-transform duration-320 ease-spring motion-reduce:transition-none data-[mode=studio]:translate-x-full"
            aria-hidden
          />
          <button
            type="button"
            role="tab"
            aria-selected={mode === "chat"}
            aria-controls="auth-hero-panel-chat"
            id="auth-hero-tab-chat"
            onClick={() => setMode("chat")}
            className={cn(
              "relative z-10 col-start-1 row-start-1 flex items-center justify-center gap-2 rounded-xl font-sans text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              mode === "chat" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <MessageCircle className="size-4 shrink-0 opacity-90" aria-hidden />
            Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "studio"}
            aria-controls="auth-hero-panel-studio"
            id="auth-hero-tab-studio"
            onClick={() => setMode("studio")}
            className={cn(
              "relative z-10 col-start-2 row-start-1 flex items-center justify-center gap-2 rounded-xl font-sans text-sm font-semibold transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              mode === "studio" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Layers className="size-4 shrink-0 opacity-90" aria-hidden />
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
              <aside className="flex w-2/5 max-w-54 shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-background/70 shadow-lg backdrop-blur-sm">
                <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-sm">
                  <FileStack className="size-4 shrink-0" aria-hidden />
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
                        className={cn(
                          "rounded-lg px-2.5 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                          active
                            ? "bg-primary/8 shadow-sm ring-2 ring-ring/40"
                            : "bg-surface-raised shadow-xs ring-1 ring-hairline hover:bg-accent/40"
                        )}
                      >
                        <p className="truncate font-sans text-xs font-medium text-foreground">
                          {s.title}
                        </p>
                        <p className="mt-0.5 font-sans text-xs text-muted-foreground">{s.kind}</p>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-background/70 shadow-lg backdrop-blur-sm">
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-sm">
                  <div className="flex items-center gap-2 text-foreground">
                    <MessageCircle className="size-4 shrink-0" aria-hidden />
                    <span className="font-display text-sm font-bold uppercase tracking-wide">
                      Chat
                    </span>
                  </div>
                  <div className="flex items-center gap-2" aria-hidden>
                    <span className="rounded-lg border border-border bg-card p-2 text-muted-foreground shadow-sm">
                      <PanelLeftOpen className="size-4" />
                    </span>
                    <span className="rounded-lg border border-border bg-card p-2 text-muted-foreground shadow-sm">
                      <PanelRightOpen className="size-4" />
                    </span>
                  </div>
                </div>

                <div className="chat-panel-graph-grid relative min-h-0 flex-1 overflow-y-auto bg-background">
                  <div className="relative flex flex-col gap-5 p-4 text-left sm:p-5">
                    <div className="flex flex-col items-end gap-1">
                      <div className="max-w-11/12 rounded-xl bg-primary/10 p-4 text-left font-serif text-base leading-relaxed text-foreground shadow-sm sm:text-lg">
                        What are the tradeoffs between 3NF and BCNF for our schema sketch?
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setActivityOpen((o) => !o)}
                        className="flex w-full items-center gap-2 rounded-lg bg-surface-raised px-3 py-2.5 text-left text-sm text-muted-foreground shadow-xs ring-1 ring-hairline transition hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Search className="size-4 shrink-0 text-primary/80" aria-hidden />
                        <span className="font-sans">Searching your sources</span>
                        <ChevronDown
                          className={cn(
                            "ml-auto size-4 shrink-0 transition",
                            activityOpen && "rotate-180"
                          )}
                          aria-hidden
                        />
                      </button>
                      {activityOpen ? (
                        <ul className="flex flex-col gap-1.5 border-l border-border/60 py-1 pl-3 font-sans text-xs text-muted-foreground">
                          <li className="flex items-center gap-2">
                            <Check className="size-3.5 shrink-0 text-success" aria-hidden />
                            HyDE + embeddings
                          </li>
                          <li className="flex items-center gap-2">
                            <Check className="size-3.5 shrink-0 text-success" aria-hidden />
                            Ranked relevant passages
                          </li>
                          <li className="flex items-start gap-2 pt-0.5">
                            <Globe className="mt-0.5 size-3.5 shrink-0 opacity-70" aria-hidden />
                            <span>Reading: CPSC 304 — notes.pdf</span>
                          </li>
                        </ul>
                      ) : null}
                    </div>

                    <div className="flex w-full flex-col items-start gap-1 text-left">
                      <div className="w-full max-w-4xl font-serif text-base leading-relaxed text-foreground sm:text-lg">
                        <div className="prose max-w-none font-serif text-base leading-relaxed text-foreground">
                          <p className="text-left text-base leading-relaxed">
                            BCNF removes every dependency where the determinant isn&apos;t a
                            superkey
                            <button
                              type="button"
                              aria-pressed={refKey === 1}
                              title="Reference 1"
                              onClick={() => setRefKey((k) => (k === 1 ? null : 1))}
                              className={cn(
                                citeBtnBase,
                                "mx-1",
                                refKey === 1 &&
                                  "ring-2 ring-primary/55 ring-offset-2 ring-offset-background"
                              )}
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
                              className={cn(
                                citeBtnBase,
                                "mx-1",
                                refKey === 2 &&
                                  "ring-2 ring-primary/55 ring-offset-2 ring-offset-background"
                              )}
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
                    className={cn(
                      "flex items-center gap-2 rounded-xl bg-surface-raised px-3 py-2 shadow-sm ring-1 ring-hairline transition",
                      inputFlash && "ring-2 ring-primary/35"
                    )}
                  >
                    <div className="h-2 min-w-0 flex-1 rounded-full bg-muted/80" />
                    <button
                      type="button"
                      onClick={flashInput}
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Send (demo)"
                    >
                      <Send className="size-4" aria-hidden />
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
                  <Layers className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="font-display text-sm font-bold uppercase tracking-wide text-foreground">
                    Studio
                  </span>
                  <span className="ml-2 min-w-0 flex-1 truncate font-sans text-xs text-muted-foreground">
                    Create study artifacts from your sources
                  </span>
                </div>
                <div className="chat-panel-graph-grid relative min-h-0 flex-1 overflow-y-auto bg-background">
                  <div className="p-4 sm:p-5">
                    <ToolGrid
                      tools={STUDIO_TOOLS}
                      onToolClick={handleStudioToolClick}
                      activeToolId={studioModal}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <CustomizeReportModal
        theme="light"
        preview
        isOpen={studioModal === "reports"}
        onClose={closeStudioModal}
        onSelectFormat={() => {
          afterPreviewAction();
        }}
      />

      <CustomizeFlashcardsModal
        theme="light"
        preview
        isOpen={studioModal === "flashcards"}
        onClose={closeStudioModal}
        onGenerate={() => {
          afterPreviewAction();
        }}
      />

      <CustomizeQuizModal
        theme="light"
        preview
        isOpen={studioModal === "quiz"}
        onClose={closeStudioModal}
        onGenerate={() => {
          afterPreviewAction();
        }}
      />

      <CustomizeAudioModal
        theme="light"
        preview
        isOpen={studioModal === "audio"}
        onClose={closeStudioModal}
        onGenerate={() => {
          afterPreviewAction();
        }}
      />

      <CustomizeWrittenQuestionsModal
        theme="light"
        preview
        isOpen={studioModal === "writtenQuestions"}
        onClose={closeStudioModal}
        onGenerate={() => {
          afterPreviewAction();
        }}
      />

      <CustomizeInfographicModal
        theme="light"
        preview
        isOpen={studioModal === "infographic"}
        onClose={closeStudioModal}
        onGenerate={() => {
          afterPreviewAction();
        }}
      />

      <CustomizeSpreadsheetsModal
        theme="light"
        preview
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
    <div className="auth-form-light flex min-h-screen flex-col bg-card text-foreground antialiased">
      <div className="pointer-events-none fixed inset-0 bg-auth-glow opacity-40" aria-hidden />

      <header className="relative z-1 flex shrink-0 items-center justify-between px-6 py-5 sm:px-10">
        {nativeShell ? (
          <div className="flex items-center gap-2.5 text-foreground">
            <img src="/SolomindLM_logo.png" alt="SolomindLM" className="size-8 object-contain" />
            <span className="font-serif text-lg font-semibold tracking-tight">SolomindLM</span>
          </div>
        ) : (
          <>
            <Link
              to="/"
              className="flex items-center gap-2.5 text-foreground transition hover:opacity-80"
              aria-label="SolomindLM home"
            >
              <img src="/SolomindLM_logo.png" alt="SolomindLM" className="size-8 object-contain" />
              <span className="font-serif text-lg font-semibold tracking-tight">SolomindLM</span>
            </Link>
            <Button asChild variant="outline" size="sm">
              <Link to="/">Back to home</Link>
            </Button>
          </>
        )}
      </header>

      <main className="chat-panel-graph-grid relative z-1 flex min-h-0 flex-1 flex-col justify-center overflow-y-auto bg-card px-6 py-10 sm:px-10 sm:py-12">
        <div
          className={cn(
            "mx-auto flex w-full flex-col",
            nativeShell
              ? "max-w-lg gap-8 py-4"
              : "max-w-7xl -translate-y-4 gap-12 sm:-translate-y-6 lg:-translate-y-10 lg:flex-row lg:items-stretch lg:gap-10 xl:gap-14 2xl:max-w-360"
          )}
        >
          <div className="flex w-full justify-center lg:min-h-0 lg:w-lg lg:shrink-0 lg:justify-end">
            <div className="flex w-full max-w-lg flex-col lg:h-full lg:min-h-0">
              <div className="flex w-full flex-col items-center lg:h-full lg:min-h-0 lg:justify-center">
                <div className="w-full">
                  {!nativeShell && (
                    <div className="relative z-10 px-2 text-center animate-in fade-in slide-in-from-bottom-2 duration-320 ease-out sm:px-0 lg:pointer-events-none">
                      <h1 className="mx-auto text-balance font-serif text-4xl font-normal leading-tight tracking-tight text-foreground sm:text-5xl lg:text-display">
                        Think deeper,
                        <br />
                        learn faster.
                      </h1>
                      <p className="mx-auto mt-3 max-w-md font-sans text-base text-muted-foreground sm:mt-4 sm:text-lg">
                        Ground your research in real sources.
                      </p>
                    </div>
                  )}
                  <div
                    className={cn(
                      "relative z-0 animate-in fade-in slide-in-from-bottom-2 duration-320 ease-out delay-80 fill-mode-backwards",
                      nativeShell ? "mt-2" : "mt-10 lg:mt-8"
                    )}
                  >
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
            <div className="flex h-full min-h-0 w-full justify-center animate-in fade-in slide-in-from-bottom-2 duration-320 ease-out delay-160 fill-mode-backwards lg:min-h-auth-hero lg:min-w-0 lg:flex-1 lg:justify-start">
              <AuthHeroMockup />
            </div>
          )}
        </div>
      </main>

      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-card/85 backdrop-blur-sm">
          <Spinner className="size-9" />
        </div>
      )}
    </div>
  );
}
