import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  PanelLeftOpen,
  PanelRightOpen,
  MessageCircle,
  RefreshCw,
  FileText,
  MoreVertical,
  Download,
} from 'lucide-react';
import { useConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { DropdownMenu } from '@/shared/ui/DropdownMenu';
import { Virtuoso } from 'react-virtuoso';
import { Message, Note } from '@/shared/types/index';
import { useToast } from '@/shared/contexts/ToastContext';
import { useChatStreamingContext } from '../ChatStreamingContext';
import { exportAsMarkdown } from '../utils/exportChat';
import { useSaveChat } from '../services/userNotesApi';
import { RefHandlers } from '../utils/messageRendering';
import { MessageBubble } from './MessageBubble';
import { ReferenceTooltip } from './ReferenceTooltip';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatInput } from './ChatInput';
import { useSourcesContext } from '../../sources/SourcesContext';

interface ChatPanelProps {
  isLeftOpen: boolean;
  isRightOpen: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  notebookId?: string | null;
  notebookTitle?: string;
  notebookIcon?: string | null;
  notebookCoverColor?: string | null;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  isLeftOpen,
  isRightOpen,
  toggleLeft,
  toggleRight,
  notebookId,
  notebookTitle = 'Chat',
  notebookIcon,
  notebookCoverColor,
}) => {
  const {
    messages,
    isChatStreaming: isLoading,
    remoteChatGenerating,
    onSendMessage,
    onClearHistory,
    onSetFeedback,
    onRetry,
    onSaveChatOptimistic,
    sourceCount,
    sourceSummary,
    suggestions,
    isLoadingSuggestions,
  } = useChatStreamingContext();
  const { sources } = useSourcesContext();
  const [hoveredRefId, setHoveredRefId] = useState<number | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<'top' | 'bottom'>('top');
  const [tooltipStyle, setTooltipStyle] = useState<{ top?: number; left?: number }>({});
  const [isTooltipHovered, setIsTooltipHovered] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const chatInputDisabled = isSending || isLoading || remoteChatGenerating;

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const virtuosoRef = useRef<any>(null);

  const { confirm, ConfirmDialogComponent } = useConfirmDialog();
  const { success, error: toastError } = useToast();
  const saveChat = useSaveChat();

  // --- Chat action handlers ---

  const handleDeleteHistory = async () => {
    const confirmed = await confirm(
      'Clear Chat History',
      'Are you sure you want to delete all chat history? This action cannot be undone.',
      { confirmText: 'Clear History', cancelText: 'Cancel', variant: 'danger' }
    );
    if (confirmed) onClearHistory?.();
  };

  const handleExportChat = () => {
    if (messages.length === 0) { toastError('No messages to export'); return; }
    exportAsMarkdown(messages, notebookTitle);
    success('Chat exported successfully');
  };

  const handleSaveToNote = async () => {
    if (messages.length === 0) { toastError('No messages to save'); return; }
    if (!notebookId) { toastError('No notebook selected'); return; }

    const placeholderNote: Note = {
      id: `pending-save-${Date.now()}`,
      title: 'Saved chat',
      preview: 'Note · Saved Chat',
      type: 'note',
      noteType: 'chat',
      status: 'generating',
      content: undefined,
      messages: [],
      metadata: { messageCount: messages.length, savedAt: new Date().toISOString() },
    };
    onSaveChatOptimistic?.({ notebookId, note: placeholderNote });
    try {
      const serializedMessages = messages.map((msg) => ({
        ...msg,
        timestamp: msg.timestamp instanceof Date ? msg.timestamp.getTime() : msg.timestamp,
      }));
      await saveChat({ notebookId, messages: serializedMessages, messageCount: messages.length });
    } catch (error) {
      console.error('Failed to save chat:', error);
    } finally {
      onSaveChatOptimistic?.(null);
    }
  };

  // --- Tooltip / citation handlers ---

  const closeTooltip = useCallback(() => {
    if (hideTooltipTimeoutRef.current) clearTimeout(hideTooltipTimeoutRef.current);
    setHoveredRefId(null);
    setHoveredMessageId(null);
    setIsTooltipHovered(false);
  }, []);

  const handleRefEnter = useCallback(() => {
    if (hideTooltipTimeoutRef.current) clearTimeout(hideTooltipTimeoutRef.current);
  }, []);

  const handleRefLeave = useCallback(() => {
    if (hideTooltipTimeoutRef.current) clearTimeout(hideTooltipTimeoutRef.current);
    hideTooltipTimeoutRef.current = setTimeout(() => {
      if (!isTooltipHovered) { setHoveredRefId(null); setHoveredMessageId(null); }
    }, 150);
  }, [isTooltipHovered]);

  const handleRefHover = useCallback(
    (refId: number, messageId: string, event: React.MouseEvent) => {
      handleRefEnter();
      setHoveredRefId(refId);
      setHoveredMessageId(messageId);
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const containerRect = messagesContainerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const position = rect.top - containerRect.top > containerRect.bottom - rect.bottom ? 'top' : 'bottom';
      setTooltipPosition(position);
      const refCenterX = rect.left - containerRect.left + rect.width / 2;
      const refCenterY = rect.top - containerRect.top;
      setTooltipStyle(
        position === 'top'
          ? { left: refCenterX, top: refCenterY - 2 }
          : { left: refCenterX, top: refCenterY + rect.height + 2 }
      );
    },
    [handleRefEnter]
  );

  const handleRefClick = useCallback(
    (refId: number, messageId: string, event: React.MouseEvent | React.TouchEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (hideTooltipTimeoutRef.current) clearTimeout(hideTooltipTimeoutRef.current);
      if (hoveredRefId === refId && hoveredMessageId === messageId) {
        setHoveredRefId(null);
        setHoveredMessageId(null);
      } else {
        handleRefHover(refId, messageId, event as React.MouseEvent);
      }
    },
    [hoveredRefId, hoveredMessageId, handleRefHover]
  );

  useEffect(() => {
    if (!hoveredRefId) return;
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (tooltipRef.current?.contains(event.target as Node)) return;
      if ((event.target as HTMLElement)?.closest('span[title^="Reference"]')) return;
      closeTooltip();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [hoveredRefId, closeTooltip]);

  const refHandlers: RefHandlers = useMemo(
    () => ({ onRefHover: handleRefHover, onRefLeave: handleRefLeave, onRefClick: handleRefClick }),
    [handleRefHover, handleRefLeave, handleRefClick]
  );

  // --- Message handlers ---

  const copyMessageAsMarkdown = useCallback(async (message: Message) => {
    const stripRefs = (c: string) => {
      const m = c.match(/\n?(?:References|Reference):\s*\n?[\d\s\.,\-:\–\—]*$/i);
      return m ? c.substring(0, m.index).trim() : c;
    };
    try {
      await navigator.clipboard.writeText(
        message.role === 'assistant' ? stripRefs(message.content) : message.content
      );
      setCopiedMessageId(message.id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch { /* clipboard API not available */ }
  }, []);

  const handleSendMessage = useCallback(async () => {
    const trimmed = inputMessage.trim();
    if (!trimmed || chatInputDisabled || !notebookId || !onSendMessage) return;

    // Check if user has selected any sources
    const selectedSources = sources?.filter((s) => s.selected) ?? [];
    if (selectedSources.length === 0) {
      toastError('Please select at least one source before asking a question');
      return;
    }

    setIsSending(true);
    setInputMessage('');
    onSendMessage(trimmed);
    setIsSending(false);
  }, [inputMessage, chatInputDisabled, notebookId, onSendMessage, sources, toastError]);

  const handleSendChip = useCallback(
    (text: string) => {
      if (chatInputDisabled || !notebookId || !onSendMessage) return;

      // Check if user has selected any sources
      const selectedSources = sources?.filter((s) => s.selected) ?? [];
      if (selectedSources.length === 0) {
        toastError('Please select at least one source before asking a question');
        return;
      }

      onSendMessage(text);
    },
    [chatInputDisabled, notebookId, onSendMessage, sources, toastError]
  );

  // --- Scroll to bottom ---

  useEffect(() => {
    if (virtuosoRef.current && messages.length > 0) {
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, align: 'end', behavior: 'smooth' });
      }, 100);
    }
  }, [messages.length]);

  // --- Tooltip position computation ---

  const tooltipContent = useMemo(() => {
    if (hoveredRefId === null || hoveredMessageId === null || !messagesContainerRef.current) return null;
    const hoveredMessage = messages.find((msg) => msg.id === hoveredMessageId);
    const refsArray = Array.isArray(hoveredMessage?.references) ? hoveredMessage.references : [];
    const ref = refsArray.find((r) => Number(r.id) === hoveredRefId);
    const containerRect = messagesContainerRef.current.getBoundingClientRect();
    if (!ref || !containerRect) return null;

    const tooltipWidth = 384;
    const rawX = (tooltipStyle.left || 0) + containerRect.left - tooltipWidth / 2;
    const x = Math.max(containerRect.left + 16, Math.min(rawX, containerRect.right - tooltipWidth - 16));
    const y =
      tooltipPosition === 'top'
        ? containerRect.top + (tooltipStyle.top || 0) - 256 - 2
        : containerRect.top + (tooltipStyle.top || 0);

    return { ref, x, y };
  }, [hoveredRefId, hoveredMessageId, messages, tooltipStyle, tooltipPosition]);

  const memoizedMessages = useMemo(() => messages, [messages]);

  return (
    <>
      <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">

        {/* Header */}
        <div className="hidden md:flex items-center justify-between p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10 h-14">
          <div className="flex items-center gap-2 text-foreground">
            <MessageCircle className="w-4 h-4" />
            <span className="font-display font-bold text-sm tracking-wide uppercase">Chat</span>
          </div>
          <div className="flex items-center gap-2">
            {!isLeftOpen && (
              <button
                onClick={toggleLeft}
                className="p-2 bg-card border border-border rounded-lg shadow-sm hover:bg-accent text-foreground transition-colors shrink-0"
                title="Open Sources"
              >
                <PanelLeftOpen className="w-4 h-4" />
              </button>
            )}
            {!isRightOpen && (
              <button
                onClick={toggleRight}
                className="p-2 bg-card border border-border rounded-lg shadow-sm hover:bg-accent text-foreground transition-colors shrink-0"
                title="Open Studio"
              >
                <PanelRightOpen className="w-4 h-4" />
              </button>
            )}
            <DropdownMenu
              align="right"
              trigger={
                <button
                  className="p-2 bg-card border border-border rounded-lg shadow-sm hover:bg-accent text-foreground transition-colors shrink-0"
                  title="Chat options"
                  type="button"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              }
            >
              <div className="py-1">
                <button
                  onClick={handleDeleteHistory}
                  className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
                  role="menuitem"
                >
                  <RefreshCw className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>Refresh chat</span>
                </button>
                <button
                  onClick={handleExportChat}
                  className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
                  role="menuitem"
                >
                  <Download className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>Export chat</span>
                </button>
                <button
                  onClick={handleSaveToNote}
                  className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
                  role="menuitem"
                >
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>Save to note</span>
                </button>
              </div>
            </DropdownMenu>
          </div>
        </div>

        {/* Messages Area */}
        <div
          ref={messagesContainerRef}
          className={`flex-1 min-h-0 relative chat-panel-graph-grid ${
            messages.length === 0 ? 'overflow-y-auto overflow-x-hidden' : 'overflow-hidden'
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
              style={{ height: '100%' }}
              data={memoizedMessages}
              itemContent={(_index, message) => (
                <div className="px-3 py-3 sm:px-4 md:px-6">
                  <MessageBubble
                    message={message}
                    isAssistantStreamActive={message.id === '__streaming__' ? isLoading : false}
                    refHandlers={refHandlers}
                    onCopyMessage={copyMessageAsMarkdown}
                    copiedMessageId={copiedMessageId}
                    onSetFeedback={onSetFeedback}
                    onSendFollowUp={handleSendChip}
                    onRetry={onRetry}
                  />
                </div>
              )}
              components={{ Footer: () => <div className="h-56" /> }}
              defaultItemHeight={150}
              increaseViewportBy={{ top: 200, bottom: 400 }}
            />
          )}

          {/* Floating Reference Tooltip */}
          {tooltipContent && (
            <ReferenceTooltip
              hoveredRefId={hoveredRefId!}
              tooltipRef={tooltipRef}
              reference={tooltipContent.ref}
              position={{ x: tooltipContent.x, y: tooltipContent.y }}
              onMouseEnter={() => {
                setIsTooltipHovered(true);
                if (hideTooltipTimeoutRef.current) clearTimeout(hideTooltipTimeoutRef.current);
              }}
              onMouseLeave={() => {
                setIsTooltipHovered(false);
                hideTooltipTimeoutRef.current = setTimeout(() => {
                  if (!isTooltipHovered) { setHoveredRefId(null); setHoveredMessageId(null); }
                }, 100);
              }}
            />
          )}
        </div>

        {/* Input Area */}
        <div className="absolute bottom-8 left-0 right-0 px-4 flex justify-center z-20">
          <ChatInput
            value={inputMessage}
            onChange={setInputMessage}
            onSend={handleSendMessage}
            disabled={chatInputDisabled}
            notebookId={notebookId}
          />
        </div>

      </div>
      <ConfirmDialogComponent />
    </>
  );
};
