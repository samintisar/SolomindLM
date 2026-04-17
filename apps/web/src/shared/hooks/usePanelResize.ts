import { useState, useCallback, useEffect } from "react";

const MIN_PANEL_WIDTH = 220;
const getMaxPanelWidth = () => Math.min(window.innerWidth * 0.7, 1400);

export function usePanelResize() {
  const [leftWidth, setLeftWidth] = useState(360);
  const [rightWidth, setRightWidth] = useState(420);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  const startResizingLeft = useCallback(() => setIsResizingLeft(true), []);
  const startResizingRight = useCallback(() => setIsResizingRight(true), []);
  const stopResizing = useCallback(() => {
    setIsResizingLeft(false);
    setIsResizingRight(false);
  }, []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      const maxWidth = getMaxPanelWidth();
      if (isResizingLeft) {
        const newWidth = mouseMoveEvent.clientX;
        if (newWidth >= MIN_PANEL_WIDTH && newWidth <= maxWidth) {
          setLeftWidth(newWidth);
        }
      }
      if (isResizingRight) {
        const newWidth = window.innerWidth - mouseMoveEvent.clientX;
        if (newWidth >= MIN_PANEL_WIDTH && newWidth <= maxWidth) {
          setRightWidth(newWidth);
        }
      }
    },
    [isResizingLeft, isResizingRight]
  );

  useEffect(() => {
    if (isResizingLeft || isResizingRight) {
      window.addEventListener("mousemove", resize);
      window.addEventListener("mouseup", stopResizing);
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
    } else {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }

    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [isResizingLeft, isResizingRight, resize, stopResizing]);

  // Listen for panel resize events from child components
  useEffect(() => {
    const handleSourcesPanelResize = (e: Event) => {
      const customEvent = e as CustomEvent;
      setLeftWidth(customEvent.detail.width);
    };

    const handleStudioPanelResize = (e: Event) => {
      const customEvent = e as CustomEvent;
      setRightWidth(customEvent.detail.width);
    };

    window.addEventListener("resizeSourcesPanel", handleSourcesPanelResize);
    window.addEventListener("resizeStudioPanel", handleStudioPanelResize);

    return () => {
      window.removeEventListener("resizeSourcesPanel", handleSourcesPanelResize);
      window.removeEventListener("resizeStudioPanel", handleStudioPanelResize);
    };
  }, []);

  return {
    leftWidth,
    rightWidth,
    isResizingLeft,
    isResizingRight,
    startResizingLeft,
    startResizingRight,
  };
}
