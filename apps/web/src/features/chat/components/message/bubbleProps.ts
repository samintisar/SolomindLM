import type { Message } from "@/shared/types/index";
import type { RefHandlers } from "../../utils/messageRendering.utils";
import type { ExternalSource } from "../ExternalSourcesModal";
import type { MessageFeedback } from "./ActionBar";

export interface MessageBubbleProps {
  message: Message;
  /** True only while the HTTP stream is still delivering tokens (not after __DONE). */
  isAssistantStreamActive?: boolean;
  refHandlers: RefHandlers;
  onCopyMessage: (message: Message) => void;
  copiedMessageId: string | null;
  onSetFeedback?: (messageId: string, feedback: MessageFeedback | null) => void;
  onSendFollowUp?: (text: string) => void;
  onRetry?: (messageId: string) => void;
  /** External sources discovered during this query — shown via the sources button */
  externalSources?: ExternalSource[];
  /** Opens the panel-level external sources dialog for this message. Must be a stable callback. */
  onOpenExternalSources?: (sources: ExternalSource[]) => void;
  /** Whether to show the "X sources" button for this message */
  showSourcesButton?: boolean;
  notebookId?: string;
  onOpenNotebookSource?: (documentId: string) => void;
  notebookDocumentIds?: Set<string>;
}

/**
 * Memo comparator. Callbacks are compared by identity, so ChatPanel must pass stable ones
 * (otherwise every bubble re-renders whenever the panel does). `agentTrace` and
 * `externalSources` are rebuilt on each stream update, so they compare by value.
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
    JSON.stringify(a.agentTrace) === JSON.stringify(b.agentTrace) &&
    JSON.stringify(prev.externalSources) === JSON.stringify(next.externalSources) &&
    prev.copiedMessageId === next.copiedMessageId &&
    prev.isAssistantStreamActive === next.isAssistantStreamActive &&
    prev.showSourcesButton === next.showSourcesButton &&
    prev.notebookId === next.notebookId &&
    prev.notebookDocumentIds === next.notebookDocumentIds &&
    prev.refHandlers === next.refHandlers &&
    prev.onCopyMessage === next.onCopyMessage &&
    prev.onSetFeedback === next.onSetFeedback &&
    prev.onSendFollowUp === next.onSendFollowUp &&
    prev.onRetry === next.onRetry &&
    prev.onOpenExternalSources === next.onOpenExternalSources &&
    prev.onOpenNotebookSource === next.onOpenNotebookSource
  );
}
