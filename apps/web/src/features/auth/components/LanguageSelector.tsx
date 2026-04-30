import React from "react";
import { Check, ChevronRight, Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../constants/languages";
import { useOutputLanguage } from "../hooks/useOutputLanguage";

interface LanguageSelectorProps {
  isAuthenticated: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ isAuthenticated }) => {
  const { language, isLoading, setLanguage } = useOutputLanguage(isAuthenticated);
  const [isOpen, setIsOpen] = React.useState(false);

  if (!isAuthenticated) return null;

  return (
    <div className="font-sans">
      <button
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((previousValue) => !previousValue);
        }}
        className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm"
        role="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="text-foreground">Output language</span>
        <ChevronRight
          className={`ml-auto w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
        />
      </button>

      {isOpen && (
        <div
          className="mx-4 mb-2 rounded-md border border-border bg-background max-h-48 overflow-auto py-1"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          role="listbox"
          aria-label="Output language options"
        >
          {SUPPORTED_LANGUAGES.map((supportedLanguage) => {
            const isSelected = supportedLanguage.code === language;
            return (
              <button
                key={supportedLanguage.code}
                type="button"
                className="w-full px-3 py-2 text-left hover:bg-accent transition-colors flex items-center justify-between gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading}
                onClick={(e) => {
                  e.stopPropagation();
                  setLanguage(supportedLanguage.code);
                  setIsOpen(false);
                }}
                role="option"
                aria-selected={isSelected}
              >
                <span className={isSelected ? "text-foreground font-medium" : "text-foreground"}>
                  {supportedLanguage.label}
                </span>
                {isSelected ? <Check className="w-4 h-4 text-primary shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
