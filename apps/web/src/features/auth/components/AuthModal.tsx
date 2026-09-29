import { type AuthFormInitialMode, AuthFormPanel } from "@/features/auth/components/AuthFormPanel";
import { Dialog, DialogContent, DialogTitle } from "@/shared/components/ui/dialog";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticated: () => void;
  initialMode?: AuthFormInitialMode;
}

export function AuthModal({
  isOpen,
  onClose,
  onAuthenticated,
  initialMode = "signIn",
}: AuthModalProps) {
  const handleAuthenticated = () => {
    onAuthenticated();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent
        theme="light"
        aria-describedby={undefined}
        className="max-h-full overflow-y-auto sm:max-w-md"
      >
        <DialogTitle className="sr-only">Sign in or create account</DialogTitle>
        <AuthFormPanel
          key={initialMode}
          chrome="none"
          initialMode={initialMode}
          onAuthenticated={handleAuthenticated}
        />
      </DialogContent>
    </Dialog>
  );
}
