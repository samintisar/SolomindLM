import React from 'react';

interface PageSkeletonProps {
  className?: string;
}

/**
 * Full page loading skeleton
 * Use this when loading entire pages or main content areas
 */
export function PageSkeleton({ className = '' }: PageSkeletonProps) {
  return (
    <div className={`flex-1 overflow-y-auto bg-background p-6 md:p-12 font-serif ${className}`}>
      <div className="max-w-[1600px] mx-auto space-y-10">
        {/* Header skeleton */}
        <div className="flex items-center justify-between gap-4">
          <div className="h-8 w-48 bg-muted/20 animate-pulse rounded-lg" />
          <div className="flex items-center gap-3">
            <div className="h-10 w-24 bg-muted/20 animate-pulse rounded-lg" />
            <div className="h-10 w-32 bg-muted/20 animate-pulse rounded-lg" />
          </div>
        </div>

        {/* Grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="aspect-16/10 rounded-2xl bg-muted/10 border border-border animate-pulse"
              style={{
                animationDelay: `${i * 100}ms`,
                animationDuration: '1.5s',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
