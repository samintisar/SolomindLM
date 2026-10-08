import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/components/ui/sheet";
import { cn } from "@/shared/utils/cn";
import { NAV_ITEMS } from "./landingHomeContent";
import { scrollToSection } from "./scrollToSection";

type NavItem = (typeof NAV_ITEMS)[number];

/** On the home page a nav item scrolls to its section; elsewhere it links to `/#section`, and the home page scrolls to the hash. */
function NavItemButton({
  item,
  onHome,
  onNavigate,
  onLinkClick,
  size,
  className,
}: {
  item: NavItem;
  onHome: boolean;
  onNavigate: (target: string) => void;
  /** Runs when the off-home link is followed (the phone menu closes itself here). */
  onLinkClick?: () => void;
  size?: "sm";
  className?: string;
}) {
  if (onHome) {
    return (
      <Button
        variant="ghost"
        size={size}
        className={className}
        onClick={() => onNavigate(item.target)}
      >
        {item.label}
      </Button>
    );
  }
  return (
    <Button asChild variant="ghost" size={size} className={className}>
      <Link to={`/#${item.target}`} onClick={onLinkClick}>
        {item.label}
      </Link>
    </Button>
  );
}

interface LandingNavProps {
  onGetStarted: () => void;
  onLogin: () => void;
}

export function LandingNav({ onGetStarted, onLogin }: LandingNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const onHome = useLocation().pathname === "/";

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const go = (target: string) => {
    setMenuOpen(false);
    scrollToSection(target);
  };

  return (
    <header
      data-scrolled={scrolled}
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b font-sans transition-colors duration-300",
        scrolled ? "border-border/50 bg-background/85 backdrop-blur-md" : "border-transparent"
      )}
    >
      <div className="mx-auto flex h-18 max-w-300 items-center justify-between gap-4 px-6">
        <Link to="/" className="flex items-center gap-2.5 font-display text-lg font-bold">
          <img src="/SolomindLM_logo.png" alt="" className="size-8 object-contain" />
          {/* Logo only on small phones, so the nav fits beside Get started; still read out. */}
          <span className="max-sm:sr-only">SolomindLM</span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <NavItemButton
              key={item.target}
              item={item}
              onHome={onHome}
              onNavigate={go}
              size="sm"
            />
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" className="hidden md:inline-flex" onClick={onLogin}>
            Log in
          </Button>
          <Button onClick={onGetStarted}>Get started</Button>
          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" theme="light" aria-describedby={undefined}>
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                {NAV_ITEMS.map((item) => (
                  <NavItemButton
                    key={item.target}
                    item={item}
                    onHome={onHome}
                    onNavigate={go}
                    onLinkClick={() => setMenuOpen(false)}
                    className="justify-start"
                  />
                ))}
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    setMenuOpen(false);
                    onLogin();
                  }}
                >
                  Log in
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
