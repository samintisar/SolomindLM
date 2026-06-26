import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Share2, User as UserIcon } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AvatarDropdown } from "../../features/auth/components/AvatarDropdown";
import { useAuth } from "../../features/auth/useAuth";
import { useTheme } from "../contexts/useTheme";
import { useServiceErrorToast } from "../hooks/useServiceErrorToast";
import { DropdownMenu } from "./DropdownMenu";

interface HeaderProps {
  title: string;
  onRename: (newTitle: string) => void;
  isHome: boolean;
  onLogoClick: () => void;
  onBillingClick?: () => void;
  hasSubscription?: boolean;
  /** When false, title is read-only (e.g. shared notebook as editor). */
  notebookRenamable?: boolean;
  /** Owner-only: opens share UI for the active notebook. */
  onShare?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  onRename,
  isHome,
  onLogoClick,
  onBillingClick,
  hasSubscription = false,
  notebookRenamable = true,
  onShare,
}) => {
  const navigate = useNavigate();
  const authLocation = useLocation();
  const { user, isAuthenticated, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const onboardingState = useQuery(api.onboarding.state.getOnboardingState, {});
  const showChecklistMutation = useMutation(api.onboarding.mutations.showChecklist);

  const showChecklistDismissed =
    !!onboardingState &&
    "_id" in onboardingState &&
    onboardingState.checklistDismissed === true &&
    onboardingState.tourStatus !== "completed";

  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const [inputWidth, setInputWidth] = useState(0);

  const { showError } = useServiceErrorToast();
  const logOnboardingError = (action: string, error: unknown) => {
    console.error(`[onboarding] ${action}`, error);
  };

  // Sync internal state if prop changes
  useEffect(() => {
    setInputValue(title);
  }, [title]);

  useEffect(() => {
    if (!notebookRenamable && isEditing) {
      setInputValue(title);
      setIsEditing(false);
    }
  }, [notebookRenamable, isEditing, title]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Measure text width for dynamic input sizing
  useEffect(() => {
    if (spanRef.current) {
      setInputWidth(spanRef.current.offsetWidth + 20); // Add some padding
    }
  }, [inputValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setInputValue(title);
      setIsEditing(false);
    }
  };

  const handleSave = () => {
    if (inputValue.trim()) {
      onRename(inputValue.trim());
    } else {
      setInputValue(title);
    }
    setIsEditing(false);
  };

  const handleShowChecklist = () => {
    void showChecklistMutation({}).catch((error) => {
      logOnboardingError("failed to show checklist", error);
      showError(error);
    });
  };

  return (
    <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b-2 border-border bg-background relative z-70 transition-all duration-300">
      {/* Hidden span for measuring text width */}
      <span
        ref={spanRef}
        className="absolute opacity-0 pointer-events-none text-lg font-display font-bold whitespace-pre"
      >
        {inputValue || "Enter title"}
      </span>

      {/* Left Section: logo (Go to Home) separate from notebook name (rename) */}
      <div className="flex items-center gap-4 min-w-0 flex-1">
        <button
          type="button"
          onClick={onLogoClick}
          className="flex items-center justify-center w-8 h-8 shrink-0 rounded hover:scale-105 transition-transform focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          title="Go to Home"
          aria-label="Go to Home"
        >
          <img
            src="/SolomindLM_logo.png"
            alt="SolomindLM Logo"
            className="w-8 h-8 object-contain"
            onError={(e) => {
              // Fallback to 'N' if image doesn't exist
              const target = e.target as HTMLImageElement;
              target.style.display = "none";
              if (target.parentElement) {
                target.parentElement.textContent = "N";
                (target.parentElement as HTMLElement).className =
                  "w-8 h-8 bg-primary rounded-sm flex items-center justify-center text-primary-foreground font-bold font-serif shadow-sm";
              }
            }}
          />
        </button>
        {isHome ? (
          <span className="text-xl font-display font-bold text-foreground tracking-tight">
            SolomindLM
          </span>
        ) : (
          <>
            <div className="h-4 w-px bg-border shrink-0" aria-hidden />
            {isEditing ? (
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleSave}
                style={{ width: Math.max(100, inputWidth) }}
                className="text-lg font-display font-bold text-foreground bg-transparent border-b border-primary outline-none p-0 tracking-tight min-w-0"
                aria-label="Notebook name"
              />
            ) : notebookRenamable ? (
              <h1
                onClick={() => setIsEditing(true)}
                className="text-lg font-display font-bold text-foreground tracking-tight cursor-text hover:text-foreground/80 hover:decoration-dotted hover:underline underline-offset-4 transition-all truncate min-w-0"
                title="Click to rename notebook"
              >
                {title}
              </h1>
            ) : (
              <h1
                className="text-lg font-display font-bold text-foreground tracking-tight truncate min-w-0"
                title={title}
              >
                {title}
              </h1>
            )}
          </>
        )}
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2 sm:gap-4">
        {onShare && (
          <button
            type="button"
            onClick={onShare}
            className="px-3 py-1.5 text-sm font-medium border border-border rounded-md hover:bg-secondary transition-colors flex items-center gap-1.5 shrink-0"
            title="Share notebook"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">Share</span>
          </button>
        )}
        {onBillingClick && !hasSubscription && (
          <button
            onClick={onBillingClick}
            className="px-3 py-1.5 text-sm font-medium bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors"
          >
            Upgrade to Pro
          </button>
        )}
        {onBillingClick && hasSubscription && (
          <button
            onClick={onBillingClick}
            className="px-3 py-1.5 text-sm font-medium bg-success/10 hover:bg-success/20 text-success rounded-md transition-colors"
          >
            Pro
          </button>
        )}
        <DropdownMenu
          trigger={
            <div className="w-8 h-8 rounded-xl bg-secondary border border-border flex items-center justify-center hover:ring-2 hover:ring-ring transition-all shrink-0">
              <UserIcon className="w-4 h-4 text-secondary-foreground shrink-0" />
            </div>
          }
          align="right"
        >
          <AvatarDropdown
            user={user}
            isAuthenticated={isAuthenticated}
            onLogin={() =>
              navigate("/sign-in", {
                state: {
                  from:
                    authLocation.pathname === "/"
                      ? "/home"
                      : `${authLocation.pathname}${authLocation.search}`,
                },
              } as never)
            }
            onLogout={signOut}
            theme={theme}
            toggleTheme={toggleTheme}
            onShowChecklist={handleShowChecklist}
            showChecklistDismissed={showChecklistDismissed}
          />
        </DropdownMenu>
      </div>
    </header>
  );
};
