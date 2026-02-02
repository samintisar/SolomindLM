import React, { useState, useRef, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { ArrowUp, PanelLeftOpen, PanelRightOpen, MessageCircle, RefreshCw, Loader2, Search, FileText, Brain, Copy, Check } from 'lucide-react';
import { useConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { Virtuoso } from 'react-virtuoso';
import { Message } from '@/shared/types/index';
import { sanitizeMarkdown } from '@/shared/utils';

const MarkdownRenderer = lazy(() =>
  import('@/shared/components/MarkdownRenderer').then((m) => ({ default: m.default }))
);

interface ChatPanelProps {
  messages: Message[];
  isLeftOpen: boolean;
  isRightOpen: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  onClearHistory?: () => void;
  onSendMessage?: (message: string) => void;
  isLoading?: boolean;
  notebookId?: string | null;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  isLeftOpen,
  isRightOpen,
  toggleLeft,
  toggleRight,
  onClearHistory,
  onSendMessage,
  isLoading = false,
  notebookId,
}) => {
  const [hoveredRefId, setHoveredRefId] = useState<number | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<'top' | 'bottom'>('top');
  const [tooltipStyle, setTooltipStyle] = useState<{ top?: number; left?: number }>({});
  const [isTooltipHovered, setIsTooltipHovered] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const virtuosoRef = useRef<any>(null);

  const { confirm, ConfirmDialogComponent } = useConfirmDialog();

  const handleDeleteHistory = async () => {
    const confirmed = await confirm(
      'Clear Chat History',
      'Are you sure you want to delete all chat history? This action cannot be undone.',
      { confirmText: 'Clear History', cancelText: 'Cancel', variant: 'danger' }
    );
    if (confirmed) {
      onClearHistory?.();
    }
  };

  const handleRefHover = (refId: number, messageId: string, event: React.MouseEvent) => {
    handleRefEnter();
    setHoveredRefId(refId);
    setHoveredMessageId(messageId);
    // Calculate if tooltip should appear above or below based on position
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const containerRect = messagesContainerRef.current?.getBoundingClientRect();
    
    if (!containerRect) return;

    const tooltipHeight = 200;
    const spaceAbove = rect.top - containerRect.top;
    const spaceBelow = containerRect.bottom - rect.bottom;
    
    const position = spaceAbove > spaceBelow ? 'top' : 'bottom';
    setTooltipPosition(position);
    
    // Calculate tooltip position relative to messages container
    const refCenterX = rect.left - containerRect.left + rect.width / 2;
    const refCenterY = rect.top - containerRect.top;
    
    if (position === 'top') {
      setTooltipStyle({
        left: refCenterX,
        top: refCenterY - 2,
      });
    } else {
      setTooltipStyle({
        left: refCenterX,
        top: refCenterY + rect.height + 2,
      });
    }
  };

  const handleRefLeave = () => {
    // Cancel any existing timeout
    if (hideTooltipTimeoutRef.current) {
      clearTimeout(hideTooltipTimeoutRef.current);
    }
    
    // Set a delay before hiding - gives user time to move cursor to tooltip
    hideTooltipTimeoutRef.current = setTimeout(() => {
      if (!isTooltipHovered) {
        setHoveredRefId(null);
        setHoveredMessageId(null);
      }
    }, 150); // Reduced delay for better responsiveness
  };

  const handleRefEnter = () => {
    // Cancel any pending hide when hovering back over badge
    if (hideTooltipTimeoutRef.current) {
      clearTimeout(hideTooltipTimeoutRef.current);
    }
  };

  const handleRefClick = (refId: number, messageId: string, event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (hideTooltipTimeoutRef.current) {
      clearTimeout(hideTooltipTimeoutRef.current);
    }
    // Toggle tooltip on mobile/touch devices
    if (hoveredRefId === refId && hoveredMessageId === messageId) {
      setHoveredRefId(null);
      setHoveredMessageId(null);
    } else {
      handleRefHover(refId, messageId, event as React.MouseEvent);
    }
  };

  const closeTooltip = () => {
    if (hideTooltipTimeoutRef.current) {
      clearTimeout(hideTooltipTimeoutRef.current);
    }
    setHoveredRefId(null);
    setHoveredMessageId(null);
    setIsTooltipHovered(false);
  };

  // Close tooltip when clicking outside
  useEffect(() => {
    if (!hoveredRefId) return;
    
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (tooltipRef.current?.contains(target)) return;
      
      // Check if clicking on a citation badge
      const badge = (event.target as HTMLElement)?.closest('span[title^="Reference"]');
      if (badge) return;
      
      closeTooltip();
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [hoveredRefId]);

  // Handle sending a message
  const handleSendMessage = useCallback(async () => {
    const trimmed = inputMessage.trim();
    if (!trimmed || isSending || !notebookId || !onSendMessage) return;

    setIsSending(true);
    setInputMessage('');

    // Add user message immediately to UI
    onSendMessage(trimmed);

    try {
      // The actual streaming is handled by the parent component via chatApi
      // This component just triggers the send
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setIsSending(false);
    }
  }, [inputMessage, isSending, notebookId, onSendMessage]);

  // Handle textarea keydown (Enter to send)
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }, [handleSendMessage]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [inputMessage]);

  // Scroll to bottom when messages change using Virtuoso
  useEffect(() => {
    if (virtuosoRef.current && messages.length > 0) {
      // Small delay to ensure Virtuoso has updated
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: messages.length - 1,
          align: 'end',
          behavior: 'smooth',
        });
      }, 100);
    }
  }, [messages.length]);

  const copyMessageAsMarkdown = useCallback(async (message: Message) => {
    const toCopy = message.role === 'assistant' ? stripReferencesSection(message.content) : message.content;
    try {
      await navigator.clipboard.writeText(toCopy);
      setCopiedMessageId(message.id);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch {
      // clipboard API not available or denied
    }
  }, []);

  // Strip "References:" section from message content (LLM sometimes adds it)
  const stripReferencesSection = (content: string): string => {
    // Match "References:" or "Reference:" followed by a list of references
    // This handles formats like:
    // - References:\n1. Title\n2. Title
    // - References: 1 Title, 2 Title
    const referencesPattern = /\n?(?:References|Reference):\s*\n?[\d\s\.,\-:\–\—]*$/i;
    const match = content.match(referencesPattern);
    if (match) {
      return content.substring(0, match.index).trim();
    }
    return content;
  };

  const renderMessageWithReferences = (messageId: string, content: string, references?: any[] | any) => {
    // Strip any "References:" section that the LLM might have added
    const cleanContent = stripReferencesSection(content);

    // Sanitize markdown content to prevent XSS
    const sanitizedContent = sanitizeMarkdown(cleanContent);

    // Handle references that might be an object instead of array
    const refsArray = Array.isArray(references) ? references : [];

    // Convert citation markers [1] to inline code markers `CITE:1` for ReactMarkdown to process
    const processedContent = sanitizedContent.replace(/\[(\d+)\]/g, '`CITE:$1`');

    return (
      <div className="font-serif text-base leading-relaxed space-y-2">
        <Suspense fallback={<div className="animate-pulse h-4 bg-secondary/30 rounded w-full" />}>
          <MarkdownRenderer
            components={{
              img: () => null,
              a: ({ node, children, ...props }) => <span className="text-foreground">{children}</span>,
              video: () => null,
              audio: () => null,
              iframe: () => null,
              table: ({ children }) => React.createElement('table', { className: 'w-full border-collapse border border-border rounded-lg overflow-hidden' }, children),
              thead: ({ children }) => React.createElement('thead', { className: 'bg-secondary/50' }, children),
              tbody: ({ children }) => React.createElement('tbody', null, children),
              tr: ({ children }) => React.createElement('tr', { className: 'border-b border-border' }, children),
              th: ({ children }) => React.createElement('th', { className: 'px-4 py-2 text-left font-semibold text-foreground border-r border-border last:border-r-0' }, children),
              td: ({ children }) => React.createElement('td', { className: 'px-4 py-2 text-foreground border-r border-border last:border-r-0' }, children),
              p: ({ children }) => {
                return <p className="text-base leading-relaxed">{children}</p>;
              },
              code: ({ children, node, ...props }: any) => {
                // Check if this is a citation marker
                const text = String(children);
                // Code blocks are wrapped in pre, inline code is not
                const isInline = !node?.position || (node as any).data?.meta === undefined;
                
                if (isInline && text.startsWith('CITE:')) {
                  const refId = parseInt(text.slice(5));
                  return (
                    <span
                      onMouseEnter={(e) => handleRefHover(refId, messageId, e)}
                      onMouseLeave={handleRefLeave}
                      onClick={(e) => handleRefClick(refId, messageId, e)}
                      onTouchStart={(e) => handleRefClick(refId, messageId, e)}
                      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold cursor-pointer hover:bg-primary/90 active:bg-primary/80 transition-colors mx-1 align-middle relative touch-manipulation"
                      title={`Reference ${refId}`}
                      style={{ verticalAlign: 'middle' }}
                    >
                      {refId}
                    </span>
                  );
                }
                // Regular inline code
                return <code className="bg-secondary/50 px-1.5 py-0.5 rounded text-sm">{children}</code>;
              },
            }}
          >
            {processedContent}
          </MarkdownRenderer>
        </Suspense>
      </div>
    );
  };

  // Status icon mapping for "Thinking" states
  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'searching':
        return <Search className="w-4 h-4 animate-pulse" />;
      case 'reading':
        return <FileText className="w-4 h-4 animate-pulse" />;
      case 'thinking':
        return <Brain className="w-4 h-4 animate-pulse" />;
      case 'generating':
        return <Loader2 className="w-4 h-4 animate-spin" />;
      default:
        return null;
    }
  };

  // Status message mapping
  const getStatusMessage = (status?: string) => {
    switch (status) {
      case 'searching':
        return 'Searching sources...';
      case 'reading':
        return 'Reading sources...';
      case 'thinking':
        return 'Thinking...';
      case 'generating':
        return 'Generating response...';
      default:
        return null;
    }
  };

  // Memoized MessageBubble component for performance
  const MessageBubble = React.memo<{
    message: Message;
    onRefHover: (refId: number, messageId: string, event: React.MouseEvent) => void;
    onRefLeave: () => void;
    onCopyMessage: (message: Message) => void;
    copiedMessageId: string | null;
  }>(({ message, onRefHover, onRefLeave, onCopyMessage, copiedMessageId }) => {
    const isUser = message.role === 'user';
    const isCopied = copiedMessageId === message.id;

    // Extensible action list: add new entries here to show more message actions
    const messageActions = [
      {
        id: 'copy',
        label: isCopied ? 'Copied' : 'Copy',
        icon: isCopied ? Check : Copy,
        onClick: () => onCopyMessage(message),
        className: isCopied ? 'text-green-600' : '',
      },
      // Future: { id: 'regenerate', label: 'Regenerate', icon: RefreshCw, onClick: () => {} },
      // Future: { id: 'thumbs-up', label: 'Good response', icon: ThumbsUp, onClick: () => {} },
    ];

    const ActionBar = () => (
      <div
        className="flex items-center rounded-full border border-border/80 bg-card/90 shadow-sm backdrop-blur-sm overflow-hidden opacity-0 group-hover/message:opacity-100 transition-opacity duration-200"
        role="toolbar"
        aria-label="Message actions"
      >
        {messageActions.map(({ id, label, icon: Icon, onClick, className = '' }) => (
          <button
            key={id}
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className={`p-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors touch-manipulation first:pl-2.5 last:pr-2.5 ${className}`}
          >
            <Icon className="w-4 h-4" aria-hidden />
          </button>
        ))}
      </div>
    );

    return (
      <div className={`group/message flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1`} data-message-id={message.id}>
        {isUser ? (
          <div className="flex flex-row items-start gap-2 max-w-[95%] sm:max-w-[75%]">
            <div className="shrink-0 pt-4">
              <ActionBar />
            </div>
            <div className="p-4 rounded-xl font-serif text-lg leading-relaxed bg-primary/10 text-foreground shadow-sm">
              {renderMessageWithReferences(message.id, message.content, message.references)}
            </div>
          </div>
        ) : (
          <>
            {/* Status indicator for assistant messages */}
            {message.status && (
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                {getStatusIcon(message.status)}
                <span className="animate-pulse">{getStatusMessage(message.status)}</span>
              </div>
            )}
            <div className="max-w-[90%] font-serif text-lg leading-relaxed text-foreground">
              {renderMessageWithReferences(message.id, message.content, message.references)}
              <div className="flex justify-start mt-3">
                <ActionBar />
              </div>
            </div>
          </>
        )}
      </div>
    );
  }, (prev, next) => {
    // Only re-render if content, status, references, or copy state change
    return (
      prev.message.id === next.message.id &&
      prev.message.content === next.message.content &&
      prev.message.status === next.message.status &&
      prev.message.references === next.message.references &&
      prev.copiedMessageId === next.copiedMessageId
    );
  });

  // Memoize the messages array to prevent unnecessary re-renders
  const memoizedMessages = useMemo(() => messages, [messages]);

  return (
    <><div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
      
      {/* Header */}
      <div className="hidden md:flex items-center justify-between p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10 h-14">
        <div className="flex items-center gap-2 text-foreground">
          <MessageCircle className="w-4 h-4" />
          <span className="font-sans font-bold text-sm tracking-wide uppercase">Chat</span>
        </div>
        
        {/* Right Side Controls */}
        <div className="flex items-center gap-2">
          {/* Panel Toggle Buttons - shown when panels are closed */}
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

          {/* Refresh Button */}
          <button
            onClick={handleDeleteHistory}
            className="p-2 bg-card border border-border rounded-lg shadow-sm hover:bg-accent text-foreground transition-colors shrink-0"
            title="Refresh chat"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Area - Virtualized */}
      <div
        ref={messagesContainerRef}
        className="flex-1 overflow-hidden relative"
      >
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%' }}
          data={memoizedMessages}
          itemContent={(index, message) => (
            <div className="px-4 py-3 sm:px-12 md:px-20 lg:px-32">
              <MessageBubble
                key={message.id}
                message={message}
                onRefHover={handleRefHover}
                onRefLeave={handleRefLeave}
                onCopyMessage={copyMessageAsMarkdown}
                copiedMessageId={copiedMessageId}
              />
            </div>
          )}
          components={{
            Footer: () => <div className="h-56" />,
          }}
          defaultItemHeight={150}
          increaseViewportBy={{ top: 200, bottom: 400 }}
        />

        {/* Floating Tooltip */}
        {hoveredRefId !== null && hoveredMessageId !== null && messagesContainerRef.current && (() => {
          // Find the message being hovered
          const hoveredMessage = messages.find(msg => msg.id === hoveredMessageId);

          // Normalize references to array
          const refsArray = Array.isArray(hoveredMessage?.references) ? hoveredMessage.references : [];

          // Only look for references within that specific message
          const ref = refsArray.find(r => Number(r.id) === hoveredRefId);
          const containerRect = messagesContainerRef.current?.getBoundingClientRect();
          
          if (!ref || !containerRect) return null;

          const tooltipX = (tooltipStyle.left || 0) + containerRect.left;
          const tooltipWidth = 384; // w-96
          
          // Clamp tooltip X position to stay within viewport
          let adjustedX = tooltipX - tooltipWidth / 2;
          const minX = containerRect.left + 16; // padding
          const maxX = containerRect.right - tooltipWidth - 16;
          
          if (adjustedX < minX) adjustedX = minX;
          if (adjustedX > maxX) adjustedX = maxX;
          
          const tooltipY = tooltipPosition === 'top' 
            ? containerRect.top + (tooltipStyle.top || 0) - 256 - 2
            : containerRect.top + (tooltipStyle.top || 0);
          
          return (
            <div
              ref={tooltipRef}
              className="fixed z-50"
              style={{
                left: `${adjustedX}px`,
                top: `${tooltipY}px`,
                pointerEvents: 'auto',
              }}
              onMouseEnter={() => {
                setIsTooltipHovered(true);
                // Clear any pending hide timeout when hovering over tooltip
                if (hideTooltipTimeoutRef.current) {
                  clearTimeout(hideTooltipTimeoutRef.current);
                }
              }}
              onMouseLeave={() => {
                setIsTooltipHovered(false);
                hideTooltipTimeoutRef.current = setTimeout(() => {
                  if (!isTooltipHovered) {
                    setHoveredRefId(null);
                    setHoveredMessageId(null);
                  }
                }, 100);
              }}
            >
              <div className="bg-popover border border-border rounded-2xl shadow-xl p-5 w-96 max-h-64 overflow-y-auto text-sm animate-in fade-in zoom-in-95 duration-200 flex flex-col relative">
                <p className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground mb-3 font-bold shrink-0">
                  Reference {hoveredRefId} • {ref.sourceTitle}
                </p>
                <p className="text-popover-foreground whitespace-pre-wrap text-sm leading-relaxed">
                  {ref.content}
                </p>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Input Area */}
      <div className="absolute bottom-8 left-0 right-0 px-4 flex justify-center z-20">
        <div className="w-full max-w-3xl bg-card border-2 border-border shadow-lg rounded-2xl p-2 flex flex-col gap-2 relative">

           <textarea
             ref={textareaRef}
             placeholder="Ask a question about your sources..."
             className="w-full bg-transparent border-none p-3 resize-none outline-none text-foreground placeholder:text-muted-foreground/70 min-h-[60px] max-h-[200px] font-serif text-lg"
             rows={2}
             value={inputMessage}
             onChange={(e) => setInputMessage(e.target.value)}
             onKeyDown={handleKeyDown}
             disabled={isSending || isLoading}
           />

           <div className="flex justify-end items-center px-2 pb-1">
             <button
               onClick={handleSendMessage}
               disabled={!inputMessage.trim() || isSending || isLoading || !notebookId}
               className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all shadow-md active:translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
               title={inputMessage.trim() ? 'Send message (Enter)' : 'Type a message to send'}
             >
               {isSending || isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowUp className="w-5 h-5" />}
             </button>
           </div>
        </div>
      </div>
      </div>
      <ConfirmDialogComponent />
    </>);
};