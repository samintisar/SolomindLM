import { api } from "@convex/_generated/api";
import { useAction } from "convex/react";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSubscriptionStatus } from "@/features/billing/services/subscriptionApi";
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
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useServiceErrorToast } from "@/shared/hooks/useServiceErrorToast";
import { useAuth } from "../useAuth";

const CONFIRMATION = "DELETE";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Permanent, in-app account deletion (App Store guideline 5.1.1(v)). */
export function DeleteAccountDialog({ open, onOpenChange }: DeleteAccountDialogProps) {
  const deleteAccount = useAction(api.account.actions.deleteAccount);
  const { signOut } = useAuth();
  const { hasSubscription } = useSubscriptionStatus();
  const { showError } = useServiceErrorToast();
  const navigate = useNavigate();
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleOpenChange = (next: boolean) => {
    if (isDeleting) return;
    if (!next) setConfirmation("");
    onOpenChange(next);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteAccount();
    } catch (error) {
      setIsDeleting(false);
      showError(error);
      return;
    }
    // The account is gone. Signing out clears this device's tokens (in the native app
    // too); if the dead session makes that fail, still leave for sign-in.
    try {
      await signOut();
    } catch {
      navigate("/sign-in", { replace: true });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete your account?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes your account and everything in it: notebooks, sources, chats,
            notes, and generated content. It can't be undone.
            {hasSubscription ? " Your subscription will be cancelled immediately." : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="delete-account-confirmation">Type {CONFIRMATION} to confirm</Label>
          <Input
            id="delete-account-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            disabled={isDeleting}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={confirmation !== CONFIRMATION || isDeleting}
            onClick={handleDelete}
          >
            {isDeleting ? <Loader2 className="animate-spin" /> : null}
            Delete account
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
