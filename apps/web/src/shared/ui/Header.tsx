
import React, { useState, useRef, useEffect } from 'react';
import { User } from 'lucide-react';
import { useAuth } from '../../features/auth/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { DropdownMenu } from './DropdownMenu';
import { AvatarDropdown } from '../../features/auth/components/AvatarDropdown';
import { LoginModal } from '../../features/auth/components/LoginModal';

interface HeaderProps {
  title: string;
  onRename: (newTitle: string) => void;
  isHome: boolean;
  onLogoClick: () => void;
  onBillingClick?: () => void;
  hasSubscription?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ title, onRename, isHome, onLogoClick, onBillingClick, hasSubscription = false }) => {
  const { user, isAuthenticated, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showLoginModal, setShowLoginModal] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const [inputWidth, setInputWidth] = useState(0);

  // Sync internal state if prop changes
  useEffect(() => {
    setInputValue(title);
  }, [title]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Measure text width for dynamic input sizing
  useEffect(() => {
    if (spanRef.current) {
      setInputWidth(spanRef.current.offsetWidth + 20); // Add some padding
    }
  }, [inputValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setInputValue(title);
      setIsEditing(false);
    }
  };

  const handleSave = () => {
    if (inputValue.trim()) {
      onRename(inputValue.trim());
    } else {
      setInputValue(title);
    }
    setIsEditing(false);
  };

  return (
    <header className="h-14 flex items-center justify-between px-4 border-b-2 border-border bg-background relative z-50 transition-all duration-300">
      
      {/* Hidden span for measuring text width */}
      <span ref={spanRef} className="absolute opacity-0 pointer-events-none text-lg font-sans font-bold whitespace-pre">
        {inputValue || 'Enter title'}
      </span>

      {/* Left Section */}
      <div className="flex items-center gap-4">
        <div 
          onClick={onLogoClick}
          className="flex items-center gap-3 cursor-pointer group"
          title="Go to Home"
        >
          <div className="w-8 h-8 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform overflow-hidden">
            <img 
              src="/SolomindLM_logo.png" 
              alt="SolomindLM Logo" 
              className="w-full h-full object-contain"
              onError={(e) => {
                // Fallback to 'N' if image doesn't exist
                const target = e.target as HTMLImageElement;
                target.style.display = 'none';
                if (target.parentElement) {
                  target.parentElement.textContent = 'N';
                  target.parentElement.className = "w-8 h-8 bg-primary rounded-sm flex items-center justify-center text-primary-foreground font-bold font-serif shadow-sm shrink-0 group-hover:scale-105 transition-transform";
                }
              }}
            />
          </div>
          
          {isHome ? (
            <span className="text-xl font-sans font-bold text-foreground tracking-tight">
              SolomindLM
            </span>
          ) : (
            <>
              <div className="h-4 w-[1px] bg-border mx-1"></div>
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleSave}
                  style={{ width: Math.max(100, inputWidth) }}
                  className="text-lg font-sans font-bold text-foreground bg-transparent border-b border-primary outline-none p-0 tracking-tight"
                />
              ) : (
                <h1 
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsEditing(true);
                  }}
                  className="text-lg font-sans font-bold text-foreground tracking-tight cursor-text hover:text-foreground/80 hover:decoration-dotted hover:underline underline-offset-4 transition-all"
                  title="Rename notebook"
                >
                  {title}
                </h1>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2 sm:gap-4">
        {onBillingClick && !hasSubscription && (
          <button
            onClick={onBillingClick}
            className="px-3 py-1.5 text-sm font-medium bg-primary/10 hover:bg-primary/20 text-primary rounded-md transition-colors"
          >
            Upgrade to Pro
          </button>
        )}
        {onBillingClick && hasSubscription && (
          <button
            onClick={onBillingClick}
            className="px-3 py-1.5 text-sm font-medium bg-success/10 hover:bg-success/20 text-success rounded-md transition-colors"
          >
            Pro
          </button>
        )}
        <DropdownMenu
          trigger={
            <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center hover:ring-2 hover:ring-ring transition-all shrink-0">
              <User className="w-4 h-4 text-secondary-foreground shrink-0" />
            </div>
          }
          align="right"
        >
          <AvatarDropdown
            user={user}
            isAuthenticated={isAuthenticated}
            onLogin={() => setShowLoginModal(true)}
            onLogout={signOut}
            theme={theme}
            toggleTheme={toggleTheme}
          />
        </DropdownMenu>
      </div>

      {/* Login Modal */}
      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} />
      )}
    </header>
  );
};
