import {
  ListChecks,
  LogIn,
  LogOut,
  MessageSquarePlus,
  Moon,
  Sun,
  User as UserIcon,
  Wrench,
} from "lucide-react";
import type React from "react";
import { useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { useServiceErrorToast } from "@/shared/hooks/useServiceErrorToast";
import { useFeedback } from "../../feedback/FeedbackContext";
import { useIsFeedbackAdmin } from "../../feedback/services/feedbackApi";
import type { User } from "../useAuth";
import { LanguageSelector } from "./LanguageSelector";

interface AvatarDropdownProps {
  user: User | null;
  isAuthenticated: boolean;
  onLogin: () => void;
  /** May be async (e.g. Convex `signOut`); a rejection is shown as an error toast. */
  onLogout: () => Promise<void> | void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  onShowChecklist?: () => void;
  showChecklistDismissed?: boolean;
}

/** First letter of the user's name (else email), uppercased; null when neither is set. */
function userInitial(user: User | null): string | null {
  const source = user?.name?.trim() || user?.email?.trim();
  return source ? source.charAt(0).toUpperCase() : null;
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
  const navigate = useNavigate();
  const { showError } = useServiceErrorToast();
  const { open: openFeedback } = useFeedback();
  // Only the "Feedback triage" item needs this, and it's staff-only — don't open
  // the subscription for signed-out menus.
  const isFeedbackAdmin = useIsFeedbackAdmin(isAuthenticated);
  const displayLabel = user?.email ?? user?.name ?? (isAuthenticated ? "Signed in" : null);
  const initial = isAuthenticated ? userInitial(user) : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="avatar" aria-label="Account menu">
          <Avatar>
            {isAuthenticated && user?.image ? (
              // Google photo URLs can 403 when a referrer is sent.
              <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />
            ) : null}
            <AvatarFallback>{initial ?? <UserIcon />}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {isAuthenticated && displayLabel ? (
          <>
            <DropdownMenuLabel title={displayLabel}>
              <span className="block truncate">{displayLabel}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={toggleTheme}>
            {theme === "dark" ? <Sun /> : <Moon />}
            {theme === "light" ? "Dark mode" : "Light mode"}
          </DropdownMenuItem>
          <LanguageSelector isAuthenticated={isAuthenticated} />
          {isAuthenticated && showChecklistDismissed && onShowChecklist ? (
            <DropdownMenuItem onSelect={onShowChecklist}>
              <ListChecks />
              Show getting-started checklist
            </DropdownMenuItem>
          ) : null}
          {isAuthenticated ? (
            <DropdownMenuItem onSelect={() => openFeedback("bug")}>
              <MessageSquarePlus />
              Send feedback
            </DropdownMenuItem>
          ) : null}
          {isAuthenticated && isFeedbackAdmin ? (
            <DropdownMenuItem onSelect={() => navigate("/admin/feedback")}>
              <Wrench />
              Feedback triage
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            if (!isAuthenticated) {
              onLogin();
              return;
            }
            // Promise.resolve also wraps a sync onLogout; a sync throw still propagates to Radix.
            Promise.resolve(onLogout()).catch(showError);
          }}
        >
          {isAuthenticated ? <LogOut /> : <LogIn />}
          {isAuthenticated ? "Logout" : "Login"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
