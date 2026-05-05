import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useAuthToken } from "@convex-dev/auth/react";
import { CONVEX_SITE_URL } from "../services/chatApi";
import { useToast } from "@/shared/contexts/useToast";

export function useResearchPlanActions() {
  const approvePlanMutation = useMutation(api.research.index.approveResearchPlan);
  const rejectPlanMutation = useMutation(api.research.index.rejectResearchPlan);
  const authToken = useAuthToken();
  const { error: toastError } = useToast();

  const handleApproveResearchPlan = useCallback(
    async (planId: string, consumeResearchExecuteStream: (response: Response) => Promise<void>) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await approvePlanMutation({ planId: planId as any });
        const response = await fetch(`${CONVEX_SITE_URL}/research/execute`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ planId }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(data?.error || `Research failed to start (${response.status})`);
        }
        await consumeResearchExecuteStream(response);
      } catch (err) {
        console.error("[ResearchPlan] Approve failed:", err);
        toastError(err instanceof Error ? err.message : "Failed to start research execution");
      }
    },
    [approvePlanMutation, authToken, toastError]
  );

  const handleRejectResearchPlan = useCallback(
    async (planId: string) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await rejectPlanMutation({ planId: planId as any });
      } catch (err) {
        console.error("[ResearchPlan] Reject failed:", err);
      }
    },
    [rejectPlanMutation]
  );

  return { handleApproveResearchPlan, handleRejectResearchPlan };
}
