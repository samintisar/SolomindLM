import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ArrowUp, PanelLeftOpen, PanelRightOpen, MessageCircle, MoreVertical, Trash2, Loader2, Search, FileText, Brain } from 'lucide-react';
import { Virtuoso } from 'react-virtuoso';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Message, ReferenceChunk } from '@/shared/types/index';
import { chatApi } from '../services/chatApi';

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredRefId, setHoveredRefId] = useState<number | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<'top' | 'bottom'>('top');
  const [tooltipStyle, setTooltipStyle] = useState<{ top?: number; left?: number }>({});
  const [isTooltipHovered, setIsTooltipHovered] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const virtuosoRef = useRef<any>(null);

  const handleDeleteHistory = () => {
    if (confirm('Are you sure you want to delete all chat history? This action cannot be undone.')) {
      onClearHistory?.();
      setIsMenuOpen(false);
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
    }, 200); // 200ms delay
  };

  const handleRefEnter = () => {
    // Cancel any pending hide when hovering back over badge
    if (hideTooltipTimeoutRef.current) {
      clearTimeout(hideTooltipTimeoutRef.current);
    }
  };

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

    // Handle references that might be an object (from Supabase JSONB) instead of array
    const refsArray = Array.isArray(references) ? references : [];

    // Convert citation markers [1] to inline code markers `CITE:1` for ReactMarkdown to process
    const processedContent = cleanContent.replace(/\[(\d+)\]/g, '`CITE:$1`');

    return (
      <div className="font-serif text-base leading-relaxed space-y-2">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
          components={{
            img: () => null,
            a: ({ node, children, ...props }) => <span className="text-foreground">{children}</span>,
            video: () => null,
            audio: () => null,
            iframe: () => null,
            table: ({ children }) => <table className="w-full border-collapse border border-border rounded-lg overflow-hidden">{children}</table>,
            thead: ({ children }) => <thead className="bg-secondary/50">{children}</thead>,
            tbody: ({ children }) => <tbody>{children}</tbody>,
            tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
            th: ({ children }) => <th className="px-4 py-2 text-left font-semibold text-foreground border-r border-border last:border-r-0">{children}</th>,
            td: ({ children }) => <td className="px-4 py-2 text-foreground border-r border-border last:border-r-0">{children}</td>,
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
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold cursor-pointer hover:bg-primary/90 transition-colors mx-1 align-middle relative"
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
        </ReactMarkdown>
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
  }>(({ message, onRefHover, onRefLeave }) => {
    const isUser = message.role === 'user';

    return (
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1`} data-message-id={message.id}>
        {isUser ? (
          <>
            <div className="max-w-[75%] relative p-4 rounded-xl font-serif text-lg leading-relaxed bg-primary/10 text-foreground shadow-sm">
              {renderMessageWithReferences(message.id, message.content, message.references)}
            </div>
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest px-1">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </>
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
            </div>
            <span className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest px-1">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </>
        )}
      </div>
    );
  }, (prev, next) => {
    // Only re-render if content, status, or references change
    return (
      prev.message.id === next.message.id &&
      prev.message.content === next.message.content &&
      prev.message.status === next.message.status &&
      prev.message.references === next.message.references
    );
  });

  // Memoize the messages array to prevent unnecessary re-renders
  const memoizedMessages = useMemo(() => messages, [messages]);

  return (
    <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10 h-14">
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

          {/* Options Menu */}
          <div className="relative">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-1 hover:bg-secondary rounded-lg transition-colors text-foreground/70 hover:text-foreground flex items-center justify-center shrink-0"
              title="Options"
            >
              <MoreVertical className="w-5 h-5" />
            </button>
            {isMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-40 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                  <button
                    onClick={handleDeleteHistory}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    Delete history
                  </button>
                </div>
              </>
            )}
          </div>
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

          // Normalize references to array (handles Supabase JSONB objects)
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
                // Hide immediately when leaving tooltip
                setHoveredRefId(null);
              }}
            >
              <div className="bg-popover border border-border rounded-2xl shadow-xl p-5 w-96 max-h-64 overflow-y-auto text-sm animate-in fade-in zoom-in-95 duration-200 flex flex-col">
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
  );
};