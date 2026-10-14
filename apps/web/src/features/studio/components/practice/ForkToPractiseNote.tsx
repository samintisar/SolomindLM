import { GitFork } from "lucide-react";
import { Alert, AlertDescription } from "@/shared/components/ui/alert";

/**
 * Shown to a viewer of a public notebook in place of practice controls. Practice writes onto the
 * shared Studio item, so it is limited to owners and editors until per-viewer progress lands.
 */
export function ForkToPractiseNote({ className }: { className?: string }) {
  return (
    <Alert role="note" className={className}>
      <GitFork />
      <AlertDescription>Fork this notebook to practise.</AlertDescription>
    </Alert>
  );
}
