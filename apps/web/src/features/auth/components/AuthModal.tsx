import { X } from "lucide-react";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { type AuthFormInitialMode, AuthFormPanel } from "@/features/auth/components/AuthFormPanel";

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
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAuthenticated = () => {
    onAuthenticated();
    onClose();
  };

  const content = (
    <div
      className="fixed inset-0 z-120 flex items-center justify-center p-4 animate-in fade-in duration-200"
      role="presentation"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Sign in or create account"
        className="relative z-10 w-full max-w-md max-h-[min(90vh,720px)] overflow-y-auto"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-xl p-2 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
        <AuthFormPanel
          key={initialMode}
          initialMode={initialMode}
          onAuthenticated={handleAuthenticated}
        />
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
