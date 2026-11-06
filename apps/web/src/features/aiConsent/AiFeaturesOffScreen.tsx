import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DeleteAccountDialog } from "@/features/auth/components/DeleteAccountDialog";
import { useAuth } from "@/features/auth/useAuth";
import { Button } from "@/shared/components/ui/button";
import { useServiceErrorToast } from "@/shared/hooks/useServiceErrorToast";

interface AiFeaturesOffScreenProps {
  /** Show the consent screen again. */
  onReview: () => void;
}

/** Shown in the mobile shell after "Not now" or Turn off: the app stays locked until the user allows. */
export function AiFeaturesOffScreen({ onReview }: AiFeaturesOffScreenProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { showError } = useServiceErrorToast();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const handleSignOut = async () => {
    try {
      await signOut();
      // The gate hides AppShell, which normally does this redirect.
      navigate("/sign-in", { replace: true });
    } catch (err) {
      showError(err);
    }
  };

  return (
    <main className="flex min-h-dvh w-full justify-center bg-background px-4 py-8">
      <div className="flex w-full max-w-md flex-col justify-center gap-6">
        <div className="flex flex-col gap-3 text-center">
          <h1 className="font-display text-2xl text-foreground">AI features are off</h1>
          <p className="text-muted-foreground">
            SolomindLM needs these services to read your sources and answer questions, so the app
            can&apos;t be used without them. You can turn them on any time.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={onReview}>
            Review and allow
          </Button>
          <Button size="lg" variant="secondary" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/privacy">Privacy policy</Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)}>
            Delete account
          </Button>
        </div>
      </div>
      {deleteOpen ? <DeleteAccountDialog open onOpenChange={setDeleteOpen} /> : null}
    </main>
  );
}
