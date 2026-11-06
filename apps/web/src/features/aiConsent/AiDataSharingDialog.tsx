import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";
import { useServiceErrorToast } from "@/shared/hooks/useServiceErrorToast";
import { AiProviderList } from "./AiProviderList";

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
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!turningOff) onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>AI data sharing</AlertDialogTitle>
          <AlertDialogDescription>
            You allowed SolomindLM to send your content to these services. Turning this off locks
            the app until you allow it again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AiProviderList />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={turningOff}>Keep on</AlertDialogCancel>
          <Button variant="destructive" onClick={handleTurnOff} disabled={turningOff}>
            Turn off
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
