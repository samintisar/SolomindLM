import React from 'react';

interface ProgressBarProps {
  value: number; // 0-100
  className?: string;
  showLabel?: boolean;
}

/**
 * Progress bar component for displaying completion percentage
 */
export function ProgressBar({ value, className = '', showLabel = false }: ProgressBarProps) {
  const clampedValue = Math.min(100, Math.max(0, value));

  return (
    <div className={`relative w-full h-2 bg-muted rounded-full overflow-hidden ${className}`}>
      <div
        className="absolute top-0 left-0 h-full bg-primary transition-all duration-500 ease-out rounded-full"
        style={{ width: `${clampedValue}%` }}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
      />
      {showLabel && (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-primary-foreground">
          {clampedValue}%
        </span>
      )}
    </div>
  );
}
