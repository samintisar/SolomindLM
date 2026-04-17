import React from "react";

export const ListHeader: React.FC = () => {
  return (
    <div className="grid grid-cols-[minmax(200px,1fr)_100px_48px] gap-4 px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-widest border-b border-border/50 mb-3 font-sans bg-secondary/30">
      <span>Title</span>
      <span className="text-right">Sources</span>
      <span></span>
    </div>
  );
};
