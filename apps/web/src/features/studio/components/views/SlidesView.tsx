import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  MessageSquare,
  ArrowLeft,
  Download,
} from 'lucide-react';
import { SlideDeckNote, Slide } from '@/shared/types/index';

export interface SlidesViewProps {
  note: SlideDeckNote;
  onNoteUpdate?: (note: SlideDeckNote) => void;
  onBack?: () => void;
}

export const SlidesView: React.FC<SlidesViewProps> = ({ note, onNoteUpdate, onBack }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTalkingPoints, setShowTalkingPoints] = useState(false);
  const [imageError, setImageError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const slides = note.slides || [];
  const currentSlide = slides[currentIndex];

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
      setCurrentIndex(prev => prev + 1);
      setImageError(false);
    }
  }, [currentIndex, slides.length]);

  const handlePrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setImageError(false);
    }
  }, [currentIndex, slides.length]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [handleNext, handlePrev, toggleFullscreen]);

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
        <div className={`w-full relative bg-black overflow-hidden shadow-2xl ${
          isFullscreen 
            ? 'h-full max-h-full' 
            : 'max-w-5xl aspect-video rounded-lg'
        }`}>
          {/* Slide Image */}
          {currentSlide?.slide_url && !imageError ? (
            <img
              src={currentSlide.slide_url}
              alt={`Slide ${currentSlide.slide_number}: ${currentSlide.title}`}
              className="w-full h-full object-contain"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/20 to-primary/5">
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
                onClick={() => {
                  setCurrentIndex(idx);
                  setImageError(false);
                }}
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
            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              className={`rounded-full bg-secondary hover:bg-secondary/80 transition-all ${
                isFullscreen ? 'p-2' : 'p-3'
              }`}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
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
              Use arrow keys to navigate • Space for next • F for fullscreen
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
