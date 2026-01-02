
import React, { useState, useRef, useEffect } from 'react';
import {
  Plus, MoreVertical, Globe, Lock, Folder, FolderOpen, Book, BarChart3, Monitor, Search, Brain,
  LayoutGrid, List, ChevronDown, CheckCircle2, ArrowUpAZ, Calendar, FileText,
  Pencil, Trash2, Settings2, X, GraduationCap, Lightbulb, Palette, FolderInput
} from 'lucide-react';
import { NotebookItem, FolderItem } from '@/shared/types/index';

interface HomePageProps {
  featuredNotebooks: NotebookItem[];
  recentNotebooks: NotebookItem[];
  onSelectNotebook: (notebook: NotebookItem) => void;
  onCreateNotebook: () => void;
  onUpdateNotebook: (id: string, updates: Partial<NotebookItem>) => void;
  onDeleteNotebook: (id: string) => void;
  isLoading?: boolean;
  error?: string | null;
  folders?: FolderItem[];
  onCreateFolder?: () => void;
  onUpdateFolder?: (id: string, updates: Partial<FolderItem>) => void;
  onDeleteFolder?: (id: string) => void;
  onMoveNotebookToFolder?: (notebookId: string, folderId: string | null) => void;
  loadFolders?: () => void;
}

const IconMap: Record<string, React.FC<any>> = {
  Folder, Book, BarChart: BarChart3, Monitor, Search, Brain, Globe, FileText, GraduationCap, Lightbulb
};

const COVER_COLORS = [
    'bg-slate-600', 'bg-red-500', 'bg-orange-600', 'bg-amber-500', 'bg-yellow-500', 
    'bg-lime-600', 'bg-green-600', 'bg-emerald-700', 'bg-teal-600', 'bg-cyan-600',
    'bg-sky-500', 'bg-blue-700', 'bg-indigo-600', 'bg-violet-600', 'bg-purple-400',
    'bg-fuchsia-600', 'bg-pink-600', 'bg-rose-500'
];

const AVAILABLE_ICONS = [
    'Folder', 'Book', 'BarChart', 'Monitor', 'Search', 'Brain', 'Globe', 'FileText', 'GraduationCap', 'Lightbulb'
];

export const HomePage: React.FC<HomePageProps> = ({
  featuredNotebooks,
  recentNotebooks,
  onSelectNotebook,
  onCreateNotebook,
  onUpdateNotebook,
  onDeleteNotebook,
  isLoading = false,
  error = null,
  folders = [],
  onCreateFolder,
  onUpdateFolder,
  onDeleteFolder,
  onMoveNotebookToFolder,
  loadFolders,
}) => {
  const [activeTab, setActiveTab] = useState('All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortOption, setSortOption] = useState<'date' | 'title'>('date');
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  
  // Menu & Edit State
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [customizingId, setCustomizingId] = useState<string | null>(null);

  // Folder State
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
  const [folderActiveMenuId, setFolderActiveMenuId] = useState<string | null>(null);
  const [folderEditingId, setFolderEditingId] = useState<string | null>(null);
  const [folderEditTitle, setFolderEditTitle] = useState('');
  const [folderCustomizingId, setFolderCustomizingId] = useState<string | null>(null);
  const [movingNotebookId, setMovingNotebookId] = useState<string | null>(null);
  const [folderNotebooks, setFolderNotebooks] = useState<Record<string, NotebookItem[]>>({});
  const [loadingFolderNotebooks, setLoadingFolderNotebooks] = useState<Set<string>>(new Set());

  const editInputRef = useRef<HTMLInputElement>(null);
  const folderEditInputRef = useRef<HTMLInputElement>(null);

  // Focus input on edit
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Focus folder input on edit
  useEffect(() => {
    if (folderEditingId && folderEditInputRef.current) {
      folderEditInputRef.current.focus();
      folderEditInputRef.current.select();
    }
  }, [folderEditingId]);

  // Clear folder notebooks cache when folders change to ensure fresh data
  useEffect(() => {
    setFolderNotebooks({});
  }, [folders]);

  // Click outside to close menus
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (activeMenuId && !(e.target as Element).closest('.kebab-menu')) {
        setActiveMenuId(null);
      }
      if (folderActiveMenuId && !(e.target as Element).closest('.folder-kebab-menu')) {
        setFolderActiveMenuId(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenuId, folderActiveMenuId]);

  // Sorting Logic
  const getSortedNotebooks = (items: NotebookItem[]) => {
    return [...items].sort((a, b) => {
      if (sortOption === 'date') {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      }
      return a.title.localeCompare(b.title);
    });
  };

  const sortedRecentNotebooks = getSortedNotebooks(recentNotebooks);

  // Handlers
  const startEditing = (nb: NotebookItem) => {
    setEditingId(nb.id);
    setEditTitle(nb.title);
    setActiveMenuId(null);
  };

  const saveTitle = (id: string) => {
    if (editTitle.trim()) {
        onUpdateNotebook(id, { title: editTitle.trim() });
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') saveTitle(id);
    if (e.key === 'Escape') setEditingId(null);
  };

  const openCustomize = (id: string) => {
    setCustomizingId(id);
    setActiveMenuId(null);
  };

  const closeCustomize = () => {
    setCustomizingId(null);
  };

  // Filter notebooks without folders for main display
  const notebooksWithoutFolder = recentNotebooks.filter(nb => !nb.folderId);
  const sortedNotebooksWithoutFolder = getSortedNotebooks(notebooksWithoutFolder);

  // Folder handlers
  const toggleFolderExpansion = async (folderId: string) => {
    if (expandedFolderId === folderId) {
      setExpandedFolderId(null);
    } else {
      setExpandedFolderId(folderId);
      // Always reload notebooks for this folder to ensure fresh data
      setLoadingFolderNotebooks(prev => new Set(prev).add(folderId));
      try {
        const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001'}/api/folders/${folderId}/notebooks`, {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${JSON.parse(localStorage.getItem('solomind_user') || '{}').accessToken}`,
          },
        });
        if (response.ok) {
          const notebooks = await response.json();
          setFolderNotebooks(prev => ({ ...prev, [folderId]: notebooks }));
        }
      } catch (error) {
        console.error('Failed to load folder notebooks:', error);
      } finally {
        setLoadingFolderNotebooks(prev => {
          const newSet = new Set(prev);
          newSet.delete(folderId);
          return newSet;
        });
      }
    }
  };

  const startFolderEditing = (folder: FolderItem) => {
    setFolderEditingId(folder.id);
    setFolderEditTitle(folder.name);
    setFolderActiveMenuId(null);
  };

  const saveFolderTitle = (id: string) => {
    if (folderEditTitle.trim() && onUpdateFolder) {
      onUpdateFolder(id, { name: folderEditTitle.trim() });
    }
    setFolderEditingId(null);
  };

  const handleFolderKeyDown = (e: React.KeyboardEvent, id: string) => {
    if (e.key === 'Enter') saveFolderTitle(id);
    if (e.key === 'Escape') setFolderEditingId(null);
  };

  const openFolderCustomize = (id: string) => {
    setFolderCustomizingId(id);
    setFolderActiveMenuId(null);
  };

  const closeFolderCustomize = () => {
    setFolderCustomizingId(null);
  };

  const openMoveToFolder = (notebookId: string) => {
    setMovingNotebookId(notebookId);
    setActiveMenuId(null);
  };

  const closeMoveToFolder = () => {
    setMovingNotebookId(null);
  };

  const handleMoveNotebook = (notebookId: string, folderId: string | null) => {
    if (onMoveNotebookToFolder) {
      onMoveNotebookToFolder(notebookId, folderId);
      // Refresh folders to update notebook counts
      if (loadFolders) loadFolders();
    }
    closeMoveToFolder();
  };

  // Helper for List Header
  const ListHeader = () => (
    <div className="grid grid-cols-[1fr_auto_auto_40px] gap-6 px-6 py-2 text-xs font-bold text-muted-foreground uppercase tracking-widest border-b border-border mb-2 font-sans">
      <span>Title</span>
      <span className="w-32">Last Modified</span>
      <span className="w-20 text-right">Sources</span>
      <span></span>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto bg-background p-6 md:p-12 font-serif animate-in fade-in duration-500">
      <div className="max-w-[1600px] mx-auto space-y-10">
        
        {/* Error Message */}
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading && recentNotebooks.length === 0 && featuredNotebooks.length === 0 && (
          <div className="flex items-center justify-center py-20">
            <div className="text-muted-foreground">Loading notebooks...</div>
          </div>
        )}
        
        {/* Top Navigation Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          
          {/* Left Tabs */}
          <div className="flex items-center gap-2 self-start md:self-auto">
             {['All', 'My notebooks', 'Featured notebooks'].map((tab) => (
               <button
                 key={tab}
                 onClick={() => setActiveTab(tab)}
                 className={`
                   px-5 py-2 rounded-full text-sm font-sans font-bold transition-all
                   ${activeTab === tab 
                     ? 'bg-foreground text-background shadow-md' 
                     : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'}
                 `}
               >
                 {tab}
               </button>
             ))}
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-3 self-end md:self-auto w-full md:w-auto justify-end">
             
             {/* View Toggles */}
             <div className="flex items-center bg-card border border-border rounded-lg p-1 shadow-sm">
                <button 
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded-md transition-all ${viewMode === 'grid' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary/50'}`}
                  title="Grid View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <div className="w-[1px] h-4 bg-border mx-1" />
                <button 
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded-md transition-all ${viewMode === 'list' ? 'bg-secondary text-foreground shadow-sm' : 'text-muted-foreground hover:bg-secondary/50'}`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
             </div>

             {/* Sort Dropdown */}
             <div className="relative" onClick={(e) => e.stopPropagation()}>
                <button 
                    onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
                    className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-full border border-border bg-card hover:bg-secondary/50 transition-colors text-sm font-medium shadow-sm min-w-[140px] justify-between"
                >
                    <span className="truncate">{sortOption === 'date' ? 'Most recent' : 'Title (A-Z)'}</span>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </button>
                
                {isSortMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-popover border border-border rounded-lg shadow-lg z-50 py-1 animate-in fade-in zoom-in-95 duration-200">
                        <button 
                            onClick={() => { setSortOption('date'); setIsSortMenuOpen(false); }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-accent flex items-center justify-between text-popover-foreground"
                        >
                            <span className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 opacity-70 shrink-0" /> Most recent</span>
                            {sortOption === 'date' && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                        </button>
                        <button 
                            onClick={() => { setSortOption('title'); setIsSortMenuOpen(false); }}
                            className="w-full text-left px-4 py-2 text-sm hover:bg-accent flex items-center justify-between text-popover-foreground"
                        >
                            <span className="flex items-center gap-2"><ArrowUpAZ className="w-3.5 h-3.5 opacity-70 shrink-0" /> Title (A-Z)</span>
                            {sortOption === 'title' && <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />}
                        </button>
                    </div>
                )}
             </div>

             {/* Create Button */}
             <button 
                onClick={onCreateNotebook} 
                className="flex items-center gap-2 px-5 py-2.5 bg-card border border-border hover:bg-secondary hover:border-primary/30 text-foreground rounded-full font-bold shadow-sm transition-all active:scale-95"
             >
                 <Plus className="w-4 h-4 shrink-0" />
                 <span className="whitespace-nowrap">Create new</span>
             </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="space-y-12">

          {/* Featured Section */}
          {(activeTab === 'All' || activeTab === 'Featured notebooks') && (
            <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-sans font-bold text-foreground">Featured notebooks</h2>
              </div>
              
              {viewMode === 'grid' ? (
                /* FEATURED GRID */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {featuredNotebooks.map((nb) => (
                    <div 
                      key={nb.id}
                      onClick={() => onSelectNotebook(nb)}
                      className="group relative aspect-[16/10] rounded-2xl overflow-hidden cursor-pointer shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ring-1 ring-border/50"
                    >
                      {/* Background Image/Color */}
                      <div className={`absolute inset-0 ${nb.coverColor} transition-opacity`}>
                        <div className="absolute inset-0 opacity-30 mix-blend-multiply" 
                              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }} 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      </div>
                      
                      <div className="absolute inset-0 p-6 flex flex-col justify-end text-white z-10">
                        <div className="flex items-center gap-2 mb-3 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                          <div className="w-6 h-6 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-[10px] font-bold uppercase ring-1 ring-white/30">
                              {nb.author?.charAt(0)}
                          </div>
                          <span className="text-xs font-medium text-white/90 truncate drop-shadow-sm">{nb.author}</span>
                        </div>
                        <h3 className="text-lg font-bold leading-tight mb-3 drop-shadow-md line-clamp-2 font-sans tracking-tight">{nb.title}</h3>
                        <div className="flex items-center gap-3 text-[11px] font-medium text-white/80 uppercase tracking-wide">
                          <span>{nb.date}</span>
                          <span className="w-0.5 h-0.5 bg-white/50 rounded-full" />
                          <div className="flex items-center gap-1.5">
                              <Globe className="w-3 h-3 shrink-0" />
                              <span>{nb.sourceCount} sources</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* FEATURED LIST */
                <div className="flex flex-col gap-3">
                  <ListHeader />
                  {featuredNotebooks.map((nb) => (
                    <div 
                      key={nb.id}
                      onClick={() => onSelectNotebook(nb)}
                      className="group grid grid-cols-[1fr_auto_auto_40px] items-center gap-6 p-4 rounded-xl bg-card border border-border shadow-sm hover:shadow-md hover:border-primary/20 cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                         <div className={`w-10 h-10 rounded-lg ${nb.coverColor} bg-opacity-20 flex items-center justify-center shrink-0`}>
                            <Book className={`w-5 h-5 ${(nb.coverColor || '').replace('bg-', 'text-')} shrink-0`} />
                         </div>
                         <div className="flex flex-col min-w-0">
                             <span className="font-bold text-foreground font-serif truncate">{nb.title}</span>
                             <span className="text-xs text-muted-foreground uppercase tracking-wide truncate">{nb.author}</span>
                         </div>
                      </div>
                      <div className="w-32 text-sm text-muted-foreground font-mono">{nb.date}</div>
                      <div className="w-20 flex justify-end">
                         <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground">
                            <Globe className="w-3 h-3 shrink-0" />
                            <span>{nb.sourceCount}</span>
                         </div>
                      </div>
                      <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                         <button className="p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors">
                            <MoreVertical className="w-4 h-4" />
                         </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Recent Notebooks Section */}
          {(activeTab === 'All' || activeTab === 'My notebooks') && (
            <section className="animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100 pb-20">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-sans font-bold text-foreground">My Notebooks</h2>
                {activeTab === 'All' && (
                  <button 
                    onClick={() => setActiveTab('My notebooks')}
                    className="text-sm font-bold text-primary hover:text-primary/80 transition-colors flex items-center gap-1"
                  >
                    See all
                  </button>
                )}
              </div>
              
              {viewMode === 'grid' ? (
                /* RECENT GRID */
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Create Buttons */}
                  {onCreateFolder && (
                    <div
                      onClick={onCreateFolder}
                      className="group aspect-[16/10] rounded-2xl border-2 border-dashed border-border hover:border-blue-500 hover:bg-blue-500/5 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300"
                    >
                      <div className="w-14 h-14 rounded-full bg-secondary text-blue-500 flex items-center justify-center group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white transition-all duration-300 shadow-sm">
                        <FolderInput className="w-7 h-7" />
                      </div>
                      <span className="text-base font-bold text-muted-foreground group-hover:text-blue-500 transition-colors font-sans">Create new folder</span>
                    </div>
                  )}
                  <div
                    onClick={onCreateNotebook}
                    className="group aspect-[16/10] rounded-2xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-300"
                  >
                    <div className="w-14 h-14 rounded-full bg-secondary text-primary flex items-center justify-center group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-300 shadow-sm">
                      <Plus className="w-7 h-7" />
                    </div>
                    <span className="text-base font-bold text-muted-foreground group-hover:text-primary transition-colors font-sans">Create new notebook</span>
                  </div>

                  {/* Folder Cards */}
                  {folders.map((folder) => {
                    const FolderIcon = folder.icon ? IconMap[folder.icon] : Folder;
                    const isMenuOpen = folderActiveMenuId === folder.id;
                    const isEditing = folderEditingId === folder.id;
                    const isExpanded = expandedFolderId === folder.id;
                    const folderNotebooksList = folderNotebooks[folder.id] || [];
                    const isLoading = loadingFolderNotebooks.has(folder.id);

                    return (
                      <div key={folder.id} className="relative">
                        {/* Folder Card */}
                        <div
                          className={`group relative aspect-[16/10] rounded-2xl bg-card border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col ring-1 ring-border/50 ${isExpanded ? 'ring-2 ring-primary/50' : ''}`}
                        >
                          {/* Top Decorative Half */}
                          <div
                            onClick={() => !isEditing && toggleFolderExpansion(folder.id)}
                            className={`h-[55%] ${folder.color || 'bg-blue-500'} bg-opacity-15 group-hover:bg-opacity-25 transition-colors p-5 relative flex items-start justify-between rounded-t-2xl`}
                          >
                            <FolderIcon className={`w-10 h-10 ${(folder.color || '').replace('bg-', 'text-')} opacity-90 group-hover:scale-110 transition-transform duration-300 drop-shadow-sm`} />

                            <div className="relative folder-kebab-menu z-20" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => setFolderActiveMenuId(isMenuOpen ? null : folder.id)}
                                className={`p-1.5 -mr-1.5 -mt-1.5 hover:bg-black/10 rounded-full text-muted-foreground/70 hover:text-foreground transition-colors ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>

                              {isMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border shadow-xl rounded-md z-30 py-1 animate-in fade-in zoom-in-95 duration-150">
                                  <button
                                    onClick={() => startFolderEditing(folder)}
                                    className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                  >
                                    <Pencil className="w-3.5 h-3.5" /> Rename
                                  </button>
                                  <button
                                    onClick={() => openFolderCustomize(folder.id)}
                                    className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                  >
                                    <Settings2 className="w-3.5 h-3.5" /> Customize
                                  </button>
                                  <button
                                    onClick={() => { onDeleteFolder?.(folder.id); setFolderActiveMenuId(null); }}
                                    className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-destructive/10 text-destructive flex items-center gap-2"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Bottom Info Half */}
                          <div
                            onClick={() => !isEditing && toggleFolderExpansion(folder.id)}
                            className="h-[45%] p-5 flex flex-col justify-between bg-card relative rounded-b-2xl"
                          >
                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-border to-transparent opacity-50" />

                            {isEditing ? (
                              <div onClick={(e) => e.stopPropagation()}>
                                <input
                                  ref={folderEditInputRef}
                                  value={folderEditTitle}
                                  onChange={(e) => setFolderEditTitle(e.target.value)}
                                  onBlur={() => saveFolderTitle(folder.id)}
                                  onKeyDown={(e) => handleFolderKeyDown(e, folder.id)}
                                  className="w-full text-base font-bold text-foreground bg-secondary/50 border-b border-primary outline-none px-1 py-0.5 rounded-sm font-sans"
                                />
                              </div>
                            ) : (
                              <h3 className="text-base font-bold text-foreground leading-snug line-clamp-2 font-sans">{folder.name}</h3>
                            )}

                            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                              <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-0.5 rounded-full">
                                <Folder className="w-3 h-3" />
                                <span>{folder.notebookCount}</span>
                              </div>
                              <ChevronDown className="w-4 h-4 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                            </div>
                          </div>
                        </div>

                        {/* Expanded Notebooks */}
                        {isExpanded && (
                          <div className="absolute top-full left-0 right-0 mt-2 z-10 space-y-2">
                            {isLoading ? (
                              <div className="text-center py-4 text-sm text-muted-foreground">Loading notebooks...</div>
                            ) : folderNotebooksList.length === 0 ? (
                              <div className="text-center py-4 text-sm text-muted-foreground bg-card rounded-lg border border-border">
                                No notebooks in this folder
                              </div>
                            ) : (
                              folderNotebooksList.map((nb) => {
                                const NbIcon = nb.icon ? IconMap[nb.icon] : Folder;
                                const nbIsMenuOpen = activeMenuId === nb.id;
                                const nbIsEditing = editingId === nb.id;

                                return (
                                  <div
                                    key={nb.id}
                                    className="bg-card border border-border rounded-lg p-3 shadow-md hover:shadow-lg transition-all"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className={`w-8 h-8 rounded-lg ${nb.coverColor} bg-opacity-20 flex items-center justify-center shrink-0`}>
                                          <NbIcon className={`w-4 h-4 ${(nb.coverColor || '').replace('bg-', 'text-')} shrink-0`} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          {nbIsEditing ? (
                                            <input
                                              ref={editInputRef}
                                              value={editTitle}
                                              onChange={(e) => setEditTitle(e.target.value)}
                                              onBlur={() => saveTitle(nb.id)}
                                              onKeyDown={(e) => handleKeyDown(e, nb.id)}
                                              className="w-full text-sm font-bold text-foreground bg-secondary/50 border-b border-primary outline-none px-1 py-0.5 rounded-sm font-sans"
                                            />
                                          ) : (
                                            <div
                                              onClick={() => !nbIsEditing && onSelectNotebook(nb)}
                                              className="font-bold text-foreground text-sm truncate cursor-pointer hover:text-primary transition-colors"
                                            >
                                              {nb.title}
                                            </div>
                                          )}
                                          <div className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                                            {nb.date} · {nb.sourceCount} sources
                                          </div>
                                        </div>
                                      </div>
                                      <div className="relative kebab-menu" onClick={(e) => e.stopPropagation()}>
                                        <button
                                          onClick={() => setActiveMenuId(nbIsMenuOpen ? null : nb.id)}
                                          className="p-1 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                          <MoreVertical className="w-4 h-4" />
                                        </button>

                                        {nbIsMenuOpen && (
                                          <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border shadow-xl rounded-md z-30 py-1 animate-in fade-in zoom-in-95 duration-150">
                                            <button
                                              onClick={() => startEditing(nb)}
                                              className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                            >
                                              <Pencil className="w-3.5 h-3.5" /> Rename
                                            </button>
                                            <button
                                              onClick={() => openCustomize(nb.id)}
                                              className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                            >
                                              <Settings2 className="w-3.5 h-3.5" /> Customize
                                            </button>
                                            <button
                                              onClick={() => openMoveToFolder(nb.id)}
                                              className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                            >
                                              <FolderOpen className="w-3.5 h-3.5" /> Move to folder
                                            </button>
                                            <button
                                              onClick={() => { onDeleteNotebook(nb.id); setActiveMenuId(null); }}
                                              className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-destructive/10 text-destructive flex items-center gap-2"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" /> Delete
                                            </button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Notebook Cards */}
                  {sortedNotebooksWithoutFolder.map((nb) => {
                    const Icon = nb.icon ? IconMap[nb.icon] : Folder;
                    const isMenuOpen = activeMenuId === nb.id;
                    const isEditing = editingId === nb.id;

                    return (
                      <div 
                        key={nb.id}
                        className="group relative aspect-[16/10] rounded-2xl bg-card border border-border shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col ring-1 ring-border/50"
                      >
                          {/* Top Decorative Half */}
                          <div onClick={() => !isEditing && onSelectNotebook(nb)} className={`h-[55%] ${nb.coverColor} bg-opacity-15 group-hover:bg-opacity-25 transition-colors p-5 relative flex items-start justify-between rounded-t-2xl`}>
                              <Icon className={`w-10 h-10 ${(nb.coverColor || '').replace('bg-', 'text-')} opacity-90 group-hover:scale-110 transition-transform duration-300 drop-shadow-sm`} />
                              
                              <div className="relative kebab-menu z-20" onClick={(e) => e.stopPropagation()}>
                                  <button 
                                      onClick={() => setActiveMenuId(isMenuOpen ? null : nb.id)}
                                      className={`p-1.5 -mr-1.5 -mt-1.5 hover:bg-black/10 rounded-full text-muted-foreground/70 hover:text-foreground transition-colors ${isMenuOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </button>
                                  
                                  {isMenuOpen && (
                                    <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border shadow-xl rounded-md z-30 py-1 animate-in fade-in zoom-in-95 duration-150">
                                        <button
                                            onClick={() => startEditing(nb)}
                                            className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                        >
                                            <Pencil className="w-3.5 h-3.5" /> Rename
                                        </button>
                                        <button
                                            onClick={() => openCustomize(nb.id)}
                                            className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                        >
                                            <Settings2 className="w-3.5 h-3.5" /> Customize
                                        </button>
                                        <button
                                            onClick={() => openMoveToFolder(nb.id)}
                                            className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                        >
                                            <FolderOpen className="w-3.5 h-3.5" /> Move to folder
                                        </button>
                                        <button
                                            onClick={() => { onDeleteNotebook(nb.id); setActiveMenuId(null); }}
                                            className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-destructive/10 text-destructive flex items-center gap-2"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" /> Delete
                                        </button>
                                    </div>
                                  )}
                              </div>
                          </div>

                          {/* Bottom Info Half */}
                          <div onClick={() => !isEditing && onSelectNotebook(nb)} className="h-[45%] p-5 flex flex-col justify-between bg-card relative rounded-b-2xl">
                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-border to-transparent opacity-50" />
                            
                            {isEditing ? (
                                <div onClick={(e) => e.stopPropagation()}>
                                    <input 
                                        ref={editInputRef}
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        onBlur={() => saveTitle(nb.id)}
                                        onKeyDown={(e) => handleKeyDown(e, nb.id)}
                                        className="w-full text-base font-bold text-foreground bg-secondary/50 border-b border-primary outline-none px-1 py-0.5 rounded-sm font-sans"
                                    />
                                </div>
                            ) : (
                                <h3 className="text-base font-bold text-foreground leading-snug line-clamp-2 font-sans">{nb.title}</h3>
                            )}
                            
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium uppercase tracking-wider">
                                <span className="font-mono">{nb.date}</span>
                                <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-0.5 rounded-full">
                                  <FileText className="w-3 h-3" />
                                  <span>{nb.sourceCount}</span>
                                </div>
                            </div>
                          </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* RECENT LIST */
                <div className="flex flex-col gap-3">
                  <ListHeader />

                  {/* Create New Folder Row */}
                  {onCreateFolder && (
                    <div
                      onClick={onCreateFolder}
                      className="grid grid-cols-[auto_1fr] items-center gap-4 p-4 rounded-xl border border-dashed border-border hover:bg-blue-500/10 hover:border-blue-500/50 cursor-pointer group transition-all"
                    >
                      <div className="w-10 h-10 rounded-full bg-secondary text-blue-500 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors">
                        <FolderInput className="w-5 h-5" />
                      </div>
                      <span className="font-bold text-muted-foreground group-hover:text-blue-500 transition-colors font-sans">Create new folder</span>
                    </div>
                  )}

                  {/* Create New Notebook Row */}
                   <div
                    onClick={onCreateNotebook}
                    className="grid grid-cols-[auto_1fr] items-center gap-4 p-4 rounded-xl border border-dashed border-border hover:bg-secondary/20 hover:border-primary/50 cursor-pointer group transition-all"
                  >
                    <div className="w-10 h-10 rounded-full bg-secondary text-primary flex items-center justify-center group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                       <Plus className="w-5 h-5" />
                    </div>
                    <span className="font-bold text-muted-foreground group-hover:text-foreground transition-colors font-sans">Create new notebook</span>
                  </div>

                  {/* Folder Rows */}
                  {folders.map((folder) => {
                    const FolderIcon = folder.icon ? IconMap[folder.icon] : Folder;
                    const isMenuOpen = folderActiveMenuId === folder.id;
                    const isEditing = folderEditingId === folder.id;
                    const isExpanded = expandedFolderId === folder.id;
                    const folderNotebooksList = folderNotebooks[folder.id] || [];
                    const isLoading = loadingFolderNotebooks.has(folder.id);

                    return (
                      <div key={folder.id} className="relative">
                        <div
                          className="group grid grid-cols-[1fr_auto_auto_40px] items-center gap-6 p-4 rounded-xl bg-card border border-border shadow-sm hover:shadow-md hover:border-primary/20 cursor-pointer transition-all relative"
                        >
                          <div onClick={() => !isEditing && toggleFolderExpansion(folder.id)} className="absolute inset-0 z-0" />

                          {/* Title Column */}
                          <div className="flex items-center gap-4 min-w-0 z-10 pointer-events-none">
                            <div className={`w-10 h-10 rounded-lg ${folder.color || 'bg-blue-500'} bg-opacity-20 flex items-center justify-center shrink-0`}>
                              <FolderIcon className={`w-5 h-5 ${(folder.color || '').replace('bg-', 'text-')}`} />
                            </div>

                            {isEditing ? (
                              <div className="pointer-events-auto flex-1">
                                <input
                                  ref={folderEditInputRef}
                                  value={folderEditTitle}
                                  onChange={(e) => setFolderEditTitle(e.target.value)}
                                  onBlur={() => saveFolderTitle(folder.id)}
                                  onKeyDown={(e) => handleFolderKeyDown(e, folder.id)}
                                  className="w-full font-bold text-foreground bg-secondary/50 border-b border-primary outline-none px-2 py-1 rounded-sm font-serif"
                                />
                              </div>
                            ) : (
                              <span className="font-bold text-foreground font-serif truncate">{folder.name}</span>
                            )}
                          </div>

                          {/* Notebook Count Column */}
                          <div className="w-32 text-sm text-muted-foreground font-mono z-10 pointer-events-none flex items-center gap-1.5">
                            <Folder className="w-3 h-3" />
                            <span>{folder.notebookCount}</span>
                          </div>

                          {/* Expand Indicator */}
                          <div className="w-20 flex justify-center z-10 pointer-events-none">
                            <ChevronDown className="w-4 h-4 transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }} />
                          </div>

                          {/* Action Column */}
                          <div className="flex justify-end z-20 pointer-events-auto folder-kebab-menu relative">
                            <button
                              onClick={(e) => { e.stopPropagation(); setFolderActiveMenuId(isMenuOpen ? null : folder.id); }}
                              className={`p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center shrink-0 ${isMenuOpen ? 'opacity-100 bg-secondary' : 'opacity-0 group-hover:opacity-100'}`}
                            >
                              <MoreVertical className="w-4 h-4 shrink-0" />
                            </button>

                            {isMenuOpen && (
                              <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border shadow-xl rounded-md z-50 py-1 animate-in fade-in zoom-in-95 duration-150">
                                <button
                                  onClick={(e) => { e.stopPropagation(); startFolderEditing(folder); }}
                                  className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                >
                                  <Pencil className="w-3.5 h-3.5 shrink-0" /> Rename
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); openFolderCustomize(folder.id); }}
                                  className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                >
                                  <Settings2 className="w-3.5 h-3.5 shrink-0" /> Customize
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); onDeleteFolder?.(folder.id); setFolderActiveMenuId(null); }}
                                  className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-destructive/10 text-destructive flex items-center gap-2"
                                >
                                  <Trash2 className="w-3.5 h-3.5 shrink-0" /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Expanded Notebooks */}
                        {isExpanded && (
                          <div className="ml-4 mt-2 space-y-2">
                            {isLoading ? (
                              <div className="text-center py-4 text-sm text-muted-foreground">Loading notebooks...</div>
                            ) : folderNotebooksList.length === 0 ? (
                              <div className="text-center py-4 text-sm text-muted-foreground bg-card rounded-lg border border-border">
                                No notebooks in this folder
                              </div>
                            ) : (
                              folderNotebooksList.map((nb) => {
                                const NbIcon = nb.icon ? IconMap[nb.icon] : Folder;
                                const nbIsMenuOpen = activeMenuId === nb.id;
                                const nbIsEditing = editingId === nb.id;

                                return (
                                  <div
                                    key={nb.id}
                                    className="group grid grid-cols-[1fr_auto_auto_40px] items-center gap-6 p-3 rounded-lg bg-card border border-border shadow-sm hover:shadow-md hover:border-primary/20 cursor-pointer transition-all relative"
                                  >
                                    <div onClick={() => !nbIsEditing && onSelectNotebook(nb)} className="absolute inset-0 z-0" />

                                    <div className="flex items-center gap-4 min-w-0 z-10 pointer-events-none">
                                      <div className={`w-8 h-8 rounded-lg ${nb.coverColor} bg-opacity-20 flex items-center justify-center shrink-0`}>
                                        <NbIcon className={`w-4 h-4 ${(nb.coverColor || '').replace('bg-', 'text-')}`} />
                                      </div>

                                      {nbIsEditing ? (
                                        <div className="pointer-events-auto flex-1">
                                          <input
                                            ref={editInputRef}
                                            value={editTitle}
                                            onChange={(e) => setEditTitle(e.target.value)}
                                            onBlur={() => saveTitle(nb.id)}
                                            onKeyDown={(e) => handleKeyDown(e, nb.id)}
                                            className="w-full font-bold text-foreground bg-secondary/50 border-b border-primary outline-none px-2 py-1 rounded-sm font-serif text-sm"
                                          />
                                        </div>
                                      ) : (
                                        <span className="font-bold text-foreground font-serif truncate text-sm">{nb.title}</span>
                                      )}
                                    </div>

                                    <div className="w-32 text-sm text-muted-foreground font-mono z-10 pointer-events-none text-sm">
                                      {nb.date}
                                    </div>

                                    <div className="w-20 flex justify-end z-10 pointer-events-none">
                                      <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground">
                                        <FileText className="w-3 h-3 shrink-0" />
                                        <span>{nb.sourceCount}</span>
                                      </div>
                                    </div>

                                    <div className="flex justify-end z-20 pointer-events-auto kebab-menu relative">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(nbIsMenuOpen ? null : nb.id); }}
                                        className={`p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center shrink-0 ${nbIsMenuOpen ? 'opacity-100 bg-secondary' : 'opacity-0 group-hover:opacity-100'}`}
                                      >
                                        <MoreVertical className="w-4 h-4 shrink-0" />
                                      </button>

                                      {nbIsMenuOpen && (
                                        <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border shadow-xl rounded-md z-50 py-1 animate-in fade-in zoom-in-95 duration-150">
                                          <button
                                            onClick={(e) => { e.stopPropagation(); startEditing(nb); }}
                                            className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                          >
                                            <Pencil className="w-3.5 h-3.5 shrink-0" /> Rename
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); openCustomize(nb.id); }}
                                            className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                          >
                                            <Settings2 className="w-3.5 h-3.5 shrink-0" /> Customize
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); openMoveToFolder(nb.id); }}
                                            className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                          >
                                            <FolderOpen className="w-3.5 h-3.5 shrink-0" /> Move to folder
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); onDeleteNotebook(nb.id); setActiveMenuId(null); }}
                                            className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-destructive/10 text-destructive flex items-center gap-2"
                                          >
                                            <Trash2 className="w-3.5 h-3.5 shrink-0" /> Delete
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Notebook Rows */}
                  {sortedNotebooksWithoutFolder.map((nb) => {
                    const Icon = nb.icon ? IconMap[nb.icon] : Folder;
                    const isMenuOpen = activeMenuId === nb.id;
                    const isEditing = editingId === nb.id;

                    return (
                      <div 
                        key={nb.id}
                        className="group grid grid-cols-[1fr_auto_auto_40px] items-center gap-6 p-4 rounded-xl bg-card border border-border shadow-sm hover:shadow-md hover:border-primary/20 cursor-pointer transition-all relative"
                      >
                         {/* Clickable Overlay */}
                         <div onClick={() => !isEditing && onSelectNotebook(nb)} className="absolute inset-0 z-0" />

                        {/* Title Column */}
                        <div className="flex items-center gap-4 min-w-0 z-10 pointer-events-none">
                           <div className={`w-10 h-10 rounded-lg ${nb.coverColor} bg-opacity-20 flex items-center justify-center shrink-0`}>
                              <Icon className={`w-5 h-5 ${(nb.coverColor || '').replace('bg-', 'text-')}`} />
                           </div>
                           
                           {isEditing ? (
                                <div className="pointer-events-auto flex-1">
                                    <input 
                                        ref={editInputRef}
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        onBlur={() => saveTitle(nb.id)}
                                        onKeyDown={(e) => handleKeyDown(e, nb.id)}
                                        className="w-full font-bold text-foreground bg-secondary/50 border-b border-primary outline-none px-2 py-1 rounded-sm font-serif"
                                    />
                                </div>
                           ) : (
                                <span className="font-bold text-foreground font-serif truncate">{nb.title}</span>
                           )}
                        </div>

                        {/* Date Column */}
                        <div className="w-32 text-sm text-muted-foreground font-mono z-10 pointer-events-none">
                           {nb.date}
                        </div>

                        {/* Sources Column */}
                        <div className="w-20 flex justify-end z-10 pointer-events-none">
                           <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground">
                              <FileText className="w-3 h-3 shrink-0" />
                              <span>{nb.sourceCount}</span>
                           </div>
                        </div>

                        {/* Action Column */}
                        <div className="flex justify-end z-20 pointer-events-auto kebab-menu relative">
                           <button 
                              onClick={(e) => { e.stopPropagation(); setActiveMenuId(isMenuOpen ? null : nb.id); }}
                              className={`p-2 hover:bg-secondary rounded-full text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center shrink-0 ${isMenuOpen ? 'opacity-100 bg-secondary' : 'opacity-0 group-hover:opacity-100'}`}
                           >
                              <MoreVertical className="w-4 h-4 shrink-0" />
                           </button>
                           
                           {isMenuOpen && (
                                <div className="absolute right-0 top-full mt-1 w-40 bg-popover border border-border shadow-xl rounded-md z-50 py-1 animate-in fade-in zoom-in-95 duration-150">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); startEditing(nb); }}
                                        className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                    >
                                        <Pencil className="w-3.5 h-3.5 shrink-0" /> Rename
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); openCustomize(nb.id); }}
                                        className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                    >
                                        <Settings2 className="w-3.5 h-3.5 shrink-0" /> Customize
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); openMoveToFolder(nb.id); }}
                                        className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-accent flex items-center gap-2 text-popover-foreground"
                                    >
                                        <FolderOpen className="w-3.5 h-3.5 shrink-0" /> Move to folder
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDeleteNotebook(nb.id); setActiveMenuId(null); }}
                                        className="w-full text-left px-3 py-2 text-xs font-medium hover:bg-destructive/10 text-destructive flex items-center gap-2"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 shrink-0" /> Delete
                                    </button>
                                </div>
                            )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </section>
          )}

        </div>
      </div>

      {/* CUSTOMIZE MODAL */}
      {customizingId && (
        <CustomizeModal
            notebook={recentNotebooks.find(n => n.id === customizingId)!}
            onClose={closeCustomize}
            onSave={(updates) => {
                onUpdateNotebook(customizingId, updates);
                closeCustomize();
            }}
        />
      )}

      {/* MOVE TO FOLDER MODAL */}
      {movingNotebookId && (
        <MoveToFolderModal
            notebookId={movingNotebookId}
            folders={folders}
            onClose={closeMoveToFolder}
            onMove={handleMoveNotebook}
        />
      )}

      {/* FOLDER CUSTOMIZE MODAL */}
      {folderCustomizingId && (
        <FolderCustomizeModal
            folder={folders.find(f => f.id === folderCustomizingId)!}
            onClose={closeFolderCustomize}
            onSave={(updates) => {
                onUpdateFolder?.(folderCustomizingId, updates);
                closeFolderCustomize();
            }}
        />
      )}
    </div>
  );
};

// Customize Modal Component
const CustomizeModal: React.FC<{
    notebook: NotebookItem;
    onClose: () => void;
    onSave: (updates: Partial<NotebookItem>) => void;
}> = ({ notebook, onClose, onSave }) => {
    const [selectedColor, setSelectedColor] = useState(notebook.coverColor || 'bg-yellow-500');
    const [selectedIcon, setSelectedIcon] = useState(notebook.icon || 'Folder');

    const CurrentIcon = IconMap[selectedIcon] || Folder;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h3 className="text-lg font-bold font-sans">Customize notebook</h3>
                    <button onClick={onClose} className="p-1 hover:bg-secondary rounded-full transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Preview */}
                <div className="p-6 flex justify-center bg-secondary/10">
                    <div className="w-48 aspect-[16/10] rounded-xl bg-card border border-border shadow-md flex flex-col ring-1 ring-border/50 overflow-hidden">
                        <div className={`h-[55%] ${selectedColor} bg-opacity-25 flex items-center justify-center`}>
                            <CurrentIcon className={`w-10 h-10 ${selectedColor.replace('bg-', 'text-')}`} />
                        </div>
                        <div className="h-[45%] p-3 bg-card">
                             <div className="h-2 w-2/3 bg-muted rounded-full mb-2" />
                             <div className="h-2 w-1/3 bg-muted/50 rounded-full" />
                        </div>
                    </div>
                </div>

                {/* Controls */}
                <div className="p-6 space-y-6">
                    {/* Color Picker */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Palette className="w-3.5 h-3.5" /> Color
                        </label>
                        <div className="grid grid-cols-9 gap-2">
                            {COVER_COLORS.map(color => (
                                <button
                                    key={color}
                                    onClick={() => setSelectedColor(color)}
                                    className={`w-6 h-6 rounded-full ${color} ring-2 ring-offset-2 ring-offset-card transition-all hover:scale-110 ${selectedColor === color ? 'ring-primary' : 'ring-transparent'}`}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Icon Picker */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Settings2 className="w-3.5 h-3.5 shrink-0" /> Icon
                        </label>
                        <div className="grid grid-cols-5 gap-3">
                            {AVAILABLE_ICONS.map(iconName => {
                                const Icon = IconMap[iconName] || Folder;
                                const isSelected = selectedIcon === iconName;
                                return (
                                    <button
                                        key={iconName}
                                        onClick={() => setSelectedIcon(iconName)}
                                        className={`flex items-center justify-center p-2 rounded-lg border transition-all ${isSelected ? 'bg-primary/10 border-primary text-primary' : 'bg-secondary/30 border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                                    >
                                        <Icon className="w-5 h-5" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border bg-secondary/10 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-full text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                        Cancel
                    </button>
                    <button 
                        onClick={() => onSave({ coverColor: selectedColor, icon: selectedIcon })}
                        className="px-6 py-2 rounded-full text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};

// Move to Folder Modal Component
const MoveToFolderModal: React.FC<{
    notebookId: string;
    folders: FolderItem[];
    onClose: () => void;
    onMove: (notebookId: string, folderId: string | null) => void;
}> = ({ notebookId, folders, onClose, onMove }) => {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-sm bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h3 className="text-lg font-bold font-sans">Move to folder</h3>
                    <button onClick={onClose} className="p-1 hover:bg-secondary rounded-full transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Folder List */}
                <div className="p-2 max-h-[60vh] overflow-y-auto">
                    <button
                        onClick={() => onMove(notebookId, null)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors text-left"
                    >
                        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                            <FolderOpen className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div>
                            <div className="font-bold text-foreground">No Folder</div>
                            <div className="text-xs text-muted-foreground">Remove from folder</div>
                        </div>
                    </button>

                    {folders.map(folder => {
                        const FolderIcon = folder.icon ? IconMap[folder.icon] : Folder;
                        return (
                            <button
                                key={folder.id}
                                onClick={() => onMove(notebookId, folder.id)}
                                className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors text-left"
                            >
                                <div className={`w-10 h-10 rounded-lg ${folder.color || 'bg-blue-500'} bg-opacity-20 flex items-center justify-center`}>
                                    <FolderIcon className={`w-5 h-5 ${(folder.color || '').replace('bg-', 'text-')}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-foreground truncate">{folder.name}</div>
                                    <div className="text-xs text-muted-foreground">{folder.notebookCount} notebooks</div>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border bg-secondary/10 flex justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-full text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

// Folder Customize Modal Component
const FolderCustomizeModal: React.FC<{
    folder: FolderItem;
    onClose: () => void;
    onSave: (updates: Partial<FolderItem>) => void;
}> = ({ folder, onClose, onSave }) => {
    const [selectedColor, setSelectedColor] = useState(folder.color || 'bg-blue-500');
    const [selectedIcon, setSelectedIcon] = useState(folder.icon || 'Folder');

    const CurrentIcon = IconMap[selectedIcon] || Folder;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h3 className="text-lg font-bold font-sans">Customize folder</h3>
                    <button onClick={onClose} className="p-1 hover:bg-secondary rounded-full transition-colors">
                        <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                </div>

                {/* Preview */}
                <div className="p-6 flex justify-center bg-secondary/10">
                    <div className="w-48 aspect-[16/10] rounded-xl bg-card border border-border shadow-md flex flex-col ring-1 ring-border/50 overflow-hidden">
                        <div className={`h-[55%] ${selectedColor} bg-opacity-25 flex items-center justify-center`}>
                            <CurrentIcon className={`w-10 h-10 ${selectedColor.replace('bg-', 'text-')}`} />
                        </div>
                        <div className="h-[45%] p-3 bg-card">
                             <div className="h-2 w-2/3 bg-muted rounded-full mb-2" />
                             <div className="h-2 w-1/3 bg-muted/50 rounded-full" />
                        </div>
                    </div>
                </div>

                {/* Controls */}
                <div className="p-6 space-y-6">
                    {/* Color Picker */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Palette className="w-3.5 h-3.5" /> Color
                        </label>
                        <div className="grid grid-cols-9 gap-2">
                            {COVER_COLORS.map(color => (
                                <button
                                    key={color}
                                    onClick={() => setSelectedColor(color)}
                                    className={`w-6 h-6 rounded-full ${color} ring-2 ring-offset-2 ring-offset-card transition-all hover:scale-110 ${selectedColor === color ? 'ring-primary' : 'ring-transparent'}`}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Icon Picker */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                            <Settings2 className="w-3.5 h-3.5 shrink-0" /> Icon
                        </label>
                        <div className="grid grid-cols-5 gap-3">
                            {AVAILABLE_ICONS.map(iconName => {
                                const Icon = IconMap[iconName] || Folder;
                                const isSelected = selectedIcon === iconName;
                                return (
                                    <button
                                        key={iconName}
                                        onClick={() => setSelectedIcon(iconName)}
                                        className={`flex items-center justify-center p-2 rounded-lg border transition-all ${isSelected ? 'bg-primary/10 border-primary text-primary' : 'bg-secondary/30 border-transparent text-muted-foreground hover:bg-secondary hover:text-foreground'}`}
                                    >
                                        <Icon className="w-5 h-5" />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-border bg-secondary/10 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-full text-sm font-bold text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={() => onSave({ color: selectedColor, icon: selectedIcon })}
                        className="px-6 py-2 rounded-full text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all"
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};