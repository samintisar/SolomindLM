import React, { useState } from "react";
import { Check, Copy, ThumbsUp, ThumbsDown, RotateCcw } from "lucide-react";
import { Favicon } from "@/shared/components/Favicon";
import { Message, type ChatActivityPhase } from "@/shared/types/index";
import { renderMessageWithReferences } from "../utils/messageRendering";
import { RefHandlers } from "../utils/messageRendering.utils";
import { getStatusIcon, getStatusMessage } from "../utils/messageStatus";
import { AgentActivityPanel } from "./AgentActivityPanel";
import { ExternalSourcesModal } from "./ExternalSourcesModal";
import { DeepResearchSourcesSection } from "./DeepResearchSourcesSection";

interface ExternalSource {
  title: string;
  url: string;
  snippet: string;
  sourceType: string;
  score?: number;
}

interface MessageBubbleProps {
  message: Message;
  /** True only while the HTTP stream is still delivering tokens (not after __DONE). */
  isAssistantStreamActive?: boolean;
  refHandlers: RefHandlers;
  onCopyMessage: (message: Message) => void;
  copiedMessageId: string | null;
  onSetFeedback?: (messageId: string, feedback: "up" | "down" | null) => void;
  onSendFollowUp?: (text: string) => void;
  onRetry?: (messageId: string) => void;
  /** External sources discovered during this query — shown via the sources button */
  externalSources?: ExternalSource[];
  /** Called when user adds external sources from the modal or tooltip */
  onAddExternalSources?: (sources: ExternalSource[]) => void;
  /** Whether to show the "X sources" button for this message */
  showSourcesButton?: boolean;
  notebookId?: string;
  onOpenNotebookSource?: (documentId: string) => void;
  notebookDocumentIds?: Set<string>;
}

const ACTION_FLASH_MS = 220;

export const MessageBubble = React.memo<MessageBubbleProps>(
  ({
    message,
    isAssistantStreamActive = false,
    refHandlers,
    onCopyMessage,
    copiedMessageId,
    onSetFeedback,
    onSendFollowUp,
    onRetry,
    externalSources,
    onAddExternalSources,
    showSourcesButton = false,
    notebookId,
    onOpenNotebookSource,
    notebookDocumentIds,
  }) => {
    const isUser = message.role === "user";
    const isCopied = copiedMessageId === message.id;
    const [flashedActionId, setFlashedActionId] = React.useState<string | null>(null);
    const flashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isSourcesModalOpen, setIsSourcesModalOpen] = useState(false);
    const [isAddingSources, setIsAddingSources] = useState(false);

    React.useEffect(() => {
      return () => {
        if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      };
    }, []);

    const flashAction = React.useCallback((actionId: string) => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
      setFlashedActionId(actionId);
      flashTimerRef.current = setTimeout(() => {
        setFlashedActionId(null);
        flashTimerRef.current = null;
      }, ACTION_FLASH_MS);
    }, []);

    const sourcePreviewUrls = React.useMemo(() => {
      const list = externalSources ?? [];
      const seen = new Set<string>();
      const urls: string[] = [];
      for (const s of list) {
        let key: string;
        try {
          key = new URL(s.url).hostname;
        } catch {
          key = s.url;
        }
        if (seen.has(key)) continue;
        seen.add(key);
        urls.push(s.url);
        if (urls.length >= 3) break;
      }
      return urls;
    }, [externalSources]);

    const messageActions: Array<{
      id: string;
      label: string;
      icon: React.ElementType;
      onClick: () => void;
      className?: string;
    }> = [];

    // Copy button (always present)
    messageActions.push({
      id: "copy",
      label: isCopied ? "Copied" : "Copy",
      icon: isCopied ? Check : Copy,
      onClick: () => onCopyMessage(message),
      className: isCopied ? "text-primary" : "",
    });

    const canRetryAssistant =
      !isUser &&
      onRetry &&
      message.id !== "__streaming__" &&
      message.id !== "__remote_generating__";

    if (canRetryAssistant) {
      messageActions.splice(1, 0, {
        id: "retry",
        label: "Retry",
        icon: RotateCcw,
        onClick: () => onRetry(message.id),
      });
    }

    if (!isUser && onSetFeedback) {
      messageActions.push(
        {
          id: "thumbs-up",
          label: "Good response",
          icon: ThumbsUp,
          onClick: () => onSetFeedback(message.id, message.feedback === "up" ? null : "up"),
          className:
            message.feedback === "up"
              ? "text-vintage-green-700 dark:text-vintage-green-600 fill-vintage-green-600/30 dark:fill-vintage-green-500/25"
              : "",
        },
        {
          id: "thumbs-down",
          label: "Bad response",
          icon: ThumbsDown,
          onClick: () => onSetFeedback(message.id, message.feedback === "down" ? null : "down"),
          className:
            message.feedback === "down"
              ? "text-vintage-red-700 dark:text-vintage-red-600 fill-vintage-red-600/30 dark:fill-vintage-red-500/25"
              : "",
        }
      );
    }

    const actionBtnBase =
      "rounded-md p-2 min-h-10 min-w-10 md:min-h-8 md:min-w-8 md:p-1.5 inline-flex items-center justify-center touch-manipulation " +
      "text-foreground/50 hover:text-foreground hover:bg-primary/10 dark:hover:bg-primary/14 " +
      "transition-[transform,color,background-color] duration-200 ease-out motion-reduce:transition-none " +
      "active:scale-[0.96] motion-reduce:active:scale-100 " +
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

    const ActionBar = () => (
      <div
        className="flex flex-wrap items-center gap-0.5"
        role="toolbar"
        aria-label="Message actions"
      >
        {messageActions.map(({ id, label, icon: Icon, onClick, className = "" }) => {
          const isFlash = flashedActionId === id;
          const showClusterBreak = id === "thumbs-up";
          return (
            <React.Fragment key={id}>
              {showClusterBreak && (
                <span
                  className="mx-1 sm:mx-2 h-4 w-px shrink-0 bg-linear-to-b from-transparent via-border to-transparent opacity-70"
                  aria-hidden
                />
              )}
              <button
                type="button"
                onClick={() => {
                  onClick();
                  flashAction(id);
                }}
                title={label}
                aria-label={label}
                className={`${actionBtnBase} ${isFlash ? "text-foreground bg-muted/70 dark:bg-muted/50" : ""} ${className}`}
              >
                <Icon
                  className={`w-[17px] h-[17px] transition-transform duration-200 ease-out motion-reduce:transition-none ${id === "copy" && isCopied ? "scale-110" : ""}`}
                  strokeWidth={1.75}
                  aria-hidden
                />
              </button>
            </React.Fragment>
          );
        })}
        {showSourcesButton && externalSources && externalSources.length > 0 ? (
          <button
            type="button"
            onClick={() => setIsSourcesModalOpen(true)}
            className="ml-2 sm:ml-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-left font-sans text-xs font-medium text-muted-foreground transition-[color,background-color] duration-200 ease-out hover:bg-primary/10 hover:text-foreground dark:hover:bg-primary/14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background min-h-10 md:min-h-8 md:py-1 md:px-2.5 motion-reduce:transition-none"
            aria-label={`View ${externalSources.length} source${externalSources.length === 1 ? "" : "s"}`}
          >
            <span className="relative flex shrink-0 flex-row items-center pl-0.5" aria-hidden>
              {sourcePreviewUrls.map((url, index) => (
                <span
                  key={`${url}-${index}`}
                  className="relative inline-flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-2 ring-background dark:ring-background"
                  style={{ zIndex: index + 1, marginLeft: index === 0 ? 0 : -7 }}
                >
                  <Favicon
                    url={url}
                    size={16}
                    fit="cover"
                    className="size-full min-h-full min-w-full rounded-full"
                  />
                </span>
              ))}
            </span>
            <span>
              {externalSources.length} source{externalSources.length === 1 ? "" : "s"}
            </span>
          </button>
        ) : null}
      </div>
    );

    const isStreamingRow = message.id === "__streaming__";
    const isStreamingVisual = !isUser && isStreamingRow && isAssistantStreamActive;
    const toolCalls = message.toolCalls ?? message.agentTrace?.toolCalls ?? [];
    const groundingChecks = message.groundingChecks ?? message.agentTrace?.grounding ?? [];
    const activityPhases = message.agentTrace?.phases ?? [];
    const tracePhases = message.agentTrace?.phases;
    const lastTracePhase =
      tracePhases && tracePhases.length > 0 ? tracePhases[tracePhases.length - 1] : undefined;
    const rawHistoricalPhase = (lastTracePhase?.status as ChatActivityPhase) ?? null;
    const rawHistoricalDetail = lastTracePhase?.message ?? null;
    /** Older saves ended phases on "generating"; panel would show spinner + "Generating response…" with full content below. */
    const staleInProgressHeader =
      !isStreamingRow &&
      !!message.content?.trim() &&
      (rawHistoricalPhase === "generating" || rawHistoricalPhase === "writing");
    const historicalPhase = staleInProgressHeader ? "completed" : rawHistoricalPhase;
    const historicalDetail = staleInProgressHeader ? null : rawHistoricalDetail;
    const showAgentPanel =
      isStreamingRow ||
      activityPhases.length > 0 ||
      toolCalls.length > 0 ||
      groundingChecks.length > 0 ||
      !!message.status ||
      !!message.statusDetail ||
      !!lastTracePhase ||
      !!message.agentTrace;

    const ThinkingIndicator = ({ status }: { status: string }) => {
      const label = getStatusMessage(status) ?? "Thinking";
      const icon = getStatusIcon(status);
      const isSpinning = status === "generating";
      return (
        <div className="flex items-center gap-3 py-2 mb-1">
          <div className="relative flex items-center justify-center w-7 h-7 shrink-0">
            <span className="absolute inset-0 rounded-full bg-muted/60 dark:bg-muted/40" />
            {!isSpinning && (
              <>
                <span
                  className="absolute inset-0 rounded-full bg-primary/8 dark:bg-primary/10 animate-ping"
                  style={{ animationDuration: "2s" }}
                />
                <span
                  className="absolute inset-0 rounded-full bg-primary/5 dark:bg-primary/8 animate-ping"
                  style={{ animationDuration: "2s", animationDelay: "0.5s" }}
                />
              </>
            )}
            <span className="relative text-muted-foreground/80 dark:text-muted-foreground/70">
              {icon}
            </span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-sm font-sans text-muted-foreground/80 dark:text-muted-foreground/70 tracking-wide">
              {label}
            </span>
            <span className="flex items-end gap-[3px] pb-px">
              <span
                className="w-[3px] h-[3px] rounded-full bg-muted-foreground/40 animate-bounce"
                style={{ animationDelay: "0ms", animationDuration: "1.1s" }}
              />
              <span
                className="w-[3px] h-[3px] rounded-full bg-muted-foreground/40 animate-bounce"
                style={{ animationDelay: "180ms", animationDuration: "1.1s" }}
              />
              <span
                className="w-[3px] h-[3px] rounded-full bg-muted-foreground/40 animate-bounce"
                style={{ animationDelay: "360ms", animationDuration: "1.1s" }}
              />
            </span>
          </div>
        </div>
      );
    };

    const handleAddExternalSources = async (selectedSources: ExternalSource[]) => {
      if (!onAddExternalSources) return;
      setIsAddingSources(true);
      try {
        await onAddExternalSources(selectedSources);
        setIsSourcesModalOpen(false);
      } finally {
        setIsAddingSources(false);
      }
    };

    const FollowUpChips = () => {
      if (!message.followUps || message.followUps.length === 0 || !onSendFollowUp) return null;
      return (
        <div className="mt-6 w-full">
          <p className="text-sm font-semibold text-foreground mb-2 font-sans">Follow-ups</p>
          <div className="flex flex-col divide-y divide-border/40">
            {message.followUps.map((q, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSendFollowUp(q)}
                className="group flex items-center gap-3 w-full py-2.5 hover:bg-accent/40 -mx-2 px-2 rounded transition-colors text-left font-sans"
              >
                <span className="shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors mt-px">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 13 13"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M2 2V7.5C2 8.328 2.672 9 3.5 9H11M11 9L8 6M11 9L8 12"
                      stroke="currentColor"
                      strokeWidth="1.3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="text-sm text-foreground/75 group-hover:text-foreground transition-colors leading-snug">
                  {q}
                </span>
              </button>
            ))}
          </div>
        </div>
      );
    };

    return (
      <div
        className={`group/message flex min-w-0 w-full max-w-full flex-col ${isUser ? "items-end gap-1" : "items-start gap-1"}`}
        data-message-id={message.id}
      >
        {isUser ? (
          <div className="flex flex-row items-start gap-2 max-w-[95%]">
            <div className="shrink-0 pt-4">
              <ActionBar />
            </div>
            <div
              className="p-4 rounded-xl font-serif text-lg leading-relaxed text-foreground shadow-sm bg-[color-mix(in_oklch,var(--primary)_10%,var(--background))]"
              data-quotable="message"
              data-quotable-id={message.id}
              data-quotable-title="Your message"
            >
              {renderMessageWithReferences(
                message.id,
                message.content,
                message.references,
                refHandlers,
                {
                  isStreamingVisual,
                }
              )}
            </div>
          </div>
        ) : (
          <>
            {showAgentPanel && (
              <AgentActivityPanel
                isStreaming={isStreamingRow && isAssistantStreamActive}
                activityPhase={message.status}
                activityDetail={message.statusDetail}
                historicalPhase={historicalPhase}
                historicalDetail={historicalDetail}
                activityPhases={activityPhases}
                toolCalls={toolCalls}
                groundingChecks={groundingChecks}
                references={message.references}
                clarificationResponse={
                  !!message.clarificationQuestion || !!message.agentTrace?.clarification
                }
              />
            )}
            {message.status && !message.content && !showAgentPanel && (
              <ThinkingIndicator status={message.status} />
            )}
            {message.content && (
              <div
                className="w-full min-w-0 max-w-4xl font-serif text-lg leading-relaxed text-foreground"
                data-quotable="message"
                data-quotable-id={message.id}
                data-quotable-title={message.role === "assistant" ? "AI Response" : "Your message"}
              >
                {renderMessageWithReferences(
                  message.id,
                  message.content,
                  message.references,
                  refHandlers,
                  {
                    isStreamingVisual,
                  }
                )}
                <div className="mt-3 pt-3 border-t border-dashed border-border/40">
                  <ActionBar />
                </div>
                <FollowUpChips />
                {message.deepResearch?.researchRunId && message.content ? (
                  <DeepResearchSourcesSection
                    researchRunId={message.deepResearch.researchRunId}
                    answerContent={message.content}
                    notebookId={notebookId}
                    onOpenNotebookSource={onOpenNotebookSource}
                    notebookDocumentIds={notebookDocumentIds}
                  />
                ) : null}
                <ExternalSourcesModal
                  isOpen={isSourcesModalOpen}
                  onClose={() => setIsSourcesModalOpen(false)}
                  sources={externalSources ?? []}
                  onAddSelected={handleAddExternalSources}
                  isLoading={isAddingSources}
                />
              </div>
            )}
          </>
        )}
      </div>
    );
  },
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.status === next.message.status &&
    prev.message.statusDetail === next.message.statusDetail &&
    prev.message.references === next.message.references &&
    prev.message.feedback === next.message.feedback &&
    prev.message.followUps === next.message.followUps &&
    prev.message.toolCalls === next.message.toolCalls &&
    prev.message.groundingChecks === next.message.groundingChecks &&
    prev.message.clarificationQuestion === next.message.clarificationQuestion &&
    JSON.stringify(prev.message.agentTrace) === JSON.stringify(next.message.agentTrace) &&
    prev.copiedMessageId === next.copiedMessageId &&
    prev.isAssistantStreamActive === next.isAssistantStreamActive &&
    prev.showSourcesButton === next.showSourcesButton &&
    JSON.stringify(prev.externalSources) === JSON.stringify(next.externalSources) &&
    prev.message.deepResearch?.researchRunId === next.message.deepResearch?.researchRunId &&
    prev.notebookId === next.notebookId
);

MessageBubble.displayName = "MessageBubble";
