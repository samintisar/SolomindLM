import React from "react";
import { MessageCircle } from "lucide-react";
import { useConfirmDialog } from "@/shared/ui/useConfirmDialog";
import { SelectionQuoteProvider } from "../contexts/SelectionQuoteContext";
import { SelectionTooltip } from "./SelectionTooltip";
import { ChatInput } from "./ChatInput";
import { ConfigureChatModal } from "./ConfigureChatModal";
import { useChatPanel } from "../hooks/useChatPanel";
import { ChatHeader } from "./ChatHeader";
import { ChatMessages } from "./ChatMessages";
import type { ChatSettings } from "@/shared/types/index";

interface ChatPanelProps {
  isLeftOpen: boolean;
  isRightOpen: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  notebookId?: string | null;
  notebookTitle?: string;
  notebookIcon?: string | null;
  notebookCoverColor?: string | null;
  chatSettings?: ChatSettings;
  onOpenNotebookSource?: (documentId: string) => void;
}

const ChatPanelInner: React.FC<ChatPanelProps> = ({
  isLeftOpen,
  isRightOpen,
  toggleLeft,
  toggleRight,
  notebookId,
  notebookTitle = "Chat",
  notebookIcon,
  notebookCoverColor,
  chatSettings,
  onOpenNotebookSource,
}) => {
  const chat = useChatPanel({ notebookId, notebookTitle, onOpenNotebookSource });
  const { ConfirmDialogComponent } = useConfirmDialog();

  return (
    <>
      <SelectionTooltip />
      <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
        {/* Panel header */}
        <div className="flex items-center justify-between gap-2 border-b border-border bg-background/80 p-4 backdrop-blur-sm sticky top-0 z-20 h-14 shrink-0 md:z-10">
          <div className="flex min-w-0 items-center gap-2 text-foreground">
            <MessageCircle className="h-4 w-4 shrink-0" />
            <span className="truncate font-display text-sm font-bold uppercase tracking-wide">
              Chat
            </span>
          </div>
          <ChatHeader
            isLeftOpen={isLeftOpen}
            isRightOpen={isRightOpen}
            toggleLeft={toggleLeft}
            toggleRight={toggleRight}
            historyOpen={chat.historyOpen}
            setHistoryOpen={chat.setHistoryOpen}
            conversations={chat.conversations}
            activeConversationId={chat.activeConversationId}
            onSelectConversation={chat.onSelectConversation}
            onRenameConversation={chat.onRenameConversation}
            onDeleteConversation={chat.onDeleteConversation}
            pinnedIds={chat.pinning.pinnedIds}
            handleTogglePin={chat.pinning.handleTogglePin}
            handleNewConversation={chat.handleNewConversation}
            isCreatingConversation={chat.isCreatingConversation}
            handleExportChat={chat.actions.handleExportChat}
            handleSaveToNote={chat.actions.handleSaveToNote}
            handlePinActiveChat={() => chat.pinning.handlePinActiveChat(chat.activeConversationId)}
            isPinned={!!chat.activeConversationId && chat.pinning.pinnedIds.has(chat.activeConversationId)}
            setIsConfigModalOpen={chat.setIsConfigModalOpen}
          />
        </div>

        {/* Messages Area */}
        <ChatMessages
          messages={chat.messages}
          memoizedMessages={chat.memoizedMessages}
          virtuosoRef={chat.virtuosoRef}
          messagesContainerRef={chat.messagesContainerRef}
          composerScrollPaddingPx={chat.composerScrollPaddingPx}
          isLoading={chat.isLoading}
          refHandlers={chat.refHandlers}
          onCopyMessage={chat.copyMessageAsMarkdown}
          copiedMessageId={chat.copiedMessageId}
          onSetFeedback={chat.onSetFeedback}
          onSendFollowUp={chat.handleSendChip}
          onRetry={chat.onRetry}
          tooltip={chat.tooltip}
          handleOpenReferenceInSources={chat.handleOpenReferenceInSources}
          addExternalSourcesMutation={chat.addExternalSourcesMutation}
          notebookId={notebookId}
          sources={chat.sources ?? []}
          handleApproveResearchPlan={chat.handleApproveResearchPlan}
          handleRejectResearchPlan={chat.research.handleRejectResearchPlan}
          handleSendChip={chat.handleSendChip}
          chatInputDisabled={chat.chatInputDisabled}
          sourceCount={chat.sourceCount}
          sourceSummary={chat.sourceSummary}
          suggestions={chat.suggestions}
          isLoadingSuggestions={chat.isLoadingSuggestions}
          notebookIcon={notebookIcon}
          notebookCoverColor={notebookCoverColor}
          notebookTitle={notebookTitle}
        />

        {/* Input Area */}
        <div className="pointer-events-none absolute bottom-3 left-0 right-0 z-20 flex min-w-0 justify-center px-3 sm:px-4">
          <ChatInput
            rootRef={chat.composerRootRef}
            value={chat.inputMessage}
            onChange={chat.setInputMessage}
            onSend={chat.handleSendMessage}
            disabled={chat.chatInputDisabled}
            isStreaming={chat.isLoading}
            waitingOnRemoteGeneration={chat.waitingOnRemoteGeneration}
            onStop={chat.onStopChat}
            notebookId={notebookId}
            deepResearchEnabled={chat.deepResearchEnabled}
            onToggleDeepResearch={() => chat.setDeepResearchEnabled((prev) => !prev)}
            sourceFilters={chat.sourceFilters}
            onSourceFilterChange={chat.setSourceFilters}
            academicFilters={chat.academicFilters}
            onAcademicFiltersChange={chat.setAcademicFilters}
            chatSettings={chatSettings}
            onModelChange={(modelId) =>
              chat.handleSaveChatConfig(
                {
                  instructionMode: chatSettings?.instructionMode ?? "default",
                  responseLength: chatSettings?.responseLength ?? "default",
                  customInstructions: chatSettings?.customInstructions,
                  smartModel: modelId,
                },
                { silentSuccess: true }
              )
            }
            onAppendTranscription={(text) => {
              chat.setInputMessage((prev) => {
                const t = text.trim();
                if (!t) return prev;
                if (!prev.trim()) return t;
                return `${prev} ${t}`;
              });
            }}
            onVoiceError={chat.toastError}
            quotes={chat.quotes}
            sources={chat.sources ?? []}
            mentionedSources={chat.mentionedSources}
            onMentionedSourcesChange={chat.setMentionedSources}
          />
        </div>
      </div>
      <ConfirmDialogComponent />
      <ConfigureChatModal
        isOpen={chat.isConfigModalOpen}
        onClose={() => chat.setIsConfigModalOpen(false)}
        onSave={chat.handleSaveChatConfig}
        chatSettings={chatSettings}
        saving={chat.isSavingConfig}
        instructionModeLocked={chat.messages.length > 0}
      />
    </>
  );
};

export const ChatPanel: React.FC<ChatPanelProps> = (props) => {
  return (
    <SelectionQuoteProvider>
      <ChatPanelInner {...props} />
    </SelectionQuoteProvider>
  );
};
