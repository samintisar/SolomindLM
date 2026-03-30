import React from 'react';
import { Check, Copy, ThumbsUp, ThumbsDown, Search, RotateCcw } from 'lucide-react';
import { Message } from '@/shared/types/index';
import { renderMessageWithReferences, RefHandlers } from '../utils/messageRendering';
import { getStatusIcon, getStatusMessage } from '../utils/messageStatus';

interface MessageBubbleProps {
  message: Message;
  refHandlers: RefHandlers;
  onCopyMessage: (message: Message) => void;
  copiedMessageId: string | null;
  onSetFeedback?: (messageId: string, feedback: 'up' | 'down' | null) => void;
  onSendFollowUp?: (text: string) => void;
  onRetry?: (messageId: string) => void;
}

const ACTION_FLASH_MS = 220;

export const MessageBubble = React.memo<MessageBubbleProps>(
  ({ message, refHandlers, onCopyMessage, copiedMessageId, onSetFeedback, onSendFollowUp, onRetry }) => {
    const isUser = message.role === 'user';
    const isCopied = copiedMessageId === message.id;
    const [flashedActionId, setFlashedActionId] = React.useState<string | null>(null);
    const flashTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const messageActions: Array<{
      id: string;
      label: string;
      icon: React.ElementType;
      onClick: () => void;
      className?: string;
    }> = [
      {
        id: 'copy',
        label: isCopied ? 'Copied' : 'Copy',
        icon: isCopied ? Check : Copy,
        onClick: () => onCopyMessage(message),
        className: isCopied ? 'text-primary' : '',
      },
    ];

    if (!isUser && onRetry) {
      messageActions.splice(1, 0, {
        id: 'retry',
        label: 'Retry',
        icon: RotateCcw,
        onClick: () => onRetry(message.id),
      });
    }

    if (!isUser && onSetFeedback) {
      messageActions.push(
        {
          id: 'thumbs-up',
          label: 'Good response',
          icon: ThumbsUp,
          onClick: () => onSetFeedback(message.id, message.feedback === 'up' ? null : 'up'),
          className:
            message.feedback === 'up'
              ? 'text-vintage-green-700 dark:text-vintage-green-600 fill-vintage-green-600/30 dark:fill-vintage-green-500/25'
              : '',
        },
        {
          id: 'thumbs-down',
          label: 'Bad response',
          icon: ThumbsDown,
          onClick: () => onSetFeedback(message.id, message.feedback === 'down' ? null : 'down'),
          className:
            message.feedback === 'down'
              ? 'text-vintage-red-700 dark:text-vintage-red-600 fill-vintage-red-600/30 dark:fill-vintage-red-500/25'
              : '',
        }
      );
    }

    const actionBtnBase =
      'rounded-md p-1.5 min-w-8 min-h-8 inline-flex items-center justify-center touch-manipulation ' +
      'text-foreground/50 hover:text-foreground hover:bg-primary/10 dark:hover:bg-primary/14 ' +
      'transition-[transform,color,background-color] duration-200 ease-out motion-reduce:transition-none ' +
      'active:scale-[0.96] motion-reduce:active:scale-100 ' +
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background';

    const ActionBar = () => (
      <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label="Message actions">
        {messageActions.map(({ id, label, icon: Icon, onClick, className = '' }) => {
          const isFlash = flashedActionId === id;
          const showClusterBreak = id === 'thumbs-up';
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
                className={`${actionBtnBase} ${isFlash ? 'text-foreground bg-muted/70 dark:bg-muted/50' : ''} ${className}`}
              >
                <Icon
                  className={`w-[17px] h-[17px] transition-transform duration-200 ease-out motion-reduce:transition-none ${id === 'copy' && isCopied ? 'scale-110' : ''}`}
                  strokeWidth={1.75}
                  aria-hidden
                />
              </button>
            </React.Fragment>
          );
        })}
      </div>
    );

    const ThinkingIndicator = ({ status }: { status: string }) => {
      const label = getStatusMessage(status) ?? 'Thinking';
      const icon = getStatusIcon(status);
      const isSpinning = status === 'generating';
      return (
        <div className="flex items-center gap-3 py-2 mb-1">
          <div className="relative flex items-center justify-center w-7 h-7 shrink-0">
            <span className="absolute inset-0 rounded-full bg-muted/60 dark:bg-muted/40" />
            {!isSpinning && (
              <>
                <span className="absolute inset-0 rounded-full bg-primary/8 dark:bg-primary/10 animate-ping" style={{ animationDuration: '2s' }} />
                <span className="absolute inset-0 rounded-full bg-primary/5 dark:bg-primary/8 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.5s' }} />
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
              <span className="w-[3px] h-[3px] rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1.1s' }} />
              <span className="w-[3px] h-[3px] rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '180ms', animationDuration: '1.1s' }} />
              <span className="w-[3px] h-[3px] rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: '360ms', animationDuration: '1.1s' }} />
            </span>
          </div>
        </div>
      );
    };

    const ToolCallTrace = () => {
      if (!message.toolCalls || message.toolCalls.length === 0) return null;
      return (
        <div className="flex flex-col gap-1 mb-2">
          {message.toolCalls.map((tc, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              {tc.status === 'searching' ? (
                <Search className="w-3 h-3 animate-pulse shrink-0" />
              ) : (
                <Check className="w-3 h-3 text-vintage-green-600 dark:text-vintage-green-500 shrink-0" />
              )}
              <span>
                {tc.status === 'searching'
                  ? `Searching for "${tc.query}"...`
                  : `Found ${tc.resultCount ?? 0} passages`}
              </span>
            </div>
          ))}
        </div>
      );
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
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2 2V7.5C2 8.328 2.672 9 3.5 9H11M11 9L8 6M11 9L8 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
                <span className="text-sm text-foreground/75 group-hover:text-foreground transition-colors leading-snug">{q}</span>
              </button>
            ))}
          </div>
        </div>
      );
    };

    return (
      <div
        className={`group/message flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1`}
        data-message-id={message.id}
      >
        {isUser ? (
          <div className="flex flex-row items-start gap-2 max-w-[95%]">
            <div className="shrink-0 pt-4">
              <ActionBar />
            </div>
            <div className="p-4 rounded-xl font-serif text-lg leading-relaxed bg-primary/10 text-foreground shadow-sm">
              {renderMessageWithReferences(message.id, message.content, message.references, refHandlers)}
            </div>
          </div>
        ) : (
          <>
            {message.status && !message.content && (
              <ThinkingIndicator status={message.status} />
            )}
            {message.status && message.content && (
              <div className="flex items-center gap-1.5 text-muted-foreground/70 text-[11px] mb-2 font-sans tracking-wide">
                {getStatusIcon(message.status)}
                <span>{getStatusMessage(message.status)}</span>
                <span className="flex gap-0.5 ml-0.5">
                  <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }} />
                  <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }} />
                  <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }} />
                </span>
              </div>
            )}
            <ToolCallTrace />
            {message.content && (
              <div className="w-full max-w-4xl font-serif text-lg leading-relaxed text-foreground">
                {renderMessageWithReferences(message.id, message.content, message.references, refHandlers)}
                <div className="mt-3 pt-3 border-t border-dashed border-border/40">
                  <ActionBar />
                </div>
                <FollowUpChips />
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
    prev.message.references === next.message.references &&
    prev.message.feedback === next.message.feedback &&
    prev.message.followUps === next.message.followUps &&
    prev.message.toolCalls === next.message.toolCalls &&
    prev.copiedMessageId === next.copiedMessageId
);

MessageBubble.displayName = 'MessageBubble';
