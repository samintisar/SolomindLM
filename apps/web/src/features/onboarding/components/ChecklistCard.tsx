import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { X, ChevronUp, ChevronDown } from "lucide-react";
import { api } from "@convex/_generated/api";
import { ChecklistItem } from "./ChecklistItem";
import { useServiceErrorToast } from "@/shared/hooks/useServiceErrorToast";

const COLLAPSED_KEY = "onboardingChecklistCollapsed";

const ITEM_LABELS: Record<string, string> = {
  createNotebook: "Create your first notebook",
  addSource: "Add a source",
  askQuestion: "Ask a question in chat",
  generateArtifact: "Generate your first artifact",
};

const ORDER = ["createNotebook", "addSource", "askQuestion", "generateArtifact"] as const;

function logOnboardingError(action: string, error: unknown) {
  console.error(`[onboarding] ${action}`, error);
}

export const ChecklistCard: React.FC = () => {
  const location = useLocation();
  const state = useQuery(api.onboarding.state.getOnboardingState, {});
  const progress = useQuery(api.onboarding.progress.getChecklistProgress, {});
  const dismiss = useMutation(api.onboarding.mutations.dismissChecklist);
  const { showError } = useServiceErrorToast();

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage?.getItem?.(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage?.setItem?.(COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore storage errors (private mode, quota, missing API)
    }
  }, [collapsed]);

  if (!state || !progress) return null;
  if ("tourStatus" in state && state.tourStatus === "completed") return null;
  if ("checklistDismissed" in state && state.checklistDismissed) return null;

  const isHome = location.pathname === "/home";
  const isNotebook = location.pathname.startsWith("/notebook/");
  if (!isHome && !isNotebook) return null;

  const completed = ORDER.filter((k) => progress[k]).length;
  if (completed === ORDER.length) return null;

  const handleDismiss = () => {
    void dismiss({}).catch((error) => {
      logOnboardingError("failed to dismiss checklist", error);
      showError(error);
    });
  };

  return (
    <div className="fixed bottom-4 right-4 z-[45] w-72 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-sm font-semibold">
          Get started — {completed} of {ORDER.length}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={collapsed ? "Expand" : "Collapse"}
            onClick={() => setCollapsed((c) => !c)}
            className="p-1 hover:bg-accent rounded"
          >
            {collapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={handleDismiss}
            className="p-1 hover:bg-accent rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {!collapsed && (
        <ul className="p-3">
          {ORDER.map((id) => (
            <ChecklistItem key={id} label={ITEM_LABELS[id]} done={progress[id]} />
          ))}
        </ul>
      )}
    </div>
  );
};
