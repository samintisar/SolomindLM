import React from "react";
import { Virtuoso } from "react-virtuoso";
import { MessageBubble } from "./MessageBubble";
import { ResearchPlanMessage } from "./ResearchPlanMessage";
import { ReferenceTooltip } from "./ReferenceTooltip";
import { ChatEmptyState } from "./ChatEmptyState";
import { RefHandlers } from "../utils/messageRendering.utils";
import type { Message, ReferenceChunk } from "@/shared/types/index";
import type { Id } from "@convex/_generated/dataModel";

interface ChatMessagesProps {
  messages: Message[];
  memoizedMessages: Message[];
  virtuosoRef: React.RefObject<any>;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  composerScrollPaddingPx: number;
  isLoading: boolean;
  refHandlers: RefHandlers;
  onCopyMessage: (message: Message) => Promise<void>;
  copiedMessageId: string | null;
  onSetFeedback?: (messageId: string, feedback: "up" | "down" | null) => void;
  onSendFollowUp: (text: string) => void;
  onRetry?: (messageId: string) => void;
  tooltip: {
    hoveredRefId: number | null;
    tooltipRef: React.RefObject<HTMLDivElement | null>;
    tooltipContent: { ref: ReferenceChunk; x: number; y: number } | null;
    setIsTooltipHovered: (v: boolean) => void;
    isTooltipHovered: boolean;
    closeTooltip: () => void;
  };
  handleOpenReferenceInSources: (reference: ReferenceChunk) => void;
  addExternalSourcesMutation: (args: {
    notebookId: Id<"notebooks">;
    sources: Array<{ title: string; url: string; snippet: string; sourceType: string }>;
  }) => Promise<void>;
  notebookId?: string | null;
  sources: Array<{ id: string; selected?: boolean }>;
  handleApproveResearchPlan: (planId: string) => Promise<void>;
  handleRejectResearchPlan: (planId: string) => Promise<void>;
  // Empty state props
  handleSendChip: (text: string) => void;
  chatInputDisabled: boolean;
  sourceCount?: number;
  sourceSummary?: string | null;
  suggestions?: string[] | null;
  isLoadingSuggestions?: boolean;
  notebookIcon?: string | null;
  notebookCoverColor?: string | null;
  notebookTitle?: string;
}

export const ChatMessages: React.FC<ChatMessagesProps> = ({
  messages,
  memoizedMessages,
  virtuosoRef,
  messagesContainerRef,
  composerScrollPaddingPx,
  isLoading,
  refHandlers,
  onCopyMessage,
  copiedMessageId,
  onSetFeedback,
  onSendFollowUp,
  onRetry,
  tooltip,
  handleOpenReferenceInSources,
  addExternalSourcesMutation,
  notebookId,
  sources,
  handleApproveResearchPlan,
  handleRejectResearchPlan,
  handleSendChip,
  chatInputDisabled,
  sourceCount,
  sourceSummary,
  suggestions,
  isLoadingSuggestions,
  notebookIcon,
  notebookCoverColor,
  notebookTitle,
}) => {
  return (
    <div className="flex flex-1 min-h-0">
      <div
        ref={messagesContainerRef}
        className={`flex min-h-0 w-full min-w-0 flex-1 relative chat-panel-graph-grid ${
          messages.length === 0
            ? "overflow-y-auto overflow-x-hidden"
            : "overflow-x-hidden overflow-y-hidden"
        }`}
      >
        {messages.length === 0 ? (
          <ChatEmptyState
            onSendMessage={handleSendChip}
            disabled={chatInputDisabled}
            sourceCount={sourceCount}
            sourceSummary={sourceSummary}
            suggestions={suggestions}
            isLoadingSuggestions={isLoadingSuggestions}
            notebookIcon={notebookIcon}
            notebookCoverColor={notebookCoverColor}
            notebookTitle={notebookTitle}
          />
        ) : (
          <Virtuoso
            ref={virtuosoRef}
            className="min-h-0 w-full min-w-0"
            style={{ height: "100%" }}
            data={memoizedMessages}
            itemContent={(_index, message) => (
              <div className="max-w-full min-w-0 overflow-x-hidden px-3 py-3 sm:px-4 md:px-6">
                {message.researchPlan ? (
                  <ResearchPlanMessage
                    planId={message.researchPlan.planId}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    subQuestions={(message.researchPlan.subQuestions as any[]) ?? []}
                    onApprove={handleApproveResearchPlan}
                    onReject={handleRejectResearchPlan}
                  />
                ) : (
                  <>
                    <MessageBubble
                      message={message}
                      isAssistantStreamActive={
                        message.id === "__streaming__" ? isLoading : false
                      }
                      refHandlers={refHandlers}
                      onCopyMessage={onCopyMessage}
                      copiedMessageId={copiedMessageId}
                      onSetFeedback={onSetFeedback}
                      onSendFollowUp={onSendFollowUp}
                      onRetry={onRetry}
                      externalSources={message.externalSources}
                      onAddExternalSources={async (selectedSources) => {
                        if (!notebookId) return;
                        try {
                          await addExternalSourcesMutation({
                            notebookId: notebookId as Id<"notebooks">,
                            sources: selectedSources.map((s) => ({
                              title: s.title,
                              url: s.url,
                              snippet: s.snippet,
                              sourceType: s.sourceType,
                            })),
                          });
                        } catch (e) {
                          console.error("Failed to add external sources:", e);
                        }
                      }}
                      showSourcesButton={
                        message.role === "assistant" &&
                        !!message.externalSources &&
                        message.externalSources.length > 0
                      }
                    />
                  </>
                )}
              </div>
            )}
            components={{
              Footer: () => (
                <div
                  className="shrink-0"
                  style={{ height: composerScrollPaddingPx }}
                  aria-hidden
                />
              ),
            }}
            defaultItemHeight={150}
            increaseViewportBy={{ top: 200, bottom: 400 }}
          />
        )}

        {tooltip.tooltipContent && (
          <ReferenceTooltip
            hoveredRefId={tooltip.hoveredRefId!}
            tooltipRef={tooltip.tooltipRef}
            reference={tooltip.tooltipContent.ref}
            position={{ x: tooltip.tooltipContent.x, y: tooltip.tooltipContent.y }}
            onOpenInSources={(() => {
              const docId = tooltip.tooltipContent!.ref.documentId?.trim();
              if (!docId || !sources.some((s) => s.id === docId)) {
                return undefined;
              }
              return () => handleOpenReferenceInSources(tooltip.tooltipContent!.ref);
            })()}
            onAddToNotebook={(() => {
              const isExternal =
                !tooltip.tooltipContent!.ref.documentId && !!tooltip.tooltipContent!.ref.sourceUrl;
              if (!isExternal || !notebookId) return undefined;
              return async () => {
                try {
                  await addExternalSourcesMutation({
                    notebookId: notebookId as Id<"notebooks">,
                    sources: [
                      {
                        title: tooltip.tooltipContent!.ref.sourceTitle,
                        url: tooltip.tooltipContent!.ref.sourceUrl!,
                        snippet: tooltip.tooltipContent!.ref.content.slice(0, 500),
                        sourceType: "web",
                      },
                    ],
                  });
                } catch (e) {
                  console.error("Failed to add external source:", e);
                }
              };
            })()}
            onMouseEnter={() => {
              tooltip.setIsTooltipHovered(true);
            }}
            onMouseLeave={() => {
              tooltip.setIsTooltipHovered(false);
              setTimeout(() => {
                if (!tooltip.isTooltipHovered) {
                  tooltip.closeTooltip();
                }
              }, 100);
            }}
          />
        )}
      </div>
    </div>
  );
};
