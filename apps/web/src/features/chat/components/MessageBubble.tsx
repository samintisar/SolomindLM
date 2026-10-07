import React from "react";
import type {
  AgentGroundingCheck,
  ChatActivityPhase,
  Message,
  MessageToolCall,
} from "@/shared/types/index";
import { cn } from "@/shared/utils/cn";
import { AgentActivityPanel } from "./AgentActivityPanel";
import { DeepResearchSourcesSection } from "./DeepResearchSourcesSection";
import { MessageMarkdown } from "./MessageMarkdown";
import { ActionBar } from "./message/ActionBar";
import { areMessageBubblePropsEqual, type MessageBubbleProps } from "./message/bubbleProps";
import { FollowUpChips } from "./message/FollowUpChips";
import { SourcesPill } from "./message/SourcesPill";

/** Synthetic rows the chat stream adds while an answer is pending (see `useChatStream`). */
const PENDING_ROW_IDS = new Set(["__streaming__", "__remote_generating__"]);

/** A user message this fresh was just sent; older ones are history (load, scroll, thread switch). */
const FRESH_USER_MESSAGE_MS = 10_000;

const ENTRANCE = "animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out";

const NO_TOOL_CALLS: MessageToolCall[] = [];
const NO_GROUNDING_CHECKS: AgentGroundingCheck[] = [];
const NO_PHASES: Array<{ status: string; message: string }> = [];

/**
 * Entrance animation, decided per render. tw-animate-css plays on mount (or when the class is
 * added), and dropping the class later never replays it. Virtuoso keys rows by index, so when the
 * persisted answer replaces the `__streaming__` row it re-renders the same element: the class
 * goes away and nothing replays. History (old timestamps) never animates, so scrolling a
 * virtualized row back into view or switching threads stays still.
 */
function playsEntrance(message: Message): boolean {
  if (PENDING_ROW_IDS.has(message.id)) return true;
  if (message.role !== "user") return false;
  const sentAt = message.timestamp?.getTime();
  return typeof sentAt === "number" && Date.now() - sentAt < FRESH_USER_MESSAGE_MS;
}

function MessageBubbleImpl({
  message,
  isAssistantStreamActive = false,
  refHandlers,
  onCopyMessage,
  isCopied,
  onSetFeedback,
  onSendFollowUp,
  onRetry,
  onOpenExternalSources,
  notebookId,
  onOpenNotebookSource,
  notebookDocumentIds,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const handleCopy = () => onCopyMessage(message);
  const entrance = playsEntrance(message) && ENTRANCE;

  const isStreamingRow = message.id === "__streaming__";
  const isStreamingVisual = !isUser && isStreamingRow && isAssistantStreamActive;

  if (isUser) {
    return (
      // `key` remounts the root when a row flips between user and assistant at the same index.
      <div
        key="user"
        className={cn(
          "group/message flex w-full min-w-0 max-w-full flex-col items-end gap-1",
          entrance
        )}
        data-message-id={message.id}
      >
        <div className="min-w-0 max-w-prose rounded-2xl bg-secondary px-4 py-2.5 text-lg leading-relaxed text-secondary-foreground wrap-break-word">
          <MessageMarkdown
            messageId={message.id}
            content={message.content}
            handlers={refHandlers}
            streaming={isStreamingVisual}
          />
        </div>
        <ActionBar copied={isCopied} onCopy={handleCopy} />
      </div>
    );
  }

  const toolCalls = message.toolCalls ?? message.agentTrace?.toolCalls ?? NO_TOOL_CALLS;
  const groundingChecks =
    message.groundingChecks ?? message.agentTrace?.grounding ?? NO_GROUNDING_CHECKS;
  const activityPhases = message.agentTrace?.phases ?? NO_PHASES;
  const lastTracePhase = activityPhases.at(-1);
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

  const canRetry = !!onRetry && !PENDING_ROW_IDS.has(message.id);
  const externalSources = message.externalSources;
  const hasSourcesPill = !!externalSources && externalSources.length > 0;

  return (
    <div
      key="assistant"
      className={cn(
        "group/message flex w-full min-w-0 max-w-full flex-col items-start gap-1",
        entrance
      )}
      data-message-id={message.id}
    >
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
      {message.content && (
        <div className="w-full min-w-0 max-w-4xl text-lg leading-relaxed text-foreground">
          <MessageMarkdown
            messageId={message.id}
            content={message.content}
            handlers={refHandlers}
            streaming={isStreamingVisual}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {hasSourcesPill ? (
              <SourcesPill sources={externalSources} onOpen={onOpenExternalSources} />
            ) : null}
            <ActionBar
              copied={isCopied}
              onCopy={handleCopy}
              onRetry={canRetry ? () => onRetry(message.id) : undefined}
              feedback={message.feedback}
              onFeedback={onSetFeedback ? (next) => onSetFeedback(message.id, next) : undefined}
            />
          </div>
          {message.followUps && onSendFollowUp ? (
            <FollowUpChips followUps={message.followUps} onSend={onSendFollowUp} />
          ) : null}
          {message.deepResearch?.researchRunId ? (
            <DeepResearchSourcesSection
              researchRunId={message.deepResearch.researchRunId}
              answerContent={message.content}
              notebookId={notebookId}
              onOpenNotebookSource={onOpenNotebookSource}
              notebookDocumentIds={notebookDocumentIds}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

export const MessageBubble = React.memo(MessageBubbleImpl, areMessageBubblePropsEqual);

MessageBubble.displayName = "MessageBubble";
