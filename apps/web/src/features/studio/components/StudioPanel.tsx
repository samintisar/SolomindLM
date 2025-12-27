
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  ChevronRight, 
  MoreVertical, 
  Sparkles, 
  AudioLines,
  Clapperboard,
  GitFork,
  FileText,
  Layers,
  HelpCircle,
  BarChart3,
  Presentation,
  Pencil,
  PenTool,
  Trash2,
  Play,
  ArrowLeft,
  ChevronLeft,
  RotateCw,
  CheckCircle2,
  XCircle,
  Lightbulb,
  ChevronUp
} from 'lucide-react';
import { StudioTool, Note } from '@/shared/types/index';
import { CreateReportModal } from './CreateReportModal';
import { CustomizeFlashcardsModal, FlashcardConfig } from './CustomizeFlashcardsModal';
import { CustomizeQuizModal, QuizConfig } from './CustomizeQuizModal';
import { CustomizeAudioModal, AudioConfig } from './CustomizeAudioModal';

interface StudioPanelProps {
  isOpen: boolean;
  onClose: () => void;
  tools: StudioTool[];
  notes: Note[];
  onUpdateNote: (id: string, newTitle: string) => void;
  onDeleteNote: (id: string) => void;
  onAddNote: (note: Note) => void;
  width: number;
  isResizing: boolean;
}

const IconMap: Record<string, React.FC<any>> = {
  AudioLines,
  Clapperboard,
  GitFork,
  FileText,
  Layers,
  HelpCircle,
  BarChart3,
  Presentation
};

// --- Sub-Components for Views ---

const ReportView: React.FC<{ note: Note }> = ({ note }) => {
    return (
        <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-right-4 duration-300">
             <div className="flex-1 overflow-y-auto p-6 md:p-8">
                 <div className="max-w-3xl mx-auto bg-card border border-border shadow-sm p-8 rounded-sm min-h-[500px]">
                     <div className="prose prose-stone dark:prose-invert max-w-none font-serif leading-relaxed">
                        {note.content ? (
                            <ReactMarkdown>{note.content}</ReactMarkdown>
                        ) : (
                            <div className="space-y-4 animate-pulse">
                                <div className="h-8 bg-muted rounded w-3/4"></div>
                                <div className="h-4 bg-muted rounded w-full"></div>
                                <div className="h-4 bg-muted rounded w-full"></div>
                                <div className="h-4 bg-muted rounded w-5/6"></div>
                                <p className="text-muted-foreground italic text-sm mt-8">NotebookLM is generating your report...</p>
                            </div>
                        )}
                     </div>
                 </div>
             </div>
        </div>
    );
};

const FlashcardView: React.FC<{ note: Note }> = ({ note }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const cards = note.flashcards || [];

    const handleNext = () => {
        setIsFlipped(false);
        setTimeout(() => setCurrentIndex((prev) => (prev + 1) % cards.length), 200);
    };

    const handlePrev = () => {
        setIsFlipped(false);
        setTimeout(() => setCurrentIndex((prev) => (prev - 1 + cards.length) % cards.length), 200);
    };

    if (cards.length === 0) return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center animate-spin">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <p className="text-muted-foreground font-serif italic">Generating flashcards from your sources...</p>
      </div>
    );

    const currentCard = cards[currentIndex];

    return (
        <div className="flex flex-col h-full items-center justify-center p-6 bg-secondary/10 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="w-full max-w-lg aspect-[3/2] perspective-1000 group cursor-pointer" onClick={() => setIsFlipped(!isFlipped)}>
                <div className={`relative w-full h-full transition-transform duration-500 transform-style-3d shadow-xl rounded-xl border border-border ${isFlipped ? 'rotate-y-180' : ''}`}>
                    
                    {/* Front */}
                    <div className="absolute inset-0 backface-hidden bg-card rounded-xl flex flex-col items-center justify-center p-8 text-center">
                         <span className="text-xs uppercase tracking-widest text-muted-foreground absolute top-6">Front</span>
                         <p className="text-xl md:text-2xl font-bold font-serif text-foreground">{currentCard.front}</p>
                         <div className="absolute bottom-6 text-xs text-muted-foreground/50 flex items-center gap-2">
                             <RotateCw className="w-3 h-3" /> Click to flip
                         </div>
                    </div>

                    {/* Back */}
                    <div className="absolute inset-0 backface-hidden rotate-y-180 bg-primary/5 rounded-xl flex flex-col items-center justify-center p-8 text-center border-2 border-primary/20">
                         <span className="text-xs uppercase tracking-widest text-primary/70 absolute top-6">Back</span>
                         <p className="text-xl md:text-2xl font-medium font-serif text-foreground">{currentCard.back}</p>
                    </div>

                </div>
            </div>

            <div className="flex items-center gap-6 mt-8">
                <button onClick={handlePrev} className="p-3 rounded-full hover:bg-card border border-transparent hover:border-border transition-all">
                    <ChevronLeft className="w-6 h-6" />
                </button>
                <span className="font-mono text-sm font-medium">
                    {currentIndex + 1} / {cards.length}
                </span>
                <button onClick={handleNext} className="p-3 rounded-full hover:bg-card border border-transparent hover:border-border transition-all">
                    <ChevronRight className="w-6 h-6" />
                </button>
            </div>
            
             <style>{`
                .perspective-1000 { perspective: 1000px; }
                .transform-style-3d { transform-style: preserve-3d; }
                .backface-hidden { backface-visibility: hidden; }
                .rotate-y-180 { transform: rotateY(180deg); }
            `}</style>
        </div>
    );
};

const QuizView: React.FC<{ note: Note }> = ({ note }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
    const [showResults, setShowResults] = useState(false);
    const [showHint, setShowHint] = useState(false);

    const questions = note.questions || [];
    const currentQuestion = questions[currentIndex];
    
    // Derived state
    const isAnswered = userAnswers[currentIndex] !== undefined;
    const selectedOption = userAnswers[currentIndex] ?? null;

    const handleSelect = (index: number) => {
        if (isAnswered) return;
        setUserAnswers(prev => ({...prev, [currentIndex]: index}));
    };

    const handleNext = () => {
        setShowHint(false);
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            setShowResults(true);
        }
    };

    const handlePrev = () => {
        setShowHint(false);
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        }
    };

    const resetQuiz = () => {
        setCurrentIndex(0);
        setUserAnswers({});
        setShowResults(false);
        setShowHint(false);
    };

    if (questions.length === 0) return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center animate-spin">
          <Sparkles className="w-6 h-6 text-primary" />
        </div>
        <p className="text-muted-foreground font-serif italic">Generating quiz from your sources...</p>
      </div>
    );

    if (showResults) {
        const score = Object.entries(userAnswers).reduce((acc, [qIdx, aIdx]) => {
            return acc + (questions[parseInt(qIdx)].answer === aIdx ? 1 : 0);
        }, 0);

        return (
            <div className="flex flex-col h-full items-center justify-center p-8 animate-in fade-in zoom-in-95 duration-300">
                <div className="text-center space-y-6 max-w-md w-full bg-card p-10 rounded-2xl border border-border shadow-lg">
                    <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto text-primary">
                        <Sparkles className="w-10 h-10" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold font-serif mb-2">Quiz Complete!</h3>
                        <p className="text-muted-foreground">You scored {score} out of {questions.length}</p>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                        <div 
                            className="bg-primary h-full transition-all duration-1000 ease-out" 
                            style={{ width: `${((score / questions.length) * 100)}%` }}
                        />
                    </div>
                    <button 
                        onClick={resetQuiz}
                        className="w-full py-3 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90 transition-colors"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background animate-in fade-in slide-in-from-right-4 duration-300 relative">
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto w-full p-8 md:p-12 min-h-full flex flex-col">
                    <div className="mb-8">
                        <div className="flex justify-between text-[10px] md:text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 font-sans">
                            <span>Question {currentIndex + 1}</span>
                            <span>{questions.length} Total</span>
                        </div>
                        <div className="w-full bg-secondary/50 rounded-full h-1.5 overflow-hidden">
                            <div 
                                className="bg-primary h-full rounded-full transition-all duration-500 ease-out" 
                                style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
                            />
                        </div>
                    </div>

                    <h3 className="text-xl md:text-3xl font-bold font-serif mb-10 leading-snug text-foreground">
                        {currentQuestion.question}
                    </h3>

                    <div className="space-y-4 flex-1 pb-10">
                        {currentQuestion.options.map((option, idx) => {
                            let stateStyles = "border-border hover:bg-secondary/50 hover:border-primary/50";
                            
                            if (isAnswered) {
                                if (idx === currentQuestion.answer) {
                                    stateStyles = "bg-green-500/10 border-green-500 text-green-700 dark:text-green-400";
                                } else if (idx === selectedOption) {
                                    stateStyles = "bg-red-500/10 border-red-500 text-red-700 dark:text-red-400";
                                } else {
                                    stateStyles = "opacity-50 border-border";
                                }
                            } else if (selectedOption === idx) {
                                stateStyles = "border-primary bg-primary/5";
                            }

                            return (
                                <button
                                    key={idx}
                                    onClick={() => handleSelect(idx)}
                                    disabled={isAnswered}
                                    className={`w-full text-left p-5 md:p-6 rounded-xl border-2 transition-all flex items-center justify-between group ${stateStyles}`}
                                >
                                    <span className="font-medium text-base md:text-lg">{option}</span>
                                    {isAnswered && idx === currentQuestion.answer && <CheckCircle2 className="w-5 h-5 text-green-600" />}
                                    {isAnswered && idx === selectedOption && idx !== currentQuestion.answer && <XCircle className="w-5 h-5 text-red-600" />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <div className="shrink-0 p-4 md:px-12 md:py-6 border-t border-border bg-background/80 backdrop-blur-md z-10">
                <div className="max-w-2xl mx-auto w-full flex items-center justify-between">
                    <div className="relative">
                        <button 
                            onClick={() => setShowHint(!showHint)}
                            className="flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/50 hover:bg-secondary text-sm font-medium transition-colors text-muted-foreground hover:text-foreground"
                        >
                           <Lightbulb className="w-4 h-4" />
                           <span>Hint</span>
                           <ChevronUp className={`w-3 h-3 transition-transform ${showHint ? 'rotate-180' : ''}`} />
                        </button>
                        {showHint && (
                             <div className="absolute bottom-full left-0 mb-3 w-72 p-4 bg-popover border border-border rounded-xl shadow-xl text-sm leading-relaxed animate-in fade-in slide-in-from-bottom-2 z-20">
                                 <span className="font-bold block mb-1 text-xs uppercase tracking-wide text-primary">Hint</span>
                                 {currentQuestion.hint || "Try to recall the definition from your notes."}
                             </div>
                        )}
                    </div>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={handlePrev}
                            disabled={currentIndex === 0}
                            className="px-4 py-2 text-sm font-bold text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:hover:text-muted-foreground transition-colors"
                        >
                            Previous
                        </button>
                        <button 
                            onClick={handleNext}
                            className="px-6 py-2 bg-primary text-primary-foreground text-sm font-bold rounded-full hover:bg-primary/90 transition-all shadow-md active:translate-y-0.5 min-w-[100px]"
                        >
                             {currentIndex === questions.length - 1 ? "Finish" : "Next"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- Main Studio Panel ---

export const StudioPanel: React.FC<StudioPanelProps> = ({ 
  isOpen, 
  onClose, 
  tools, 
  notes, 
  onUpdateNote,
  onDeleteNote,
  onAddNote,
  width, 
  isResizing 
}) => {
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  
  // Modal states
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [isFlashcardModalOpen, setIsFlashcardModalOpen] = useState(false);
  const [isQuizModalOpen, setIsQuizModalOpen] = useState(false);
  const [isAudioModalOpen, setIsAudioModalOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const activeNote = notes.find(n => n.id === activeNoteId);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (activeMenuId && !(event.target as Element).closest('.kebab-menu')) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeMenuId]);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editingId]);

  const handleStartEdit = (note: Note) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setActiveMenuId(null);
  };

  const handleSaveEdit = () => {
    if (editingId && editTitle.trim()) {
      onUpdateNote(editingId, editTitle.trim());
    }
    setEditingId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveEdit();
    if (e.key === 'Escape') setEditingId(null);
  };

  const handleNoteClick = (note: Note) => {
      if (note.type === 'quiz' || note.type === 'flashcard' || note.type === 'report') {
          setActiveNoteId(note.id);
      }
  };

  const handleToolClick = (toolId: string) => {
    if (toolId === 'reports') {
      setIsReportModalOpen(true);
    } else if (toolId === 'flashcards') {
      setIsFlashcardModalOpen(true);
    } else if (toolId === 'quiz') {
      setIsQuizModalOpen(true);
    } else if (toolId === 'audio') {
      setIsAudioModalOpen(true);
    }
  };

  const handleCreateFlashcards = (config: FlashcardConfig) => {
    setIsFlashcardModalOpen(false);
    const newNote: Note = {
      id: Math.random().toString(36).substr(2, 9),
      title: config.topic ? `Flashcards: ${config.topic}` : 'Study Flashcards',
      preview: `${config.count === 'standard' ? '10' : config.count === 'fewer' ? '5' : '20'} Cards • ${config.difficulty}`,
      type: 'flashcard',
      flashcards: [] // Initial empty state triggers generating view
    };
    onAddNote(newNote);
    setActiveNoteId(newNote.id);
    setTimeout(() => {
        onUpdateNote(newNote.id, newNote.title); // Trigger content fill
    }, 2500);
  };

  const handleCreateQuiz = (config: QuizConfig) => {
    setIsQuizModalOpen(false);
    const newNote: Note = {
      id: Math.random().toString(36).substr(2, 9),
      title: config.focus ? `Quiz: ${config.focus}` : 'Concept Quiz',
      preview: `${config.count === 'standard' ? '5' : config.count === 'fewer' ? '3' : '10'} Questions • ${config.difficulty}`,
      type: 'quiz',
      questions: [] // Initial empty state triggers generating view
    };
    onAddNote(newNote);
    setActiveNoteId(newNote.id);
    setTimeout(() => {
        onUpdateNote(newNote.id, newNote.title);
    }, 2500);
  };

  const handleCreateReport = (formatId: string, _customPrompt?: string) => {
    setIsReportModalOpen(false);
    const titles: Record<string, string> = {
      'briefing': 'Briefing Document',
      'study_guide': 'Study Guide',
      'blog_post': 'Blog Post',
      'custom': 'Custom Report'
    };
    const newNote: Note = {
      id: Math.random().toString(36).substr(2, 9),
      title: titles[formatId] || 'New Report',
      preview: 'Report • Generating...',
      type: 'report',
      content: ''
    };
    onAddNote(newNote);
    setActiveNoteId(newNote.id);
    setTimeout(() => {
      onUpdateNote(newNote.id, newNote.title);
    }, 2000);
  };

  const handleCreateAudio = (config: AudioConfig) => {
    setIsAudioModalOpen(false);
    const newNote: Note = {
      id: Math.random().toString(36).substr(2, 9),
      title: `Audio: ${config.formatId.replace('_', ' ')}`,
      preview: `Audio Overview • ${config.length}`,
      type: 'audio'
    };
    onAddNote(newNote);
  };

  return (
    <div
      style={{ width: isOpen ? width : 0 }}
      className={`
        relative shrink-0 bg-sidebar border-l-2 border-border h-full flex flex-col
        overflow-hidden
        ${!isResizing ? 'panel-transition' : ''}
        ${isOpen ? 'opacity-100' : 'opacity-0'}
      `}
    >
      <div className="flex items-center justify-between p-4 border-b border-border bg-sidebar/50 backdrop-blur-sm sticky top-0 z-10 h-14">
        {activeNote ? (
            <div className="flex items-center gap-2 text-sidebar-foreground w-full">
                <button 
                  onClick={() => setActiveNoteId(null)}
                  className="p-1 -ml-1 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground flex items-center justify-center shrink-0"
                >
                  <ArrowLeft className="w-5 h-5 shrink-0" />
                </button>
                <div className="flex flex-col overflow-hidden">
                    <span className="font-sans font-bold text-sm tracking-wide truncate">{activeNote.title}</span>
                </div>
            </div>
        ) : (
            <>
                <button 
                  onClick={onClose}
                  className="p-1 hover:bg-sidebar-accent rounded-sm transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground flex items-center justify-center shrink-0"
                >
                  <ChevronRight className="w-5 h-5 shrink-0" />
                </button>
                <div className="flex items-center gap-2 text-sidebar-foreground">
                  <PenTool className="w-4 h-4 shrink-0" />
                  <span className="font-sans font-bold text-sm tracking-wide uppercase">Studio</span>
                </div>
            </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto w-full relative">
        {activeNote ? (
            <div className="h-full">
                {activeNote.type === 'report' && <ReportView note={activeNote} />}
                {activeNote.type === 'flashcard' && <FlashcardView note={activeNote} />}
                {activeNote.type === 'quiz' && <QuizView note={activeNote} />}
            </div>
        ) : (
            <div className="p-4 space-y-8">
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest px-1 font-sans">Create</h3>
                  <div className={`grid gap-3 ${width > 450 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {tools.map((tool) => {
                      const Icon = IconMap[tool.iconName] || FileText;
                      return (
                        <div 
                          key={tool.id} 
                          onClick={() => handleToolClick(tool.id)}
                          className="group flex flex-col justify-between p-3 h-24 bg-card border border-border rounded-lg hover:shadow-md hover:border-primary/50 transition-all cursor-pointer relative overflow-hidden"
                        >
                           <div className="absolute top-0 right-0 w-3 h-3 border-t border-r border-primary/10 group-hover:border-primary/30 transition-colors" />
                           <div className="flex justify-between items-start w-full">
                             <Icon className={`w-5 h-5 ${tool.color} opacity-90 group-hover:scale-110 transition-transform`} />
                           </div>
                           <span className="text-sm font-medium text-foreground leading-tight font-sans tracking-tight">{tool.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                     <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest font-sans">Saved</h3>
                  </div>
                  <div className="space-y-3">
                    {notes.map((note) => (
                      <div 
                        key={note.id} 
                        onClick={() => handleNoteClick(note)}
                        className="relative bg-card border-l-4 border-l-primary border-y border-r border-border p-3 pl-4 shadow-sm hover:shadow-md transition-shadow group rounded-r-sm cursor-pointer"
                      >
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1 flex gap-3 min-w-0">
                            {note.type === 'audio' && (
                                <button className="shrink-0 w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-all group/play">
                                    <Play className="w-3.5 h-3.5 fill-current ml-0.5 shrink-0" />
                                </button>
                            )}
                            {note.type === 'flashcard' && (
                                <div className="shrink-0 w-8 h-8 rounded-lg bg-orange-500/10 text-orange-600 flex items-center justify-center">
                                    <Layers className="w-4 h-4 shrink-0" />
                                </div>
                            )}
                            {note.type === 'report' && (
                                <div className="shrink-0 w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                                    <FileText className="w-4 h-4 shrink-0" />
                                </div>
                            )}
                             {note.type === 'quiz' && (
                                <div className="shrink-0 w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 flex items-center justify-center">
                                    <HelpCircle className="w-4 h-4 shrink-0" />
                                </div>
                            )}
                            <div className="flex-1 min-w-0">
                                {editingId === note.id ? (
                                    <input
                                        ref={inputRef}
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        onBlur={handleSaveEdit}
                                        onKeyDown={handleKeyDown}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full bg-transparent border-b border-primary text-sm font-bold text-foreground font-serif focus:outline-none mb-1 p-0 rounded-none"
                                    />
                                ) : (
                                    <h4 className="text-sm font-bold text-foreground font-serif truncate leading-tight mb-1 group-hover:text-primary transition-colors">{note.title}</h4>
                                )}
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span className="font-mono tracking-tight truncate">{note.preview}</span>
                                </div>
                            </div>
                          </div>
                          <div className="relative kebab-menu shrink-0">
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(activeMenuId === note.id ? null : note.id);
                                }}
                                className="text-muted-foreground hover:text-foreground p-1 rounded-sm hover:bg-secondary transition-colors flex items-center justify-center shrink-0"
                            >
                              <MoreVertical className="w-3.5 h-3.5 shrink-0" />
                            </button>
                            {activeMenuId === note.id && (
                                <div className="absolute right-0 top-6 w-36 bg-popover border border-border shadow-lg rounded-md z-50 py-1 animate-in fade-in zoom-in-95 duration-100">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleStartEdit(note); }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-accent text-popover-foreground flex items-center gap-2"
                                    >
                                        <Pencil className="w-3.5 h-3.5 shrink-0" /> Rename
                                    </button>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); onDeleteNote(note.id); setActiveMenuId(null); }}
                                        className="w-full text-left px-3 py-2 text-xs hover:bg-destructive/10 text-destructive flex items-center gap-2"
                                    >
                                        <Trash2 className="w-3.5 h-3.5 shrink-0" /> Delete
                                    </button>
                                </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
            </div>
        )}
      </div>
      
      {!activeNote && (
          <div className="p-4 border-t border-border bg-sidebar/30 mt-auto">
            <button className="w-full py-2 bg-sidebar-accent border border-sidebar-border text-sidebar-foreground text-xs font-bold uppercase tracking-wide rounded-sm hover:bg-sidebar-accent/80 transition-colors shadow-sm">
              + Add New Note
            </button>
          </div>
      )}

      {/* Modals */}
      <CreateReportModal 
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onSelectFormat={handleCreateReport}
      />
      
      <CustomizeFlashcardsModal
        isOpen={isFlashcardModalOpen}
        onClose={() => setIsFlashcardModalOpen(false)}
        onGenerate={handleCreateFlashcards}
      />

      <CustomizeQuizModal
        isOpen={isQuizModalOpen}
        onClose={() => setIsQuizModalOpen(false)}
        onGenerate={handleCreateQuiz}
      />

      <CustomizeAudioModal
        isOpen={isAudioModalOpen}
        onClose={() => setIsAudioModalOpen(false)}
        onGenerate={handleCreateAudio}
      />
    </div>
  );
};
