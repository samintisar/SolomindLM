import React from "react";
import { useSelectionTooltip } from "../contexts/SelectionQuoteContext";

export const SelectionTooltip: React.FC = () => {
  const { tooltip, hideTooltip, handleAddToChat } = useSelectionTooltip();

  if (!tooltip.visible) return null;

  return (
    <div
      className="fixed z-[100] pointer-events-auto motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-150 motion-reduce:animate-none"
      style={{
        left: tooltip.x,
        top: tooltip.y - 6,
        transform: "translate(-50%, -100%)",
      }}
      onMouseLeave={hideTooltip}
    >
      <button
        type="button"
        onClick={handleAddToChat}
        className="inline-flex items-center justify-center rounded-lg bg-foreground px-4 py-2 font-serif text-[13px] font-normal tracking-normal text-background shadow-lg ring-1 ring-black/4 outline-none transition-[transform,filter] hover:brightness-[1.05] active:scale-[0.98] dark:ring-white/8 dark:hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span className="select-none whitespace-nowrap">Add to chat</span>
      </button>
      <div
        className="absolute left-1/2 top-full -translate-x-1/2 size-0 border-x-[7px] border-x-transparent border-t-[7px] border-t-foreground"
        aria-hidden
      />
    </div>
  );
};
