import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  ReactNode,
  ReactElement,
  CSSProperties,
} from "react";
import { createPortal } from "react-dom";

interface DropdownMenuProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  trigger: ReactElement<any>;
  children: ReactNode;
  align?: "left" | "right";
}

const MENU_GAP_PX = 8;

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  trigger,
  children,
  align = "right",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);

  const updateMenuPosition = () => {
    if (!triggerRef.current) {
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    if (align === "left") {
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + MENU_GAP_PX,
        left: rect.left,
        minWidth: 200,
      });
    } else {
      setMenuStyle({
        position: "fixed",
        top: rect.bottom + MENU_GAP_PX,
        right: window.innerWidth - rect.right,
        minWidth: 200,
      });
    }
  };

  // Portal + fixed positioning so menus aren't clipped by overflow-hidden ancestors
  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuStyle(null);
      return;
    }
    updateMenuPosition();
    window.addEventListener("scroll", updateMenuPosition, true);
    window.addEventListener("resize", updateMenuPosition);
    return () => {
      window.removeEventListener("scroll", updateMenuPosition, true);
      window.removeEventListener("resize", updateMenuPosition);
    };
  }, [isOpen, align]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
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
    isOpen && menuStyle ? (
      <div
        ref={menuRef}
        role="menu"
        style={menuStyle}
        className="z-200 min-w-[200px] bg-card border border-border rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2 duration-200"
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
    <>
      <div ref={triggerRef} className="relative inline-flex">
        {triggerWithProps}
      </div>
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
};
