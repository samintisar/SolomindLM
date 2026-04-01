import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  MessageSquare,
  ArrowLeft,
  Download,
  Grid3x3,
  Timer,
} from 'lucide-react';
import { SlideDeckNote } from '@/shared/types/index';

export interface SlidesViewProps {
  note: SlideDeckNote;
  onNoteUpdate?: (note: SlideDeckNote) => void;
  onBack?: () => void;
}

type TransitionType = 'fade' | 'slide' | 'scale' | 'none';

export const SlidesView: React.FC<SlidesViewProps> = ({ note, onNoteUpdate: _onNoteUpdate, onBack }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTalkingPoints, setShowTalkingPoints] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showThumbnailGrid, setShowThumbnailGrid] = useState(false);
  const [transition, setTransition] = useState<TransitionType>('fade');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showSpeakerView, setShowSpeakerView] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const slides = note.slides || [];
  const currentSlide = slides[currentIndex];

  // Timer effect
  useEffect(() => {
    if (showSpeakerView || isFullscreen) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedTime(0);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [showSpeakerView, isFullscreen]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle fullscreen
  const toggleFullscreen = useCallback(async () => {
    console.log('Toggle fullscreen clicked', {
      hasContainer: !!containerRef.current,
      isCurrentlyFullscreen: !!document.fullscreenElement,
    });

    if (!containerRef.current) {
      console.error('Container ref not available');
      return;
    }

    try {
      if (!document.fullscreenElement) {
        console.log('Entering fullscreen...');
        await containerRef.current.requestFullscreen();
        console.log('Fullscreen request successful');
      } else {
        console.log('Exiting fullscreen...');
        await document.exitFullscreen();
        console.log('Exit fullscreen successful');
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
      alert(`Fullscreen error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const handleNext = useCallback(() => {
    if (currentIndex < slides.length - 1) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
        setImageError(false);
        setTimeout(() => setIsTransitioning(false), 50);
      }, 150);
    }
  }, [currentIndex, slides.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentIndex(prev => prev - 1);
        setImageError(false);
        setTimeout(() => setIsTransitioning(false), 50);
      }, 150);
    }
  }, [currentIndex]);

  const jumpToSlide = useCallback((index: number) => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentIndex(index);
      setImageError(false);
      setShowThumbnailGrid(false);
      setTimeout(() => setIsTransitioning(false), 50);
    }, 150);
  }, []);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't handle if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setShowThumbnailGrid(prev => !prev);
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setShowSpeakerView(prev => !prev);
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        setTransition(prev => {
          const transitions: TransitionType[] = ['fade', 'slide', 'scale', 'none'];
          const currentIndex = transitions.indexOf(prev);
          return transitions[(currentIndex + 1) % transitions.length];
        });
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleNext, handlePrev, toggleFullscreen]);

  // Get transition classes
  const getTransitionClasses = () => {
    if (!isTransitioning) return '';
    switch (transition) {
      case 'fade':
        return 'opacity-0';
      case 'slide':
        return currentIndex > slides.indexOf(currentSlide) ? '-translate-x-full' : 'translate-x-full';
      case 'scale':
        return 'scale-95 opacity-0';
      case 'none':
        return '';
      default:
        return '';
    }
  };

  // Empty state
  if (slides.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4">
        <p className="text-muted-foreground font-serif italic">No slides available</p>
      </div>
    );
  }

  const isPresenterSlides = note.metadata?.slideType === 'presenter_slides';

  return (
    <div
      ref={containerRef}
      className={`flex flex-col h-full bg-background ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
    >
      {/* Thumbnail Grid Overlay */}
      {showThumbnailGrid && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm">
          {/* Fixed Header */}
          <div className="flex-shrink-0 p-4 md:p-6 border-b border-white/10">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Slide Overview</h2>
              <button
                onClick={() => setShowThumbnailGrid(false)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors"
              >
                Close (G)
              </button>
            </div>
          </div>

          {/* Scrollable Grid */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {slides.map((slide, idx) => (
                  <button
                    key={idx}
                    onClick={() => jumpToSlide(idx)}
                    className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all hover:scale-105 bg-black ${
                      idx === currentIndex
                        ? 'border-primary shadow-lg shadow-primary/50'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    {(slide.slide_url || slide.imageUrl) ? (
                      <img
                        src={slide.slide_url || slide.imageUrl}
                        alt={slide.title}
                        className="w-full h-full object-contain p-2"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-slate-400 text-sm">Slide {idx + 1}</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <p className="text-white text-xs font-medium truncate">{slide.title}</p>
                    </div>
                    {idx === currentIndex && (
                      <div className="absolute top-2 right-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Speaker View */}
      {showSpeakerView && !isFullscreen && (
        <div className="flex-1 flex gap-4 p-4">
          {/* Main Slide */}
          <div className="flex-1 flex flex-col">
            <div className="flex-1 bg-black rounded-lg overflow-hidden shadow-2xl relative">
              {(currentSlide?.slide_url || currentSlide?.imageUrl) && !imageError ? (
                <img
                  src={currentSlide.slide_url || currentSlide.imageUrl}
                  alt={`Slide ${currentSlide.slide_number}: ${currentSlide.title}`}
                  className="w-full h-full object-contain transition-all duration-300"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center p-8">
                    {imageError ? (
                      <>
                        <p className="text-lg font-semibold text-foreground mb-2">Slide Unavailable</p>
                        <p className="text-sm text-muted-foreground">The image could not be loaded</p>
                      </>
                    ) : (
                      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Speaker Notes Panel */}
          <div className="w-96 bg-card rounded-lg border border-border p-4 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-foreground">Speaker Notes</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Timer className="w-4 h-4" />
                <span className="font-mono">{formatTime(elapsedTime)}</span>
              </div>
            </div>

            {currentSlide?.title && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-muted-foreground mb-1">Current Slide</h4>
                <p className="font-serif text-lg">{currentSlide.title}</p>
              </div>
            )}

            {currentSlide?.talking_points && currentSlide.talking_points.length > 0 && (
              <div className="flex-1 overflow-y-auto">
                <h4 className="text-sm font-semibold text-muted-foreground mb-2">Talking Points</h4>
                <ul className="space-y-3">
                  {currentSlide.talking_points.map((point, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                      <span className="text-sm leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Up Next</h4>
              {currentIndex < slides.length - 1 ? (
                <p className="text-sm text-foreground">{slides[currentIndex + 1].title}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">End of presentation</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main View (not speaker view) */}
      {!showSpeakerView && (
        <>
          {/* Mobile Back Button */}
          {onBack && !isFullscreen && (
            <div className="md:hidden flex items-center gap-2 p-4 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-20">
              <button
                onClick={onBack}
                className="p-1.5 hover:bg-secondary rounded-md transition-colors text-foreground flex items-center justify-center shrink-0"
                aria-label="Back to Studio"
              >
                <ArrowLeft className="w-5 h-5 shrink-0" />
              </button>
              <span className="text-sm font-semibold text-foreground truncate">{note.title}</span>
            </div>
          )}

          {/* Main Slide Display Area */}
          <div className={`flex-1 flex flex-col items-center justify-center ${
            isFullscreen ? 'p-2' : 'p-4 md:p-8 bg-card border-t border-border'
          }`}>
            {/* Transition indicator */}
            {transition !== 'none' && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/50 backdrop-blur-sm rounded-full text-white text-xs font-medium z-10">
                {transition} transition
              </div>
            )}

            <div className={`w-full relative bg-black overflow-hidden shadow-2xl transition-all duration-300 ${
              isFullscreen
                ? 'h-full max-h-full'
                : 'max-w-5xl aspect-video rounded-lg'
            }`}>
              {/* Slide Image */}
              {(currentSlide?.slide_url || currentSlide?.imageUrl) && !imageError ? (
                <img
                  src={currentSlide.slide_url || currentSlide.imageUrl}
                  alt={`Slide ${currentSlide.slide_number}: ${currentSlide.title}`}
                  className={`w-full h-full object-contain transition-all duration-300 ${getTransitionClasses()}`}
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center p-8">
                    {imageError ? (
                      <>
                        <p className="text-lg font-semibold text-foreground mb-2">Slide Unavailable</p>
                        <p className="text-sm text-muted-foreground">The image could not be loaded</p>
                      </>
                    ) : (
                      <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    )}
                  </div>
                </div>
              )}

              {/* Slide Number Overlay */}
              <div className="absolute bottom-4 right-4 px-3 py-1 bg-black/50 backdrop-blur-sm rounded-full text-white text-sm font-medium">
                {currentIndex + 1} / {slides.length}
              </div>

              {/* Timer in fullscreen */}
              {isFullscreen && (
                <div className="absolute top-4 right-4 px-3 py-1 bg-black/50 backdrop-blur-sm rounded-full text-white text-sm font-mono">
                  {formatTime(elapsedTime)}
                </div>
              )}
            </div>

            {/* Slide Title - Hide in fullscreen */}
            {!isFullscreen && currentSlide?.title && (
              <h2 className="mt-6 text-xl md:text-2xl font-bold text-center font-serif text-foreground">
                {currentSlide.title}
              </h2>
            )}

            {/* Progress Dots - Hide in fullscreen */}
            {!isFullscreen && (
              <div className="flex items-center gap-2 mt-4">
                {slides.slice(0, 10).map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => jumpToSlide(idx)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      idx === currentIndex
                        ? 'bg-primary w-6'
                        : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                    }`}
                    aria-label={`Go to slide ${idx + 1}`}
                  />
                ))}
                {slides.length > 10 && (
                  <span className="text-xs text-muted-foreground">
                    +{slides.length - 10} more
                  </span>
                )}
              </div>
            )}

            {/* Talking Points Toggle - Hide in fullscreen */}
            {!isFullscreen && (isPresenterSlides || currentSlide?.talking_points?.length > 0) && (
              <button
                onClick={() => setShowTalkingPoints(!showTalkingPoints)}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-full text-sm font-medium transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                <span>
                  {showTalkingPoints ? 'Hide' : 'Show'} Talking Points
                </span>
              </button>
            )}

            {/* Talking Points Panel - Hide in fullscreen */}
            {!isFullscreen && showTalkingPoints && currentSlide?.talking_points && (
              <div className="mt-4 w-full max-w-2xl p-4 bg-secondary/30 rounded-lg border border-border">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-2">
                  Talking Points
                </h3>
                <ul className="space-y-2">
                  {currentSlide.talking_points.map((point, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0" />
                      <span className="text-sm leading-relaxed">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}

      {/* Navigation Controls */}
      <div className={`shrink-0 border-t border-border bg-background/80 backdrop-blur-md z-10 ${
        isFullscreen ? 'p-2' : 'p-4 md:px-8 md:py-6'
      }`}>
        <div className={`mx-auto w-full flex items-center justify-between ${
          isFullscreen ? '' : 'max-w-5xl'
        }`}>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrev}
              disabled={currentIndex === 0}
              className={`rounded-full bg-secondary hover:bg-secondary/80 disabled:opacity-30 disabled:hover:bg-secondary transition-all ${
                isFullscreen ? 'p-2' : 'p-3'
              }`}
              aria-label="Previous slide"
            >
              <ChevronLeft className={isFullscreen ? 'w-4 h-4' : 'w-5 h-5'} />
            </button>
            <button
              onClick={handleNext}
              disabled={currentIndex === slides.length - 1}
              className={`rounded-full bg-secondary hover:bg-secondary/80 disabled:opacity-30 disabled:hover:bg-secondary transition-all ${
                isFullscreen ? 'p-2' : 'p-3'
              }`}
              aria-label="Next slide"
            >
              <ChevronRight className={isFullscreen ? 'w-4 h-4' : 'w-5 h-5'} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Thumbnail Grid Toggle */}
            <button
              onClick={() => setShowThumbnailGrid(!showThumbnailGrid)}
              className={`rounded-full bg-secondary hover:bg-secondary/80 transition-all ${
                isFullscreen ? 'p-2' : 'p-3'
              }`}
              aria-label="Toggle slide grid"
              title="Slide grid (G)"
            >
              <Grid3x3 className={isFullscreen ? 'w-4 h-4' : 'w-5 h-5'} />
            </button>

            {/* Speaker View Toggle - Hide in fullscreen */}
            {!isFullscreen && (
              <button
                onClick={() => setShowSpeakerView(!showSpeakerView)}
                className="rounded-full bg-secondary hover:bg-secondary/80 transition-all p-3"
                aria-label="Toggle speaker view"
                title="Speaker view (S)"
              >
                <MessageSquare className="w-5 h-5" />
              </button>
            )}

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className={`rounded-full bg-secondary hover:bg-secondary/80 transition-all ${
                isFullscreen ? 'p-2' : 'p-3'
              }`}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              title="Fullscreen (F)"
            >
              {isFullscreen ? (
                <Minimize2 className={isFullscreen ? 'w-4 h-4' : 'w-5 h-5'} />
              ) : (
                <Maximize2 className={isFullscreen ? 'w-4 h-4' : 'w-5 h-5'} />
              )}
            </button>

            {/* Download Button - Hide in fullscreen */}
            {!isFullscreen && (
              <button
                className="p-3 rounded-full bg-secondary hover:bg-secondary/80 transition-all"
                aria-label="Download slides"
                title="Download coming soon"
              >
                <Download className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>

        {/* Keyboard Hints */}
        {!isFullscreen && (
          <div className="text-center mt-2">
            <p className="text-xs text-muted-foreground">
              Use arrow keys to navigate • Space for next • F for fullscreen • G for grid • S for speaker view • T for transitions
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
