import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { XCircle, Loader2 } from 'lucide-react';
import { ReportNote } from '@/shared/types/index';

export interface ReportViewProps {
  note: ReportNote;
}

export const ReportView: React.FC<ReportViewProps> = ({ note }) => {
  const isFailed = note.status === 'failed';
  const isCompleted = note.status === 'completed';
  const isGenerating = note.status === 'generating' ||
                        note.metadata?.phase === 'mapping' ||
                        note.metadata?.phase === 'collapsing' ||
                        note.metadata?.phase === 'reducing';

  return (
      <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-right-4 duration-300">
           {/* Error State */}
           {isFailed && (
             <div className="p-4 border-b border-border bg-destructive/10">
               <div className="flex items-center gap-3">
                 <XCircle className="w-5 h-5 text-destructive shrink-0" />
                 <div className="flex-1">
                   <p className="text-sm font-medium text-destructive">Report generation failed</p>
                   <p className="text-xs text-destructive/70 mt-1">
                     {note.metadata?.error || 'An unknown error occurred'}
                   </p>
                 </div>
               </div>
             </div>
           )}

           <div className="flex-1 overflow-y-auto p-6 md:p-8">
               <div className="max-w-3xl mx-auto bg-card border border-border shadow-sm p-8 rounded-sm min-h-[500px]">
                   <div className="prose prose-stone dark:prose-invert max-w-none font-serif leading-relaxed select-text">
                      {note.content ? (
                          <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                  img: () => null,
                                  a: ({ node, children, ...props }) => <span className="text-foreground">{children}</span>,
                                  video: () => null,
                                  audio: () => null,
                                  iframe: () => null,
                                  // Render tables properly
                                  table: ({ children }) => <table className="w-full border-collapse border border-border rounded-lg overflow-hidden">{children}</table>,
                                  thead: ({ children }) => <thead className="bg-secondary/50">{children}</thead>,
                                  tbody: ({ children }) => <tbody>{children}</tbody>,
                                  tr: ({ children }) => <tr className="border-b border-border">{children}</tr>,
                                  th: ({ children }) => <th className="px-4 py-2 text-left font-semibold text-foreground border-r border-border last:border-r-0">{children}</th>,
                                  td: ({ children }) => <td className="px-4 py-2 text-foreground border-r border-border last:border-r-0">{children}</td>,
                              }}
                          >
                              {note.content}
                          </ReactMarkdown>
                      ) : isFailed ? (
                        <div className="flex flex-col items-center justify-center py-12">
                          <XCircle className="w-12 h-12 text-destructive mb-4" />
                          <p className="text-muted-foreground">Report generation failed</p>
                        </div>
                      ) : (
                          <div className="space-y-4">
                            <div className="h-8 bg-muted/50 rounded w-3/4 animate-pulse"></div>
                            <div className="h-4 bg-muted/50 rounded w-full animate-pulse" style={{ animationDelay: '0.1s' }}></div>
                            <div className="h-4 bg-muted/50 rounded w-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                            <div className="h-4 bg-muted/50 rounded w-5/6 animate-pulse" style={{ animationDelay: '0.3s' }}></div>
                          </div>
                      )}
                   </div>
               </div>
           </div>
      </div>
  );
};
