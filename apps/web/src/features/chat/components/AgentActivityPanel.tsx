import { AlertTriangle, ChevronRight, CircleCheck, FileBox } from "lucide-react";
import React, { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/shared/components/ui/alert";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import type {
  AgentGroundingCheck,
  ChatActivityPhase,
  MessageToolCall,
  ReferenceChunk,
} from "@/shared/types/index";
import { aggregateRetrievalSources } from "../utils/aggregateRetrievalSources";
import { getStatusMessage } from "../utils/messageStatus";

const STORAGE_KEY = "solomind-chat-activity-open";

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
    const triggerId = useId();
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

    const handleOpenChange = useCallback(
      (next: boolean) => {
        setExpanded(next);
        if (!isStreaming && typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        }
      },
      [isStreaming]
    );

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
      <Collapsible
        open={expanded}
        onOpenChange={handleOpenChange}
        className="mb-0 w-full min-w-0 max-w-4xl"
        data-agent-activity-panel
      >
        <CollapsibleTrigger asChild>
          <Button
            id={`${triggerId}-trigger`}
            type="button"
            variant="disclosure"
            size="chip"
            aria-label={headerMeta ? `${headerPrimary}, ${headerMeta}` : headerPrimary}
            className="group/trigger -ml-4 justify-start"
          >
            <span className="min-w-0 wrap-break-word">
              <span>{headerPrimary}</span>
              {headerMeta ? (
                <span className="whitespace-nowrap tabular-nums text-muted-foreground">
                  {" "}
                  {headerMeta}
                </span>
              ) : null}
              <ChevronRight
                className="ml-0.5 inline-block align-middle text-muted-foreground transition-transform duration-200 ease-out group-data-[state=open]/trigger:rotate-90"
                aria-hidden
              />
            </span>
          </Button>
        </CollapsibleTrigger>

        <CollapsibleContent
          role="region"
          aria-labelledby={`${triggerId}-trigger`}
          className="mt-2 min-w-0 max-w-full"
        >
          <div className="min-w-0 max-w-full font-sans text-xs text-foreground/75">
            {useClaudeLayout && (
              <div className="flex min-w-0 max-w-full items-start gap-2">
                <FileBox className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1 border-l border-border pl-2.5">
                  <div className="mb-2 flex min-w-0 items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-foreground/65">
                      {headerPrimary}
                    </span>
                    {aggregatedSources.length > 0 ? (
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {aggregatedSources.length} result
                        {aggregatedSources.length === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>

                  <div className="box-border min-w-0 max-w-full overflow-hidden rounded-lg bg-muted/40 px-3 py-2">
                    {aggregatedSources.length === 0 ? (
                      <p className="m-0 min-w-0 leading-snug text-muted-foreground">
                        {isStreaming && !searchFullyDone
                          ? "Searching your materials…"
                          : "No matching sections found in your sources."}
                      </p>
                    ) : (
                      <ul className="m-0 min-w-0 list-none divide-y divide-border/50 p-0">
                        {aggregatedSources.map((src) => (
                          <li
                            key={src.sourceId}
                            className="flex min-w-0 items-center gap-x-2 py-2 first:pt-0 last:pb-0"
                          >
                            <span className="min-w-0 flex-1 truncate leading-snug text-foreground/85">
                              {src.title}
                            </span>
                            <span className="shrink-0 whitespace-nowrap text-right text-muted-foreground">
                              {src.isFullDocument
                                ? null
                                : `${src.sectionCount} relevant section${src.sectionCount === 1 ? "" : "s"}`}
                            </span>
                            {src.openUrl ? (
                              <Badge variant="outline" asChild>
                                <a
                                  href={src.openUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  aria-label={`Open ${src.title} in a new tab`}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {src.badgeLabel}
                                </a>
                              </Badge>
                            ) : (
                              <Badge variant="outline">{src.badgeLabel}</Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {showClaudeDone ? (
                    <div className="mt-2 flex items-center gap-1.5 text-muted-foreground">
                      <CircleCheck className="size-3.5 shrink-0 text-success" aria-hidden />
                      <span className="font-medium text-foreground/70">Done</span>
                    </div>
                  ) : null}
                </div>
              </div>
            )}

            {showGroundingCallout && (
              <Alert variant="warning" role="status" className={useClaudeLayout ? "mt-3" : "mt-2"}>
                <AlertTriangle aria-hidden />
                <AlertTitle>Grounding check</AlertTitle>
                <AlertDescription>
                  {hardGroundingChecks.map((g, gi) => (
                    <div key={gi}>
                      <p className="font-medium leading-snug">{g.message}</p>
                      {g.issues.length > 0 && (
                        <ul className="mt-1 list-disc pl-3.5 leading-snug">
                          {g.issues.map((issue, ii) => (
                            <li key={ii}>{issue}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            {softGroundingChecks.length > 0 && (
              <div className="mt-2 border-l border-border py-1 pl-3 text-muted-foreground">
                {softGroundingChecks.map((g, gi) => (
                  <p key={gi} className="leading-snug">
                    {g.message}
                    {g.issues.length > 0 ? ` (${g.issues.join("; ")})` : ""}
                  </p>
                ))}
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }
);

AgentActivityPanel.displayName = "AgentActivityPanel";
