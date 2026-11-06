import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { useServiceErrorToast } from "@/shared/hooks/useServiceErrorToast";
import { AI_PROVIDERS } from "./aiConsentCopy";

interface AiDataSharingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Withdraw AI data-sharing consent from the mobile app's avatar menu. */
export function AiDataSharingDialog({ open, onOpenChange }: AiDataSharingDialogProps) {
  const decline = useMutation(api.userPreferences.index.declineAiConsent);
  const { showError } = useServiceErrorToast();
  const [turningOff, setTurningOff] = useState(false);

  const handleTurnOff = async () => {
    setTurningOff(true);
    try {
      await decline({});
      onOpenChange(false);
    } catch (err) {
      showError(err);
    } finally {
      setTurningOff(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>AI data sharing</DialogTitle>
          <DialogDescription>
            You allowed SolomindLM to send your content to these services. Turning this off locks
            the app until you allow it again.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
          {AI_PROVIDERS.map((provider) => (
            <li key={provider.name}>
              <span className="text-foreground">{provider.name}</span>:{" "}
              {provider.data.toLowerCase()}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={turningOff}>
            Keep on
          </Button>
          <Button variant="destructive" onClick={handleTurnOff} disabled={turningOff}>
            Turn off
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
