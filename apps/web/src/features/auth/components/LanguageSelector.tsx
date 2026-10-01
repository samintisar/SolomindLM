import { Globe } from "lucide-react";
import type React from "react";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { SUPPORTED_LANGUAGES } from "../constants/languages";
import { useOutputLanguage } from "../hooks/useOutputLanguage";

interface LanguageSelectorProps {
  isAuthenticated: boolean;
}

/** Output-language submenu; must render inside a DropdownMenuContent. */
export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ isAuthenticated }) => {
  const { language, isLoading, setLanguage } = useOutputLanguage(isAuthenticated);
  if (!isAuthenticated) return null;

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Globe />
        Output language
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
        <DropdownMenuRadioGroup value={language} onValueChange={setLanguage}>
          {SUPPORTED_LANGUAGES.map((supported) => (
            <DropdownMenuRadioItem key={supported.code} value={supported.code} disabled={isLoading}>
              {supported.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
