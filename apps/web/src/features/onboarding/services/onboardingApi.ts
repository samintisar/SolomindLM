import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";

export function useDismissChecklist() {
  return useMutation(api.onboarding.mutations.dismissChecklist);
}
