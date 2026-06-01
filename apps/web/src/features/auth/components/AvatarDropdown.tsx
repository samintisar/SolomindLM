import { ListChecks, LogIn, LogOut, Moon, Sun } from "lucide-react";
import React from "react";
import type { User } from "../useAuth";
import { LanguageSelector } from "./LanguageSelector";

interface AvatarDropdownProps {
  user: User | null;
  isAuthenticated: boolean;
  onLogin: () => void;
  onLogout: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  onShowChecklist?: () => void;
  showChecklistDismissed?: boolean;
}

export const AvatarDropdown: React.FC<AvatarDropdownProps> = ({
  user,
  isAuthenticated,
  onLogin,
  onLogout,
  theme,
  toggleTheme,
  onShowChecklist,
  showChecklistDismissed,
}) => {
  const handleLogout = async () => {
    await onLogout();
  };

  const displayLabel = user?.email ?? user?.name ?? (isAuthenticated ? "Signed in" : null);

  return (
    <>
      {/* User Section (when authenticated) - show email/name at top */}
      {isAuthenticated && displayLabel && (
        <div className="px-4 py-3 border-b border-border/50">
          <p className="text-sm font-medium text-foreground truncate" title={displayLabel}>
            {displayLabel}
          </p>
        </div>
      )}

      {/* Menu Items */}
      <div className="py-1">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
          role="menuitem"
        >
          {theme === "dark" ? (
            <Sun className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <Moon className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <span>{theme === "light" ? "Dark mode" : "Light mode"}</span>
        </button>

        {/* Language Selector */}
        <LanguageSelector isAuthenticated={isAuthenticated} />

        {isAuthenticated && showChecklistDismissed && onShowChecklist && (
          <button
            onClick={onShowChecklist}
            className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
            role="menuitem"
          >
            <ListChecks className="w-4 h-4 text-muted-foreground shrink-0" />
            <span>Show getting-started checklist</span>
          </button>
        )}

        {/* Login/Logout */}
        <button
          onClick={isAuthenticated ? handleLogout : onLogin}
          className="w-full px-4 py-2.5 text-left hover:bg-accent transition-colors flex items-center gap-3 text-sm font-sans"
          role="menuitem"
        >
          {isAuthenticated ? (
            <LogOut className="w-4 h-4 text-muted-foreground shrink-0" />
          ) : (
            <LogIn className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <span>{isAuthenticated ? "Logout" : "Login"}</span>
        </button>
      </div>
    </>
  );
};
