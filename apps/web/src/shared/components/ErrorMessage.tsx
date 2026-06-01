import { AlertCircle, RefreshCw, XCircle } from "lucide-react";

interface ErrorMessageProps {
  error: string;
  type?: "error" | "warning";
  onRetry?: () => void;
  onDismiss?: () => void;
  className?: string;
}

/**
 * Reusable error message component with optional retry action
 */
export function ErrorMessage({
  error,
  type = "error",
  onRetry,
  onDismiss,
  className = "",
}: ErrorMessageProps) {
  const isError = type === "error";
  const Icon = isError ? XCircle : AlertCircle;
  const bgColor = isError ? "bg-destructive/10" : "bg-yellow-500/10";
  const borderColor = isError ? "border-destructive/20" : "border-yellow-500/20";
  const textColor = isError ? "text-destructive" : "text-yellow-600 dark:text-yellow-400";

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${textColor} shrink-0 mt-0.5`} />
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${textColor} break-words`}>{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Try Again
            </button>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Dismiss"
          >
            <XCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
