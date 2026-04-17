import React from "react";

interface ResizeHandleProps {
  width: number;
  position: "left" | "right";
}

/**
 * Resize handle component for panel resizing.
 * Uses custom events to communicate size changes to parent components.
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({ width, position }) => {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = width;
    let animationFrameId: number | null = null;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }

      animationFrameId = requestAnimationFrame(() => {
        // Calculate delta based on position
        // When handle is on left, dragging left (negative) expands, right (positive) contracts
        const delta =
          position === "left" ? -(moveEvent.clientX - startX) : moveEvent.clientX - startX;
        // Max width is 70% of screen width or 1400px, whichever is smaller
        const maxWidth = Math.min(window.innerWidth * 0.7, 1400);
        const newWidth = Math.max(220, Math.min(maxWidth, startWidth + delta));
        // Dispatch custom event that parent can listen to
        window.dispatchEvent(new CustomEvent("resizeStudioPanel", { detail: { width: newWidth } }));
      });
    };

    const handleMouseUp = () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      className="absolute top-0 left-0 w-1.5 h-full cursor-col-resize hover:bg-primary/50 z-50 transition-colors active:bg-primary/70 group hidden md:block"
      onMouseDown={handleMouseDown}
      aria-label="Resize panel"
    />
  );
};
