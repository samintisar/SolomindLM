import React, {
  ReactElement,
  ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

interface DropdownMenuProps {
  trigger: ReactElement<any>;
  children: ReactNode;
  align?: "left" | "right";
}

type MenuPosition =
  | { top: number; left: number; right?: undefined }
  | { top: number; right: number; left?: undefined };

function getMenuPosition(trigger: HTMLElement, align: "left" | "right"): MenuPosition {
  const rect = trigger.getBoundingClientRect();
  const gap = 8;

  if (align === "right") {
    return {
      top: rect.bottom + gap,
      right: window.innerWidth - rect.right,
    };
  }

  return {
    top: rect.bottom + gap,
    left: rect.left,
  };
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  children,
  align = "right",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = () => {
    if (!containerRef.current) return;
    setMenuPosition(getMenuPosition(containerRef.current, align));
  };

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return;
    }

    updateMenuPosition();

    const handleReposition = () => updateMenuPosition();
    window.addEventListener("resize", handleReposition);
    window.addEventListener("scroll", handleReposition, true);

    return () => {
      window.removeEventListener("resize", handleReposition);
      window.removeEventListener("scroll", handleReposition, true);
    };
  }, [isOpen, align]);

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

  // Clone trigger and add onClick handler
  const triggerWithProps = React.cloneElement(trigger, {
    onClick: handleTriggerClick,
    "aria-haspopup": "menu",
    "aria-expanded": isOpen,
  });

  const menu =
    isOpen && menuPosition ? (
      <div
        ref={menuRef}
        role="menu"
        style={
          menuPosition.right != null
            ? { top: menuPosition.top, right: menuPosition.right }
            : { top: menuPosition.top, left: menuPosition.left }
        }
        className="fixed z-200 min-w-[200px] bg-card border border-border rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2 duration-200"
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
