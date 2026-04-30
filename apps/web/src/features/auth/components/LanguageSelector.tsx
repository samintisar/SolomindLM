import React from "react";
import { Globe } from "lucide-react";
import { SUPPORTED_LANGUAGES } from "../constants/languages";
import { useOutputLanguage } from "../hooks/useOutputLanguage";

interface LanguageSelectorProps {
  isAuthenticated: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ isAuthenticated }) => {
  const { language, isLoading, setLanguage } = useOutputLanguage();

  if (!isAuthenticated) return null;

  return (
    <div className="px-4 py-2.5 flex items-center gap-3 text-sm font-sans">
      <Globe className="w-4 h-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-foreground">Output language</span>
      <select
        value={language}
        disabled={isLoading}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          setLanguage(e.target.value);
        }}
        className="text-xs bg-transparent border border-border rounded px-1.5 py-0.5 text-muted-foreground cursor-pointer hover:border-ring focus:outline-none focus:border-ring disabled:opacity-50"
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
};
