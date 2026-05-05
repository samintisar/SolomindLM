import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import type { ReferenceChunk, Message } from "@/shared/types/index";

interface TooltipStyle {
  top?: number;
  left?: number;
}

interface TooltipContent {
  ref: ReferenceChunk;
  x: number;
  y: number;
}

interface UseReferenceTooltipOptions {
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messages: Message[];
}

interface UseReferenceTooltipReturn {
  hoveredRefId: number | null;
  hoveredMessageId: string | null;
  tooltipPosition: "top" | "bottom";
  tooltipStyle: TooltipStyle;
  isTooltipHovered: boolean;
  setIsTooltipHovered: (v: boolean) => void;
  handleRefHover: (refId: number, messageId: string, event: React.MouseEvent) => void;
  handleRefLeave: () => void;
  handleRefClick: (refId: number, messageId: string, event: React.MouseEvent | React.TouchEvent) => void;
  closeTooltip: () => void;
  tooltipRef: React.RefObject<HTMLDivElement | null>;
  tooltipContent: TooltipContent | null;
}

export function useReferenceTooltip(
  options: UseReferenceTooltipOptions
): UseReferenceTooltipReturn {
  const { messagesContainerRef, messages } = options;
  const [hoveredRefId, setHoveredRefId] = useState<number | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<"top" | "bottom">("top");
  const [tooltipStyle, setTooltipStyle] = useState<TooltipStyle>({});
  const [isTooltipHovered, setIsTooltipHovered] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTooltipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeTooltip = useCallback(() => {
    if (hideTooltipTimeoutRef.current) clearTimeout(hideTooltipTimeoutRef.current);
    setHoveredRefId(null);
    setHoveredMessageId(null);
    setIsTooltipHovered(false);
  }, []);

  const handleRefEnter = useCallback(() => {
    if (hideTooltipTimeoutRef.current) clearTimeout(hideTooltipTimeoutRef.current);
  }, []);

  const handleRefLeave = useCallback(() => {
    if (hideTooltipTimeoutRef.current) clearTimeout(hideTooltipTimeoutRef.current);
    hideTooltipTimeoutRef.current = setTimeout(() => {
      if (!isTooltipHovered) {
        setHoveredRefId(null);
        setHoveredMessageId(null);
      }
    }, 150);
  }, [isTooltipHovered]);

  const handleRefHover = useCallback(
    (refId: number, messageId: string, event: React.MouseEvent) => {
      handleRefEnter();
      setHoveredRefId(refId);
      setHoveredMessageId(messageId);
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const containerRect = messagesContainerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const position =
        rect.top - containerRect.top > containerRect.bottom - rect.bottom ? "top" : "bottom";
      setTooltipPosition(position);
      const refCenterX = rect.left - containerRect.left + rect.width / 2;
      const refCenterY = rect.top - containerRect.top;
      setTooltipStyle(
        position === "top"
          ? { left: refCenterX, top: refCenterY - 2 }
          : { left: refCenterX, top: refCenterY + rect.height + 2 }
      );
    },
    [handleRefEnter, messagesContainerRef]
  );

  const handleRefClick = useCallback(
    (refId: number, messageId: string, event: React.MouseEvent | React.TouchEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (hideTooltipTimeoutRef.current) clearTimeout(hideTooltipTimeoutRef.current);
      if (hoveredRefId === refId && hoveredMessageId === messageId) {
        setHoveredRefId(null);
        setHoveredMessageId(null);
      } else {
        handleRefHover(refId, messageId, event as React.MouseEvent);
      }
    },
    [hoveredRefId, hoveredMessageId, handleRefHover]
  );

  useEffect(() => {
    if (!hoveredRefId) return;
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (tooltipRef.current?.contains(event.target as Node)) return;
      if ((event.target as HTMLElement)?.closest('span[title^="Reference"]')) return;
      closeTooltip();
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [hoveredRefId, closeTooltip]);

  const tooltipContent = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs
    if (hoveredRefId === null || hoveredMessageId === null || !messagesContainerRef.current)
      return null;
    const hoveredMessage = messages.find((msg) => msg.id === hoveredMessageId);
    const refsArray = Array.isArray(hoveredMessage?.references) ? hoveredMessage.references : [];
    const ref =
      hoveredRefId >= 1 && hoveredRefId <= refsArray.length
        ? refsArray[hoveredRefId - 1]
        : refsArray.find((r) => Number(r.id) === hoveredRefId);

    // eslint-disable-next-line react-hooks/refs
    const containerRect = messagesContainerRef.current.getBoundingClientRect();
    if (!ref || !containerRect) return null;

    const tooltipWidth = 384;
    const rawX = (tooltipStyle.left || 0) + containerRect.left - tooltipWidth / 2;
    const x = Math.max(
      containerRect.left + 16,
      Math.min(rawX, containerRect.right - tooltipWidth - 16)
    );
    const y =
      tooltipPosition === "top"
        ? containerRect.top + (tooltipStyle.top || 0) - 256 - 2
        : containerRect.top + (tooltipStyle.top || 0);

    return { ref, x, y };
  }, [hoveredRefId, hoveredMessageId, messages, tooltipStyle, tooltipPosition, messagesContainerRef]);

  return {
    hoveredRefId,
    hoveredMessageId,
    tooltipPosition,
    tooltipStyle,
    isTooltipHovered,
    setIsTooltipHovered,
    handleRefHover,
    handleRefLeave,
    handleRefClick,
    closeTooltip,
    tooltipRef,
    tooltipContent,
  };
}
