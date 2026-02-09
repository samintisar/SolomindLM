import React, { useState, useRef, useEffect, ReactNode, ReactElement } from 'react';

interface DropdownMenuProps {
  trigger: ReactElement<any>;
  children: ReactNode;
  align?: 'left' | 'right';
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({ trigger, children, align = 'right' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  // Toggle dropdown when trigger is clicked
  const handleTriggerClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  const alignClass = align === 'left' ? 'left-0' : 'right-0';

  // Clone trigger and add onClick handler
  const triggerWithProps = React.cloneElement(trigger, {
    onClick: handleTriggerClick,
    'aria-haspopup': 'menu',
    'aria-expanded': isOpen,
  });

  return (
    <div ref={containerRef} className="relative">
      {triggerWithProps}
      {isOpen && (
        <div
          role="menu"
          className={`absolute top-full mt-2 ${alignClass} z-200 min-w-[200px] bg-card border border-border rounded-lg shadow-lg animate-in fade-in slide-in-from-top-2 duration-200`}
          onClick={(e) => {
            if ((e.target as HTMLElement).closest('[role="menuitem"]')) {
              setIsOpen(false);
            }
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
};
