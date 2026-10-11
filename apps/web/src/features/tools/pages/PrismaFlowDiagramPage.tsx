import { Download, Link2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AuthModal } from "@/features/auth/components/AuthModal";
import { useAuth } from "@/features/auth/useAuth";
import { Footer } from "@/features/landing/components/Footer";
import { Button } from "@/shared/components/ui/button";
import { useToast } from "@/shared/contexts/useToast";
import { SEOMeta } from "@/shared/seo/SEOMeta";
import { isNativeShell } from "@/utils/platformDetection";
import { PrismaDiagram } from "../components/PrismaDiagram";
import { PrismaForm } from "../components/PrismaForm";
import { ToolArticle, ToolHeader } from "../components/ToolPageChrome";
import { downloadPng, downloadSvg } from "../lib/exportDiagram";
import {
  checkPrismaCounts,
  createEmptyPrismaState,
  isPrismaStateEmpty,
  type PrismaFlowState,
} from "../lib/prismaFlow";
import { decodePrismaState, encodePrismaState, hasPrismaHash } from "../lib/prismaUrlState";
import { PRISMA_FLOW_DIAGRAM_PAGE as PAGE } from "../toolPages";

const FILE_NAME = "prisma-2020-flow-diagram";

const hashFor = (state: PrismaFlowState) =>
  isPrismaStateEmpty(state) ? "" : `#${encodePrismaState(state)}`;

export default function PrismaFlowDiagramPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [state, setState] = useState<PrismaFlowState>(
    () => decodePrismaState(window.location.hash) ?? createEmptyPrismaState()
  );
  const [authOpen, setAuthOpen] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const toast = useToast();
  const warnings = useMemo(() => checkPrismaCounts(state), [state]);

  // Keep the diagram in the URL so a reload or a shared link reopens it. Written on every change,
  // not debounced: a link clicked right after typing must not leave the last edit out of history.
  useEffect(() => {
    const { pathname, search, hash } = window.location;
    const next = hashFor(state);
    // A blank diagram leaves an in-page anchor such as #faq-heading alone.
    if (next === hash || (next === "" && !hasPrismaHash(hash))) return;
    try {
      window.history.replaceState(window.history.state, "", `${pathname}${search}${next}`);
    } catch {
      // Safari throws when replaceState is called too often; the next edit writes it again.
    }
  }, [state]);

  // Pasting a shared link into this tab changes only the hash, so the page doesn't reload.
  useEffect(() => {
    const loadFromHash = () => {
      const shared = decodePrismaState(window.location.hash);
      if (shared) setState(shared);
    };
    window.addEventListener("hashchange", loadFromHash);
    return () => window.removeEventListener("hashchange", loadFromHash);
  }, []);

  if (isNativeShell()) {
    if (isLoading) return <div className="min-h-screen bg-background" />;
    return <Navigate to={isAuthenticated ? "/home" : "/sign-in"} replace />;
  }

  const exportSvg = () => {
    if (svgRef.current) downloadSvg(svgRef.current, `${FILE_NAME}.svg`);
  };

  const exportPng = async () => {
    if (!svgRef.current) return;
    try {
      await downloadPng(svgRef.current, `${FILE_NAME}.png`);
    } catch {
      toast.error("Couldn't make the PNG. Download the SVG instead.");
    }
  };

  const reset = () => {
    if (isPrismaStateEmpty(state)) return;
    const previous = state;
    setState(createEmptyPrismaState());
    const id = toast.info("Diagram cleared.", {
      action: {
        label: "Undo",
        onClick: () => {
          setState(previous);
          toast.dismiss(id);
        },
      },
    });
  };

  const copyLink = async () => {
    const { origin, pathname } = window.location;
    try {
      await navigator.clipboard.writeText(`${origin}${pathname}${hashFor(state)}`);
      toast.success("Link copied. It reopens this diagram.");
    } catch {
      toast.error("Couldn't copy the link. Copy it from the address bar instead.");
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
      <div className="min-h-screen landing-grid-pattern">
        <ToolHeader isAuthenticated={isAuthenticated} onSignIn={() => setAuthOpen(true)} />

        <main className="px-4 pb-20 sm:px-6">
          <section className="mx-auto max-w-3xl space-y-4 pt-14 text-center md:pt-20">
            <h1 className="font-display text-4xl font-bold tracking-tight text-foreground md:text-5xl">
              {PAGE.h1}
            </h1>
            <p className="text-lg text-muted-foreground">{PAGE.intro}</p>
          </section>

          <div className="mx-auto mt-10 grid max-w-7xl items-start gap-6 lg:grid-cols-5">
            <section
              aria-label="Counts"
              className="rounded-2xl bg-card p-5 shadow-xs ring-1 ring-hairline sm:p-8 lg:col-span-2"
            >
              <PrismaForm state={state} warnings={warnings} onChange={setState} />
            </section>

            <section
              aria-labelledby="diagram-heading"
              className="min-w-0 space-y-4 rounded-2xl bg-card p-5 shadow-xs ring-1 ring-hairline lg:sticky lg:top-24 lg:col-span-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="diagram-heading" className="font-display text-xl font-bold text-foreground">
                  Your diagram
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={exportSvg}>
                    <Download /> Download SVG
                  </Button>
                  <Button variant="secondary" onClick={exportPng}>
                    <Download /> Download PNG
                  </Button>
                  <Button variant="outline" onClick={copyLink}>
                    <Link2 /> Copy link
                  </Button>
                  <Button variant="ghost" onClick={reset}>
                    <RotateCcw /> Reset
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg ring-1 ring-hairline">
                <PrismaDiagram ref={svgRef} state={state} className="h-auto w-full min-w-xl" />
              </div>
              <p className="text-xs text-muted-foreground">
                Template:{" "}
                <a
                  href="https://www.prisma-statement.org/prisma-2020-flow-diagram"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  PRISMA 2020
                </a>{" "}
                (Page MJ et al., BMJ 2021;372:n71), CC BY 4.0.
              </p>
            </section>
          </div>

          <section className="mx-auto mt-10 max-w-3xl rounded-2xl bg-card p-6 text-center shadow-xs ring-1 ring-hairline">
            <p className="font-display text-lg text-foreground">Let the review do the counting</p>
            <p className="mt-1 text-sm text-muted-foreground">
              SolomindLM's literature review searches academic databases, removes duplicates,
              screens papers against your criteria and shows the count at every step.
            </p>
            {isAuthenticated ? (
              <Button className="mt-4" asChild>
                <Link to="/home">Open SolomindLM</Link>
              </Button>
            ) : (
              <Button className="mt-4" onClick={() => setAuthOpen(true)}>
                Try the literature review free
              </Button>
            )}
          </section>

          <ToolArticle page={PAGE} />
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
