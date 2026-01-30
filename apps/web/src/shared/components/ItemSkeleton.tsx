import React from 'react';

interface ItemSkeletonProps {
  count?: number;
  viewMode?: 'grid' | 'list';
  className?: string;
}

/**
 * List item loading skeleton
 * Use this for loading individual items in lists/grids
 */
export function ItemSkeleton({
  count = 3,
  viewMode = 'grid',
  className = ''
}: ItemSkeletonProps) {
  if (viewMode === 'list') {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        {[...Array(count)].map((_, i) => (
          <div
            key={i}
            className="h-20 bg-muted/10 border border-border/50 rounded-lg animate-pulse"
            style={{
              animationDelay: `${i * 100}ms`,
              animationDuration: '1.5s',
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 ${className}`}>
      {[...Array(count)].map((_, i) => (
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
  );
}
