
import React, { useState } from 'react';
import { X, Search, Globe, Plus, Loader2, ExternalLink } from 'lucide-react';
import { Source } from '@/shared/types/index';
import { documentsApi } from '../services/documentsApi';

interface DiscoverSourcesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSource: (source: Source) => void;
  isAtLimit: boolean;
  userId?: string | null;
  noteId?: string | null;
  onDocumentUploaded?: (documentId: string) => void;
}

interface WebResult {
  title: string;
  url: string;
  snippet: string;
  score: number;
  isAdded?: boolean;
  isAdding?: boolean;
}

export const DiscoverSourcesModal: React.FC<DiscoverSourcesModalProps> = ({
  isOpen,
  onClose,
  onAddSource,
  isAtLimit,
  userId,
  noteId,
  onDocumentUploaded,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WebResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      const response = await documentsApi.discoverSources({
        query: query.trim(),
        scoreThreshold: 0.5,
        maxResults: 10,
      });

      setResults(response.sources.map(source => ({ ...source, isAdded: false })));

      if (response.sources.length === 0) {
        setError('No sources found. Try a different search query.');
      }
    } catch (err) {
      console.error('Search error:', err);
      setError(err instanceof Error ? err.message : 'Search failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddResult = async (result: WebResult) => {
    if (isAtLimit || !userId || !noteId) {
      return;
    }

    // Set loading state for this specific result
    setResults(prev => prev.map(r =>
      r.url === result.url ? { ...r, isAdding: true } : r
    ));

    try {
      const response = await documentsApi.uploadUrl(userId, noteId, result.url, 'url');

      // Create a Source object for the frontend
      const newSource: Source = {
        id: response.documentId,
        title: result.title,
        type: 'WEB',
        date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        selected: true,
        status: 'pending',
      };

      onAddSource(newSource);
      
      // Trigger document upload callback to start polling for status updates
      onDocumentUploaded?.(response.documentId);

      // Mark as added
      setResults(prev => prev.map(r =>
        r.url === result.url ? { ...r, isAdded: true, isAdding: false } : r
      ));
    } catch (err) {
      console.error('Add source error:', err);
      alert(err instanceof Error ? err.message : 'Failed to add source');

      // Reset loading state
      setResults(prev => prev.map(r =>
        r.url === result.url ? { ...r, isAdding: false } : r
      ));
    }
  };

  const getHostname = (url: string): string => {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  };

  const getScoreLabel = (score: number): string => {
    if (score >= 0.8) return 'High';
    if (score >= 0.6) return 'Medium';
    return 'Low';
  };

  const getScoreColor = (score: number): string => {
    if (score >= 0.8) return 'text-success';
    if (score >= 0.6) return 'text-warning';
    return 'text-muted-foreground';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-4xl bg-card text-card-foreground rounded-xl shadow-2xl border border-border flex flex-col max-h-[90vh] overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg flex items-center justify-center">
                <Compass className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold">Discover Sources</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary/50 rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 flex flex-col overflow-hidden bg-card/50">
          {/* Search Bar */}
          <div className="p-6 border-b border-border/30">
            <form onSubmit={handleSearch} className="relative group">
               <div className="relative">
                 <input
                   autoFocus
                   type="text"
                   value={query}
                   onChange={(e) => setQuery(e.target.value)}
                   placeholder="Search for articles, papers, or websites..."
                   className="w-full pl-12 pr-28 py-4 bg-background border-2 border-border rounded-xl text-lg font-serif focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/50 shadow-sm leading-normal"
                 />
                 <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none">
                   <Search className="w-5 h-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                 </div>
                 <button
                   type="submit"
                   disabled={isLoading || !query.trim()}
                   className="absolute right-2 top-2 bottom-2 px-5 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                 >
                   {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                 </button>
               </div>
            </form>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
             {isLoading ? (
                <div className="flex flex-col items-center justify-center h-64 text-center space-y-4">
                   <div className="relative">
                      <Loader2 className="w-12 h-12 text-primary animate-spin" />
                   </div>
                   <div className="space-y-1">
                      <p className="font-bold text-lg font-sans">Scouring the web...</p>
                      <p className="text-sm text-muted-foreground font-serif">Finding the most relevant sources for you.</p>
                   </div>
                </div>
             ) : error ? (
                <div className="flex flex-col items-center justify-center h-64 text-center p-8 bg-destructive/5 rounded-xl border border-destructive/20">
                   <p className="text-destructive font-medium mb-1">Search encountered an issue</p>
                   <p className="text-muted-foreground text-sm">{error}</p>
                </div>
             ) : results.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                   {results.map((result, idx) => (
                      <div key={idx} className="group relative bg-card border border-border p-5 rounded-xl shadow-sm hover:shadow-md hover:border-primary/30 transition-all flex flex-col justify-between h-full">
                         <div className="space-y-3">
                            <div className="flex items-start justify-between gap-4">
                               <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary/80 font-sans">
                                  <Globe className="w-3 h-3" />
                                  <span>Website</span>
                               </div>
                               <div className="flex items-center gap-2">
                                  <span className={`text-[10px] font-bold uppercase ${getScoreColor(result.score)}`}>
                                    {getScoreLabel(result.score)} relevance
                                  </span>
                                  <a href={result.url} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-secondary rounded-md text-muted-foreground hover:text-primary transition-colors">
                                    <ExternalLink className="w-3.5 h-3.5" />
                                  </a>
                               </div>
                            </div>
                            <h3 className="font-bold font-serif text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">{result.title}</h3>
                            <p className="text-sm text-muted-foreground font-serif line-clamp-3 leading-relaxed">{result.snippet}</p>
                         </div>
                         <div className="mt-6 pt-4 border-t border-border/30 flex justify-between items-center">
                            <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[150px]">{getHostname(result.url)}</span>
                            <button
                              onClick={() => handleAddResult(result)}
                              disabled={result.isAdded || result.isAdding || isAtLimit}
                              className={`
                                px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5
                                ${result.isAdded || isAtLimit
                                  ? 'bg-secondary text-muted-foreground cursor-default'
                                  : result.isAdding
                                  ? 'bg-primary/50 text-primary-foreground cursor-wait'
                                  : 'bg-primary/10 text-primary hover:bg-primary hover:text-primary-foreground shadow-sm'
                                }
                              `}
                              title={isAtLimit ? 'Source limit reached' : undefined}
                            >
                               {result.isAdding ? (
                                 <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Adding...
                                 </>
                               ) : result.isAdded ? (
                                 'Added'
                               ) : isAtLimit ? (
                                 'Limit reached'
                               ) : (
                                 <><Plus className="w-3 h-3" /> Add to Notebook</>
                               )}
                            </button>
                         </div>
                      </div>
                   ))}
                </div>
             ) : (
                <div className="flex flex-col items-center justify-center h-64 text-center p-12 opacity-40">
                   <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 shrink-0">
                      <Search className="w-8 h-8" />
                   </div>
                   <p className="font-serif italic text-lg">Enter a topic to discover related web sources</p>
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Add a dummy Compass icon since it was missing in lucide-react list provided by user but available in package
const Compass = (props: any) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
);
