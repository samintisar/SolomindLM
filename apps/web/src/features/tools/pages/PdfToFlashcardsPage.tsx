import {
  FREE_FLASHCARD_CARD_COUNTS,
  FREE_FLASHCARD_DEFAULT_CARD_COUNT,
  FREE_FLASHCARD_MAX_WORDS,
  type FreeFlashcardCardCount,
  truncateToWords,
} from "@convex/_lib/freeToolBounds";
import { Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useAuth } from "@/features/auth/useAuth";
import { Footer } from "@/features/landing/components/Footer";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Button } from "@/shared/components/ui/button";
import { Spinner } from "@/shared/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/shared/components/ui/toggle-group";
import { useToast } from "@/shared/contexts/useToast";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { isNativeShell } from "@/utils/platformDetection";
import { DeckPreview } from "../components/DeckPreview";
import { ExportBar } from "../components/ExportBar";
import { SourceInput, type SourceState } from "../components/SourceInput";
import { useClaimPendingDeck } from "../hooks/useClaimPendingDeck";
import { useTurnstile } from "../hooks/useTurnstile";
import {
  type FreeDeck,
  type GenerateFreeDeckResult,
  generateFreeDeck,
} from "../lib/freeToolClient";
import { invalidTextMessage } from "../lib/invalidTextMessage";
import { savePendingDeck } from "../lib/pendingDeck";
import { isTurnstileChallengeFailure } from "../lib/turnstileErrors";
import { PDF_TO_FLASHCARDS_PAGE as PAGE } from "../toolPages";

type Status =
  | { kind: "idle" }
  | { kind: "generating" }
  | { kind: "done"; deck: FreeDeck; sourceText: string }
  | { kind: "error"; title: string; message: string; signup?: boolean };

const hoursUntil = (ms: number) => Math.max(1, Math.ceil(ms / 3_600_000));

function statusForResult(result: Exclude<GenerateFreeDeckResult, { kind: "ok" }>): Status {
  switch (result.kind) {
    case "captcha":
      return { kind: "error", title: "Verification failed", message: "Please try again." };
    case "limited":
      return result.scope === "ip"
        ? {
            kind: "error",
            title: "You've reached today's free limit",
            message: `Free decks reset in about ${hoursUntil(result.retryAfterMs)} hours. A free account gives you more decks every day.`,
            signup: true,
          }
        : {
            kind: "error",
            title: "The free tool is busy today",
            message: "Create a free account to keep generating flashcards right away.",
            signup: true,
          };
    case "invalid":
      return { kind: "error", ...invalidTextMessage(result.error) };
    default:
      return {
        kind: "error",
        title: "Something went wrong",
        message: "Generation failed. Try again in a moment.",
      };
  }
}

/** Saves a pending deck once signed in; remounted (new key) to retry for an already signed-in visitor. */
function PendingDeckClaimer({ onSettled }: { onSettled: () => void }) {
  useClaimPendingDeck(onSettled);
  return null;
}

export default function PdfToFlashcardsPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const turnstileContainer = useRef<HTMLDivElement>(null);
  const { getToken } = useTurnstile(turnstileContainer);
  const [source, setSource] = useState<SourceState | null>(null);
  const [cardCount, setCardCount] = useState<FreeFlashcardCardCount>(
    FREE_FLASHCARD_DEFAULT_CARD_COUNT
  );
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [authOpen, setAuthOpen] = useState(false);
  const [claimRun, setClaimRun] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const toast = useToast();

  if (isNativeShell()) {
    if (isLoading) return <div className="min-h-screen bg-background" />;
    return <Navigate to={isAuthenticated ? "/home" : "/sign-in"} replace />;
  }

  const generate = async () => {
    if (!source) return;
    const { text } = truncateToWords(source.text, FREE_FLASHCARD_MAX_WORDS);
    setStatus({ kind: "generating" });

    // Turnstile tokens are single-use; one rejected token gets one fresh retry.
    let result: GenerateFreeDeckResult | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      let turnstileToken: string;
      try {
        turnstileToken = await getToken();
      } catch (error) {
        setStatus(
          isTurnstileChallengeFailure(error)
            ? {
                kind: "error",
                title: "Security check failed",
                message: "Try refreshing the page or using a different browser.",
              }
            : {
                kind: "error",
                title: "We couldn't verify your browser",
                message:
                  "Check that nothing is blocking challenges.cloudflare.com, then try again.",
              }
        );
        return;
      }
      result = await generateFreeDeck({ text, cardCount, turnstileToken });
      if (result.kind !== "captcha") break;
    }

    if (result?.kind === "ok") {
      setStatus({ kind: "done", deck: result.deck, sourceText: text });
    } else {
      setStatus(statusForResult(result ?? { kind: "captcha" }));
    }
  };

  const saveDeck = () => {
    if (status.kind !== "done" || claiming) return;
    const saved = savePendingDeck({
      title: status.deck.title,
      sourceText: status.sourceText,
      cards: status.deck.cards,
    });
    if (!saved) {
      toast.error("Couldn't save this deck in your browser. Export it instead.");
      return;
    }
    if (isAuthenticated) {
      setClaiming(true);
      setClaimRun((run) => run + 1);
    } else {
      setAuthOpen(true);
    }
  };

  return (
    <>
      <SEOMeta
        pagePath={PAGE.path}
        title={PAGE.title}
        description={PAGE.description}
        keywords={PAGE.keywords}
      />
      <PendingDeckClaimer key={claimRun} onSettled={() => setClaiming(false)} />
      <div className="min-h-screen landing-grid-pattern">
        <header className="sticky top-0 z-50 border-b border-border/60 bg-card/40 backdrop-blur-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 sm:px-8 lg:px-12">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <img
                src="/SolomindLM_logo.png"
                alt="SolomindLM"
                className="h-8 w-8 shrink-0 object-contain"
              />
              <span className="font-display text-lg font-bold tracking-tight text-foreground">
                SolomindLM
              </span>
            </Link>
            {isAuthenticated ? (
              <Button variant="ghost" asChild>
                <Link to="/home">Open SolomindLM</Link>
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setAuthOpen(true)}>
                Sign in
              </Button>
            )}
          </div>
        </header>

        <main className="px-4 pb-20 sm:px-6">
          <section className="mx-auto max-w-3xl space-y-4 pt-14 text-center md:pt-20">
            <h1 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
              {PAGE.h1}
            </h1>
            <p className="text-lg text-muted-foreground">{PAGE.intro}</p>
          </section>

          <section className="mx-auto mt-10 max-w-3xl space-y-6 rounded-2xl bg-card p-5 shadow-xs ring-1 ring-hairline sm:p-8">
            <SourceInput onChange={setSource} />
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Cards</span>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={String(cardCount)}
                  onValueChange={(value) =>
                    value && setCardCount(Number(value) as FreeFlashcardCardCount)
                  }
                  aria-label="Number of cards"
                >
                  {FREE_FLASHCARD_CARD_COUNTS.map((count) => (
                    <ToggleGroupItem key={count} value={String(count)}>
                      {count}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </div>
              <Button
                size="lg"
                disabled={!source || status.kind === "generating"}
                onClick={generate}
              >
                {status.kind === "generating" ? <Spinner /> : <Sparkles />}
                {status.kind === "generating" ? "Making your flashcards…" : "Generate flashcards"}
              </Button>
            </div>
            {/* Stays empty unless Cloudflare needs the visitor to interact. */}
            <div ref={turnstileContainer} className="empty:hidden" />
            {status.kind === "error" ? (
              <Alert variant="warning">
                <AlertTitle>{status.title}</AlertTitle>
                <AlertDescription>
                  <p>{status.message}</p>
                  {status.signup ? (
                    <Button
                      variant="link"
                      size="xs"
                      className="-ml-2.5"
                      onClick={() => setAuthOpen(true)}
                    >
                      Create a free account
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            ) : null}
          </section>

          {status.kind === "done" ? (
            <section className="mx-auto mt-10 max-w-3xl space-y-6" aria-labelledby="deck-heading">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 id="deck-heading" className="font-display text-2xl font-bold text-foreground">
                    {status.deck.title}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {status.deck.cards.length} cards · review them before you study
                  </p>
                </div>
                <ExportBar deck={status.deck} />
              </div>
              <DeckPreview cards={status.deck.cards} />
              <div className="rounded-2xl bg-card p-6 text-center shadow-xs ring-1 ring-hairline">
                <p className="font-display text-lg text-foreground">
                  Keep this deck and study it on a schedule
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Save it to a free notebook: spaced repetition picks the cards you're about to
                  forget.
                </p>
                <Button variant="secondary" className="mt-4" disabled={claiming} onClick={saveDeck}>
                  Save &amp; study with spaced repetition
                </Button>
              </div>
            </section>
          ) : null}

          <article className="mx-auto mt-20 max-w-3xl space-y-12">
            <section aria-labelledby="how-heading">
              <h2 id="how-heading" className="font-display text-2xl font-bold text-foreground">
                How it works
              </h2>
              <ol className="mt-4 space-y-3">
                {PAGE.steps.map((step, i) => (
                  <li key={step.name} className="text-foreground">
                    <span className="font-semibold">
                      {i + 1}. {step.name}.
                    </span>{" "}
                    <span className="text-muted-foreground">{step.text}</span>
                  </li>
                ))}
              </ol>
            </section>
            {PAGE.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="font-display text-2xl font-bold text-foreground">
                  {section.heading}
                </h2>
                {section.paragraphs.map((p) => (
                  <p key={p} className="mt-3 leading-relaxed text-muted-foreground">
                    {p}
                  </p>
                ))}
              </section>
            ))}
            <section aria-labelledby="faq-heading">
              <h2 id="faq-heading" className="font-display text-2xl font-bold text-foreground">
                Frequently asked questions
              </h2>
              <dl className="mt-4 space-y-5">
                {PAGE.faqs.map((faq) => (
                  <div key={faq.question}>
                    <dt className="font-semibold text-foreground">{faq.question}</dt>
                    <dd className="mt-1 text-muted-foreground">{faq.answer}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <nav aria-label="Related" className="flex flex-wrap gap-3">
              {PAGE.related.map((link) => (
                <Button key={link.path} variant="outline" asChild>
                  <Link to={link.path}>{link.label}</Link>
                </Button>
              ))}
            </nav>
          </article>
        </main>
        <Footer />
      </div>
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onAuthenticated={() => setAuthOpen(false)}
      />
    </>
  );
}
