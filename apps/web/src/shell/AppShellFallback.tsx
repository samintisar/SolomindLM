import { Spinner } from "@/shared/components/ui/spinner";

/** Full-screen spinner while the app shell (or the AI consent check) loads. */
export function AppShellFallback() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-background">
      <span className="text-primary">
        <Spinner className="size-8" aria-label="Loading" />
      </span>
    </div>
  );
}
