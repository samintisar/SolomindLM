import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, CircleCheck, FileBox, AlertTriangle } from "lucide-react";
import type {
  MessageToolCall,
  AgentGroundingCheck,
  ChatActivityPhase,
  ReferenceChunk,
} from "@/shared/types/index";
import { getStatusMessage } from "../utils/messageStatus";
import { aggregateRetrievalSources } from "../utils/aggregateRetrievalSources";

const STORAGE_KEY = "solomind-chat-activity-open";

const SOURCE_BADGE_CLASS =
  "shrink-0 justify-self-end rounded border border-border/60 bg-muted/25 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-foreground/65 dark:border-border/55 dark:bg-muted/20 dark:text-foreground/60";

const SOURCE_BADGE_LINK_CLASS = `${SOURCE_BADGE_CLASS} cursor-pointer no-underline transition-colors hover:bg-muted/45 hover:text-foreground/85 dark:hover:bg-muted/35 dark:hover:text-foreground/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-card`;

export interface AgentActivityPanelProps {
  isStreaming: boolean;
  activityPhase: ChatActivityPhase | null | undefined;
  activityDetail?: string | null;
  /** Last phase from persisted agentTrace (history rows) */
  historicalPhase?: ChatActivityPhase | null;
  historicalDetail?: string | null;
  /** Ordered status steps from the server (HyDE, embedding, ranking, reading, generating, …) */
  activityPhases: Array<{ status: string; message: string }>;
  toolCalls: MessageToolCall[];
  groundingChecks: AgentGroundingCheck[];
  /** Chunks retrieved for this turn (streaming or persisted) — drives Claude-style source list */
  references?: ReferenceChunk[] | null;
  /** Router asked for more detail — avoid showing "Response complete" for this turn */
  clarificationResponse?: boolean;
}

export const AgentActivityPanel = React.memo<AgentActivityPanelProps>(
  ({
    isStreaming,
    activityPhase,
    activityDetail,
    historicalPhase,
    historicalDetail,
    activityPhases,
    toolCalls,
    groundingChecks,
    references,
    clarificationResponse,
  }) => {
    const panelId = useId();
    const hardGroundingChecks = useMemo(
      () => groundingChecks.filter((g) => !g.soft),
      [groundingChecks]
    );
    const softGroundingChecks = useMemo(
      () => groundingChecks.filter((g) => g.soft === true),
      [groundingChecks]
    );
    const showGroundingCallout = hardGroundingChecks.some((g) => !g.passed || g.issues.length > 0);

    const hasSearchDocuments = useMemo(
      () => toolCalls.some((tc) => tc.tool === "search_documents"),
      [toolCalls]
    );
    const useClaudeLayout = hasSearchDocuments || (references != null && references.length > 0);

    const aggregatedSources = useMemo(() => aggregateRetrievalSources(references), [references]);

    const [expanded, setExpanded] = useState(() => {
      if (typeof sessionStorage !== "undefined") {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored === "0") return false;
        if (stored === "1") return true;
      }
      const doneHistorical =
        !isStreaming &&
        (historicalPhase === "completed" ||
          historicalPhase === "generating" ||
          historicalPhase === "writing");
      if (doneHistorical) {
        return showGroundingCallout;
      }
      return true;
    });

    useEffect(() => {
      if (!isStreaming) return;
      setExpanded(activityPhase !== "writing");
    }, [isStreaming, activityPhase]);

    const prevStreamingRef = React.useRef(isStreaming);
    useEffect(() => {
      if (prevStreamingRef.current && !isStreaming) {
        setExpanded(showGroundingCallout || softGroundingChecks.length > 0);
      }
      prevStreamingRef.current = isStreaming;
    }, [isStreaming, showGroundingCallout, softGroundingChecks.length]);

    const togglePanel = useCallback(() => {
      setExpanded((prev) => {
        const next = !prev;
        if (!isStreaming && typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        }
        return next;
      });
    }, [isStreaming]);

    const { headerPrimary, headerMeta } = useMemo(() => {
      const currentPhase = (activityPhase ?? historicalPhase ?? undefined) as string | undefined;

      if (clarificationResponse) {
        return { headerPrimary: "Need a bit more context", headerMeta: null as string | null };
      }

      if (useClaudeLayout) {
        const searchTcs = toolCalls.filter((tc) => tc.tool === "search_documents");
        const searchTc = searchTcs[0] ?? toolCalls[0];
        const q = searchTc?.query?.trim() ?? "";
        const searching = isStreaming && searchTcs.some((tc) => tc.status === "searching");

        let primary: string;
        if (q) {
          primary = `Searched sources for "${q}"`;
        } else if (aggregatedSources.length > 0 || (references?.length ?? 0) > 0) {
          primary = "Searched sources";
        } else if (searching || hasSearchDocuments) {
          primary = "Searching your materials…";
        } else {
          primary = "Searched sources";
        }

        const n = aggregatedSources.length;
        const meta = n > 0 ? `${n} result${n === 1 ? "" : "s"}` : null;
        return { headerPrimary: primary, headerMeta: meta };
      }

      if (currentPhase === "completed") {
        return { headerPrimary: "Response complete", headerMeta: null as string | null };
      }

      if (activityDetail?.trim()) {
        return { headerPrimary: activityDetail.trim(), headerMeta: null as string | null };
      }
      if (historicalDetail?.trim()) {
        return { headerPrimary: historicalDetail.trim(), headerMeta: null as string | null };
      }

      const fallback = getStatusMessage(currentPhase);
      return { headerPrimary: fallback ?? "Working…", headerMeta: null as string | null };
    }, [
      activityPhase,
      activityDetail,
      historicalPhase,
      historicalDetail,
      toolCalls,
      clarificationResponse,
      useClaudeLayout,
      hasSearchDocuments,
      aggregatedSources.length,
      references?.length,
      isStreaming,
    ]);

    const hasActivity =
      isStreaming ||
      activityPhases.length > 0 ||
      toolCalls.length > 0 ||
      groundingChecks.length > 0 ||
      !!activityPhase ||
      !!activityDetail ||
      !!historicalPhase ||
      !!historicalDetail ||
      (references != null && references.length > 0);

    if (!hasActivity) return null;

    const turnComplete = !isStreaming && (activityPhase ?? historicalPhase) === "completed";

    const searchFullyDone =
      hasSearchDocuments &&
      toolCalls.every((tc) => tc.tool !== "search_documents" || tc.status === "done");
    const showClaudeDone =
      useClaudeLayout && turnComplete && (searchFullyDone || aggregatedSources.length > 0);

    return (
      <div className="mb-0 w-full min-w-0 max-w-4xl" data-agent-activity-panel>
        <button
          type="button"
          id={`${panelId}-trigger`}
          aria-expanded={expanded}
          aria-controls={`${panelId}-region`}
          aria-label={headerMeta ? `${headerPrimary}, ${headerMeta}` : headerPrimary}
          onClick={togglePanel}
          className="group/trigger block w-full max-w-full border-0 bg-transparent p-0 py-0.5 text-left font-sans text-sm font-normal leading-snug text-foreground/78 shadow-none outline-none ring-0 transition-[color,opacity] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background dark:text-foreground/72 dark:hover:text-foreground"
        >
          <span className="wrap-break-word leading-snug">
            <span className="text-foreground/82 dark:text-foreground/78">{headerPrimary}</span>
            {headerMeta ? (
              <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                {" "}
                {headerMeta}
              </span>
            ) : null}
            <ChevronDown
              className={`ml-0.5 inline-block h-3.5 w-3.5 align-middle text-muted-foreground/55 transition-[color,transform] duration-200 ease-out group-hover/trigger:text-muted-foreground/80 ${expanded ? "rotate-180" : ""}`}
              strokeWidth={2}
              aria-hidden
            />
          </span>
        </button>

        {expanded && (
          <div
            id={`${panelId}-region`}
            role="region"
            aria-labelledby={`${panelId}-trigger`}
            className="mt-2 min-w-0 max-w-full font-sans text-[11px] text-foreground/75"
          >
            {useClaudeLayout && (
              <div className="flex min-w-0 max-w-full items-start gap-2">
                <FileBox
                  className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/80"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <div className="min-w-0 flex-1 border-l border-border/60 pl-2.5 dark:border-border/50">
                  <div className="mb-2 flex min-w-0 items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-foreground/65 dark:text-foreground/60">
                      {headerPrimary}
                    </span>
                    {aggregatedSources.length > 0 ? (
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {aggregatedSources.length} result
                        {aggregatedSources.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>

                  <div className="box-border min-w-0 max-w-full overflow-hidden rounded-md border border-border/55 bg-card px-3 py-2 shadow-none dark:border-border/50">
                    {aggregatedSources.length === 0 ? (
                      <p className="m-0 min-w-0 text-[11px] leading-snug text-muted-foreground">
                        {isStreaming && !searchFullyDone
                          ? "Searching your materials…"
                          : "No matching sections found in your sources."}
                      </p>
                    ) : (
                      <ul className="m-0 min-w-0 list-none divide-y divide-border/35 p-0 dark:divide-border/40">
                        {aggregatedSources.map((src) => (
                          <li
                            key={src.sourceId}
                            className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 py-2 first:pt-0 last:pb-0"
                          >
                            <span className="min-w-0 truncate text-[12px] leading-snug text-foreground/85 dark:text-foreground/80">
                              {src.title}
                            </span>
                            <span className="shrink-0 whitespace-nowrap text-right text-[11px] text-muted-foreground">
                              {src.sectionCount} relevant section
                              {src.sectionCount === 1 ? "" : "s"}
                            </span>
                            {src.openUrl ? (
                              <a
                                href={src.openUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={SOURCE_BADGE_LINK_CLASS}
                                aria-label={`Open ${src.title} in a new tab`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {src.badgeLabel}
                              </a>
                            ) : (
                              <span className={SOURCE_BADGE_CLASS}>{src.badgeLabel}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {showClaudeDone ? (
                    <div className="mt-2 flex items-center gap-1.5 text-muted-foreground">
                      <CircleCheck
                        className="h-3.5 w-3.5 shrink-0 text-vintage-green-600 dark:text-vintage-green-500"
                        strokeWidth={2}
                        aria-hidden
                      />
                      <span className="text-[11px] font-medium text-foreground/70">Done</span>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {showGroundingCallout && (
              <div
                className={`border-l-2 border-amber-600/45 bg-amber-50/90 py-2 pl-3 pr-2 dark:border-amber-400/50 dark:bg-amber-950/45 ${useClaudeLayout ? "mt-3" : "mt-2"}`}
              >
                <div className="flex items-start gap-2 text-amber-950 dark:text-amber-50">
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800 dark:text-amber-300"
                    aria-hidden
                  />
                  <div className="min-w-0 space-y-1">
                    {hardGroundingChecks.map((g, gi) => (
                      <div key={gi}>
                        <p className="text-[11px] font-medium leading-snug text-amber-950 dark:text-amber-50">
                          {g.message}
                        </p>
                        {g.issues.length > 0 && (
                          <ul className="mt-1 list-disc pl-3.5 text-[11px] leading-snug text-amber-900 dark:text-amber-100/95">
                            {g.issues.map((issue, ii) => (
                              <li key={ii}>{issue}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {softGroundingChecks.length > 0 && (
              <div className="mt-2 border-l border-border/30 py-1 pl-3 text-muted-foreground/85">
                {softGroundingChecks.map((g, gi) => (
                  <p key={gi} className="text-[11px] leading-snug">
                    {g.message}
                    {g.issues.length > 0 ? ` (${g.issues.join("; ")})` : ""}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);

AgentActivityPanel.displayName = "AgentActivityPanel";
