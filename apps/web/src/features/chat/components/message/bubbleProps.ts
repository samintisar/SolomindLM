import type { ExternalSource, Message } from "@/shared/types/index";
import type { RefHandlers } from "../../utils/messageRendering.utils";
import type { MessageFeedback } from "./ActionBar";

export interface MessageBubbleProps {
  message: Message;
  /** True only while the HTTP stream is still delivering tokens (not after __DONE). */
  isAssistantStreamActive?: boolean;
  refHandlers: RefHandlers;
  onCopyMessage: (message: Message) => void;
  /** This message was just copied (ChatPanel passes `copiedMessageId === message.id`, so a copy re-renders one row). */
  isCopied: boolean;
  onSetFeedback?: (messageId: string, feedback: MessageFeedback | null) => void;
  onSendFollowUp?: (text: string) => void;
  onRetry?: (messageId: string) => void;
  /** Opens the panel-level dialog for the message's external sources. Must be a stable callback. */
  onOpenExternalSources?: (sources: ExternalSource[]) => void;
  notebookId?: string;
  onOpenNotebookSource?: (documentId: string) => void;
  notebookDocumentIds?: Set<string>;
}

/**
 * Memo comparator. Callbacks are compared by identity, so ChatPanel must pass stable ones
 * (otherwise every bubble re-renders whenever the panel does). The streaming row's `agentTrace`
 * and `externalSources` are rebuilt on each stream update: identity first, then by value, and
 * last so the cheap checks short-circuit before any JSON work.
 */
export function areMessageBubblePropsEqual(
  prev: MessageBubbleProps,
  next: MessageBubbleProps
): boolean {
  const a = prev.message;
  const b = next.message;
  return (
    a.id === b.id &&
    a.role === b.role &&
    a.content === b.content &&
    a.status === b.status &&
    a.statusDetail === b.statusDetail &&
    a.references === b.references &&
    a.feedback === b.feedback &&
    a.followUps === b.followUps &&
    a.toolCalls === b.toolCalls &&
    a.groundingChecks === b.groundingChecks &&
    a.clarificationQuestion === b.clarificationQuestion &&
    a.deepResearch?.researchRunId === b.deepResearch?.researchRunId &&
    prev.isCopied === next.isCopied &&
    prev.isAssistantStreamActive === next.isAssistantStreamActive &&
    prev.notebookId === next.notebookId &&
    prev.notebookDocumentIds === next.notebookDocumentIds &&
    prev.refHandlers === next.refHandlers &&
    prev.onCopyMessage === next.onCopyMessage &&
    prev.onSetFeedback === next.onSetFeedback &&
    prev.onSendFollowUp === next.onSendFollowUp &&
    prev.onRetry === next.onRetry &&
    prev.onOpenExternalSources === next.onOpenExternalSources &&
    prev.onOpenNotebookSource === next.onOpenNotebookSource &&
    (a.agentTrace === b.agentTrace ||
      JSON.stringify(a.agentTrace) === JSON.stringify(b.agentTrace)) &&
    (a.externalSources === b.externalSources ||
      JSON.stringify(a.externalSources) === JSON.stringify(b.externalSources))
  );
}
