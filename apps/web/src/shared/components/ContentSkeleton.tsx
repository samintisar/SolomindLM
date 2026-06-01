interface ContentSkeletonProps {
  lines?: number;
  className?: string;
}

/**
 * Content area loading skeleton
 * Use this for loading text content, document content, etc.
 */
export function ContentSkeleton({ lines = 8, className = "" }: ContentSkeletonProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      {/* Title skeleton */}
      <div className="h-8 w-3/4 bg-muted/20 animate-pulse rounded-lg mb-6" />

      {/* Content lines */}
      {[...Array(lines)].map((_, i) => (
        <div
          key={i}
          className="h-4 bg-muted/10 animate-pulse rounded"
          style={{
            width: `${Math.random() * 30 + 70}%`,
            animationDelay: `${i * 50}ms`,
            animationDuration: "1.5s",
          }}
        />
      ))}
    </div>
  );
}
