import React, { ReactElement, ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPosition } from "./anchoredPosition";

interface DropdownMenuProps {
  trigger: ReactElement<any>;
  children: ReactNode;
  align?: "left" | "right";
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  children,
  align = "right",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuStyle = useAnchoredPosition(containerRef, menuRef, isOpen, {
    side: "bottom",
    align: align === "left" ? "start" : "end",
  });

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  // Toggle dropdown when trigger is clicked
  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  // Native <button> triggers already get Enter/Space-as-click for free from the
  // browser; a non-button trigger (e.g. a styled <div>) needs role/tabIndex to be
  // reachable by keyboard at all, and its own Enter/Space handling since there's
  // no native activation behavior to rely on.
  const isNativeButton = trigger.type === "button";

  const handleTriggerKeyDown = (e: React.KeyboardEvent) => {
    trigger.props.onKeyDown?.(e);
    if (isNativeButton || e.defaultPrevented) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    }
  };

  // Clone trigger and add onClick handler
  const triggerWithProps = React.cloneElement(trigger, {
    onClick: handleTriggerClick,
    onKeyDown: handleTriggerKeyDown,
    "aria-haspopup": "menu",
    "aria-expanded": isOpen,
    ...(isNativeButton
      ? {}
      : {
          role: trigger.props.role ?? "button",
          tabIndex: trigger.props.tabIndex ?? 0,
        }),
  });

  const menu = isOpen ? (
    <div
      ref={menuRef}
      role="menu"
      style={menuStyle}
      className="fixed z-200 min-w-[200px] max-h-(--anchored-max-height) overflow-y-auto bg-card border border-border rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2 duration-200"
      onClick={(e) => {
        const menuItem = (e.target as HTMLElement).closest<HTMLElement>('[role="menuitem"]');
        const opensSubmenu =
          menuItem?.hasAttribute("aria-haspopup") &&
          menuItem.getAttribute("aria-haspopup") !== "false";

        if (menuItem && !opensSubmenu) {
          setIsOpen(false);
        }
      }}
    >
      {children}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className="relative">
      {triggerWithProps}
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </div>
  );
};
