import { Skeleton } from "@/shared/components/ui/skeleton";
import { GRID_CLASS } from "./gridClass";

export function GridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={GRID_CLASS} role="status" aria-busy="true" aria-label="Loading notebooks">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col overflow-hidden rounded-xl border bg-card">
          <Skeleton className="h-20 w-full" />
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}
