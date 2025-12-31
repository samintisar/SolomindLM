import React, { useState, useRef, useEffect } from 'react';
import { Paperclip, ArrowUp, PanelLeftOpen, PanelRightOpen, MessageCircle, MoreVertical, Trash2 } from 'lucide-react';
import { Message } from '@/shared/types/index';

interface ChatPanelProps {
  messages: Message[];
  isLeftOpen: boolean;
  isRightOpen: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  onClearHistory?: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ 
  messages, 
  isLeftOpen, 
  isRightOpen,
  toggleLeft,
  toggleRight,
  onClearHistory
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredRefId, setHoveredRefId] = useState<number | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<'top' | 'bottom'>('top');
  const [tooltipStyle, setTooltipStyle] = useState<{ top?: number; left?: number }>({});
  const [isTooltipHovered, setIsTooltipHovered] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTooltipTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleDeleteHistory = () => {
    if (confirm('Are you sure you want to delete all chat history? This action cannot be undone.')) {
      onClearHistory?.();
      setIsMenuOpen(false);
    }
  };

  const handleRefHover = (refId: number, event: React.MouseEvent) => {
    handleRefEnter();
    setHoveredRefId(refId);
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
      }
    }, 200); // 200ms delay
  };

  const handleRefEnter = () => {
    // Cancel any pending hide when hovering back over badge
    if (hideTooltipTimeoutRef.current) {
      clearTimeout(hideTooltipTimeoutRef.current);
    }
  };

  const renderMessageWithReferences = (content: string, references?: any[]) => {
    if (!references || references.length === 0) {
      return <div className="whitespace-pre-wrap">{content}</div>;
    }

    const refMap = Object.fromEntries(references.map(ref => [ref.id, ref]));
    const parts = content.split(/(\[\d+\])/g);

    return (
      <div className="whitespace-pre-wrap relative">
        {parts.map((part, idx) => {
          const match = part.match(/\[(\d+)\]/);
          if (match) {
            const refId = parseInt(match[1]);
            return (
              <span key={idx} className="relative inline-group">
                <span
                  onMouseEnter={(e) => handleRefHover(refId, e)}
                  onMouseLeave={handleRefLeave}
                  className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold cursor-pointer hover:bg-primary/90 transition-colors mx-1"
                  title={`Reference ${refId}`}
                >
                  {refId}
                </span>
              </span>
            );
          }
          return <span key={idx}>{part}</span>;
        })}
      </div>
    );
  };
  return (
    <div className="flex-1 flex flex-col h-full bg-background relative overflow-hidden">
      
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-10 h-14">
        <div className="flex items-center gap-2 text-foreground">
          <MessageCircle className="w-4 h-4" />
          <span className="font-sans font-bold text-sm tracking-wide uppercase">Chat</span>
        </div>
        <div className="relative">
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-1 hover:bg-secondary rounded-sm transition-colors text-foreground/70 hover:text-foreground flex items-center justify-center shrink-0"
            title="Options"
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          {isMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-40 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
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

      {/* Dynamic Header for Toggles when panels are closed */}
      {(!isLeftOpen || !isRightOpen) && (
        <div className="absolute top-4 left-4 right-4 z-20 flex justify-between pointer-events-none">
          <div className="pointer-events-auto">
            {!isLeftOpen && (
              <button 
                onClick={toggleLeft}
                className="p-2 bg-card border border-border rounded-sm shadow-sm hover:bg-accent text-foreground transition-colors"
                title="Open Sources"
              >
                <PanelLeftOpen className="w-5 h-5" />
              </button>
            )}
          </div>
          <div className="pointer-events-auto">
            {!isRightOpen && (
              <button 
                onClick={toggleRight}
                className="p-2 bg-card border border-border rounded-sm shadow-sm hover:bg-accent text-foreground transition-colors"
                title="Open Studio"
              >
                <PanelRightOpen className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div 
        ref={messagesContainerRef}
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-12 md:px-20 lg:px-32 space-y-8 scroll-smooth overflow-x-hidden relative"
      >
        {messages.map((msg) => (
          <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div 
              className={`
                max-w-[85%] relative p-6 rounded-sm text-base leading-relaxed
                ${msg.role === 'user' 
                  ? 'bg-transparent text-foreground border-b-2 border-primary/20 font-handwriting italic' 
                  : 'bg-card border border-border shadow-sm text-card-foreground'}
              `}
            >
              
              {renderMessageWithReferences(msg.content, msg.references)}
            </div>
            <span className="text-[10px] text-muted-foreground mt-2 font-mono uppercase tracking-widest px-1">
              {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
        {/* Spacer for bottom input */}
        <div className="h-32" />

        {/* Floating Tooltip */}
        {hoveredRefId !== null && messagesContainerRef.current && (() => {
          const allReferences = messages
            .filter(msg => msg.references)
            .flatMap(msg => msg.references || []);
          const ref = allReferences.find(r => r.id === hoveredRefId);
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
              <div className="bg-popover border border-border rounded-lg shadow-xl p-5 w-96 max-h-64 overflow-y-auto text-sm animate-in fade-in zoom-in-95 duration-200 flex flex-col">
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
        <div className="w-full max-w-3xl bg-card border-2 border-border shadow-lg rounded-sm p-2 flex flex-col gap-2 relative">
           
           <textarea 
             placeholder="Ask a question about your sources..."
             className="w-full bg-transparent border-none p-3 resize-none outline-none text-foreground placeholder:text-muted-foreground/70 min-h-[60px] font-serif text-lg"
             rows={2}
           />
           
           <div className="flex justify-between items-center px-2 pb-1">
             <div className="flex gap-2">
                <button className="p-2 hover:bg-secondary rounded-sm text-muted-foreground transition-colors">
                  <Paperclip className="w-5 h-5" />
                </button>
             </div>
             
             <div className="flex items-center gap-3 text-xs text-muted-foreground font-sans">
                <span>2/50 Sources</span>
                <button className="p-2 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-all shadow-md active:translate-y-0.5">
                  <ArrowUp className="w-5 h-5" />
                </button>
             </div>
           </div>
        </div>
      </div>

      {/* Background Noise Texture */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0" 
           style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
      />
    </div>
  );
};