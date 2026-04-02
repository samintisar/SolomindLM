import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { ChevronDown, Check, Search, AlertTriangle } from 'lucide-react';
import type {
  MessageToolCall,
  AgentGroundingCheck,
  ChatActivityPhase,
} from '@/shared/types/index';
import { getStatusIcon, getStatusMessage } from '../utils/messageStatus';

const STORAGE_KEY = 'solomind-chat-activity-open';

const QUERY_PREVIEW_CHARS = 72;

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
}

function toolLabel(tool: string): string {
  if (tool === 'search_documents') return 'Search documents';
  if (tool === 'ask_clarification') return 'Ask clarification';
  return tool.replace(/_/g, ' ');
}

/**
 * Tool-call cards were rendered after all phase rows, so "Search documents" appeared after
 * generating/complete even though the agent finishes retrieval before "Reading passages".
 * Split phases so tool summaries sit after HyDE/embed/rank and before reading/formulation.
 */
function splitPhasesForSearchToolDetails(
  phases: Array<{ status: string; message: string }>,
  hasToolCalls: boolean
): { pipeline: typeof phases; postSearch: typeof phases } {
  const readingIdx = phases.findIndex((p) => p.status === 'reading');
  if (readingIdx >= 0) {
    return {
      pipeline: phases.slice(0, readingIdx),
      postSearch: phases.slice(readingIdx),
    };
  }
  if (hasToolCalls) {
    const lastRankingIdx = phases.findLastIndex((p) => p.status === 'ranking');
    if (lastRankingIdx >= 0) {
      return {
        pipeline: phases.slice(0, lastRankingIdx + 1),
        postSearch: phases.slice(lastRankingIdx + 1),
      };
    }
  }
  return { pipeline: phases, postSearch: [] };
}

/** Canonical RAG step order so a briefly out-of-order trace (e.g. status/detail vs phases) cannot show "Formulating" before HyDE/search prep. */
const RAG_DISPLAY_ORDER: Record<string, number> = {
  retrieving: 10,
  embedding: 20,
  ranking: 30,
  reading: 40,
  thinking: 50,
  generating: 60,
  writing: 70,
};

function sortTimelinePhasesForRagDisplay(
  phases: Array<{ status: string; message: string }>
): Array<{ status: string; message: string }> {
  if (phases.length <= 1) return phases;
  const rank = (s: string) => RAG_DISPLAY_ORDER[s] ?? 1000;
  return [...phases]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p.status) - rank(b.p.status) || a.i - b.i)
    .map(({ p }) => p);
}

function phaseRowLine(step: { status: string; message: string }): string {
  return (
    step.message?.trim() ||
    getStatusMessage(step.status) ||
    step.status.replace(/_/g, ' ')
  );
}

/** Avoid repeating the same line as the collapsible header inside the list. */
function dropFirstPhaseIfMatchesHeader(
  phases: Array<{ status: string; message: string }>,
  headerLabel: string
): Array<{ status: string; message: string }> {
  const h = headerLabel.trim();
  if (!h || phases.length === 0) return phases;
  if (phaseRowLine(phases[0]) === h) return phases.slice(1);
  return phases;
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
  }) => {
    const panelId = useId();
    const showGroundingCallout = groundingChecks.some((g) => !g.passed || g.issues.length > 0);

    const [expanded, setExpanded] = useState(() => {
      if (typeof sessionStorage !== 'undefined') {
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored === '0') return false;
        if (stored === '1') return true;
      }
      // Finished turns: keep trace available but collapsed by default (expand for grounding warnings).
      const doneHistorical =
        !isStreaming &&
        (historicalPhase === 'completed' ||
          historicalPhase === 'generating' ||
          historicalPhase === 'writing');
      if (doneHistorical) {
        return showGroundingCallout;
      }
      return true;
    });
    const [expandedQueries, setExpandedQueries] = useState<Record<number, boolean>>({});

    useEffect(() => {
      if (!isStreaming) return;
      setExpanded(activityPhase !== 'writing');
    }, [isStreaming, activityPhase]);

    const prevStreamingRef = React.useRef(isStreaming);
    useEffect(() => {
      if (prevStreamingRef.current && !isStreaming) {
        setExpanded(showGroundingCallout);
      }
      prevStreamingRef.current = isStreaming;
    }, [isStreaming, showGroundingCallout]);

    const togglePanel = useCallback(() => {
      setExpanded((prev) => {
        const next = !prev;
        if (!isStreaming && typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem(STORAGE_KEY, next ? '1' : '0');
        }
        return next;
      });
    }, [isStreaming]);

    const toggleQuery = useCallback((index: number) => {
      setExpandedQueries((prev) => ({ ...prev, [index]: !prev[index] }));
    }, []);

    const phaseLabel = useMemo(() => {
      if (activityDetail?.trim()) return activityDetail.trim();
      if (historicalDetail?.trim()) return historicalDetail.trim();
      const fallback = getStatusMessage(
        (activityPhase ?? historicalPhase ?? undefined) as string | undefined
      );
      return fallback ?? 'Working…';
    }, [activityPhase, activityDetail, historicalPhase, historicalDetail]);

    const phaseIcon = getStatusIcon((activityPhase ?? historicalPhase ?? undefined) as string | undefined);

    /** Header already shows final completion; keep timeline focused on work steps */
    const timelinePhases = useMemo(
      () => activityPhases.filter((p) => p.status !== 'completed'),
      [activityPhases]
    );
    const sortedTimelinePhases = useMemo(
      () => sortTimelinePhasesForRagDisplay(timelinePhases),
      [timelinePhases]
    );
    const displayPhasesForSplit = useMemo(
      () => dropFirstPhaseIfMatchesHeader(sortedTimelinePhases, phaseLabel),
      [sortedTimelinePhases, phaseLabel]
    );
    const { pipeline, postSearch } = useMemo(
      () =>
        splitPhasesForSearchToolDetails(
          displayPhasesForSplit,
          toolCalls.length > 0
        ),
      [displayPhasesForSplit, toolCalls.length]
    );
    const totalTimelinePhaseRows = pipeline.length + postSearch.length;

    const hasActivity =
      isStreaming ||
      activityPhases.length > 0 ||
      toolCalls.length > 0 ||
      groundingChecks.length > 0 ||
      !!activityPhase ||
      !!activityDetail ||
      !!historicalPhase ||
      !!historicalDetail;

    if (!hasActivity) return null;

    return (
      <div
        className="mb-3 w-full max-w-4xl rounded-lg border border-border/60 bg-[color-mix(in_oklch,var(--muted)_35%,transparent)] dark:bg-[color-mix(in_oklch,var(--muted)_22%,transparent)] shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_6%,transparent)]"
        data-agent-activity-panel
      >
        <button
          type="button"
          id={`${panelId}-trigger`}
          aria-expanded={expanded}
          aria-controls={`${panelId}-region`}
          onClick={togglePanel}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left font-sans text-xs font-medium tracking-wide text-foreground/85 transition-colors hover:bg-accent/25 dark:hover:bg-accent/15 rounded-t-lg"
        >
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background/80 text-muted-foreground shadow-sm border border-border/50"
            aria-hidden
          >
            {phaseIcon}
          </span>
          <span className="min-w-0 flex-1 truncate">{phaseLabel}</span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out ${expanded ? 'rotate-180' : ''}`}
            strokeWidth={2}
            aria-hidden
          />
        </button>

        {expanded && (
          <div
            id={`${panelId}-region`}
            role="region"
            aria-labelledby={`${panelId}-trigger`}
            className="border-t border-border/50 px-3 pb-3 pt-1 font-sans text-xs text-foreground/80"
          >
            {(totalTimelinePhaseRows > 0 || toolCalls.length > 0) && (
              <div className="mt-2">
                <ol className="m-0 list-none space-y-1.5 p-0">
                  {pipeline.map((step, si) => {
                    const line =
                      step.message?.trim() ||
                      getStatusMessage(step.status) ||
                      step.status.replace(/_/g, ' ');
                    const stepIsFinishedInTimeline =
                      !isStreaming ||
                      si < totalTimelinePhaseRows - 1 ||
                      step.status === 'completed';
                    const iconStatus =
                      step.status === 'generating' && stepIsFinishedInTimeline
                        ? 'completed'
                        : step.status;
                    return (
                      <li
                        key={`p-${step.status}-${si}-${step.message?.slice(0, 24) ?? ''}`}
                        className="flex gap-2 rounded-md border border-border/35 bg-background/40 px-2 py-1.5 dark:bg-background/25"
                      >
                        <span
                          className="mt-0.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        >
                          {getStatusIcon(iconStatus)}
                        </span>
                        <span className="min-w-0 leading-snug text-foreground/88">{line}</span>
                      </li>
                    );
                  })}
                  {toolCalls.map((tc, i) => {
                    const long = tc.query.length > QUERY_PREVIEW_CHARS;
                    const open = expandedQueries[i] ?? false;
                    const display =
                      !long || open ? tc.query : `${tc.query.slice(0, QUERY_PREVIEW_CHARS)}…`;
                    return (
                      <li
                        key={`t-${tc.tool}-${tc.query}-${i}`}
                        className="rounded-md border border-border/40 bg-background/50 px-2.5 py-2 dark:bg-background/30"
                      >
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden>
                            {tc.status === 'searching' ? (
                              <Search className="h-3.5 w-3.5 animate-pulse" />
                            ) : (
                              <Check className="h-3.5 w-3.5 text-vintage-green-600 dark:text-vintage-green-500" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-foreground/90">{toolLabel(tc.tool)}</div>
                            <div className="mt-0.5 wrap-break-word text-muted-foreground leading-relaxed">
                              {display}
                            </div>
                            {long && (
                              <button
                                type="button"
                                onClick={() => toggleQuery(i)}
                                className="mt-1 text-[11px] font-medium text-primary hover:underline"
                              >
                                {open ? 'Show less' : 'Show full query'}
                              </button>
                            )}
                            {tc.status === 'done' && (
                              <div className="mt-1 text-[11px] text-muted-foreground/90">
                                {tc.resultCount ?? 0} passage{(tc.resultCount ?? 0) === 1 ? '' : 's'}{' '}
                                retrieved
                              </div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                  {postSearch.map((step, si) => {
                    const globalSi = pipeline.length + si;
                    const line =
                      step.message?.trim() ||
                      getStatusMessage(step.status) ||
                      step.status.replace(/_/g, ' ');
                    const stepIsFinishedInTimeline =
                      !isStreaming ||
                      globalSi < totalTimelinePhaseRows - 1 ||
                      step.status === 'completed';
                    const iconStatus =
                      step.status === 'generating' && stepIsFinishedInTimeline
                        ? 'completed'
                        : step.status;
                    return (
                      <li
                        key={`s-${step.status}-${si}-${step.message?.slice(0, 24) ?? ''}`}
                        className="flex gap-2 rounded-md border border-border/35 bg-background/40 px-2 py-1.5 dark:bg-background/25"
                      >
                        <span
                          className="mt-0.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        >
                          {getStatusIcon(iconStatus)}
                        </span>
                        <span className="min-w-0 leading-snug text-foreground/88">{line}</span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}

            {showGroundingCallout && (
              <div className="mt-3 rounded-md border border-amber-700/25 bg-amber-50 px-2.5 py-2 dark:border-amber-400/35 dark:bg-amber-950/70">
                <div className="flex items-start gap-2 text-amber-950 dark:text-amber-50">
                  <AlertTriangle
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800 dark:text-amber-300"
                    aria-hidden
                  />
                  <div className="min-w-0 space-y-1">
                    {groundingChecks.map((g, gi) => (
                      <div key={gi}>
                        <p className="font-medium leading-snug text-amber-950 dark:text-amber-50">
                          {g.message}
                        </p>
                        {g.issues.length > 0 && (
                          <ul className="mt-1 list-disc pl-4 text-[11px] leading-snug text-amber-900 dark:text-amber-100/95">
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
          </div>
        )}
      </div>
    );
  }
);

AgentActivityPanel.displayName = 'AgentActivityPanel';
