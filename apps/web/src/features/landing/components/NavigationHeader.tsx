import { Menu, X } from "lucide-react";
import React, { useEffect, useState } from "react";
import { Button } from "@/shared/components/ui/button";

interface NavigationHeaderProps {
  onGetStarted: () => void;
}

interface NavItem {
  label: string;
  href: string;
}

const navItems: NavItem[] = [
  { label: "Features", href: "#features" },
  { label: "Use Cases", href: "#use-cases" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export const NavigationHeader: React.FC<NavigationHeaderProps> = ({ onGetStarted }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? "bg-background/60 backdrop-blur-xl" : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-8 md:px-12">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo – same size as app Header */}
          <div className="flex items-center gap-3">
            <img
              src="/SolomindLM_logo.png"
              alt="SolomindLM"
              className="w-8 h-8 shrink-0 object-contain"
            />
            <span className="text-xl font-display font-bold text-foreground tracking-tight">
              SolomindLM
            </span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <button
                key={item.href}
                onClick={() => scrollToSection(item.href)}
                className="font-sans text-muted-foreground hover:text-foreground transition-colors text-sm font-medium"
              >
                {item.label}
              </button>
            ))}
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:block">
            <Button
              onClick={onGetStarted}
              className="font-sans bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-semibold px-6 py-2 transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
            >
              Get Started Free
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-foreground hover:opacity-80 transition-opacity"
            aria-label="Toggle menu"
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-4 bg-background/80 backdrop-blur-xl">
            <nav className="flex flex-col gap-1">
              {navItems.map((item) => (
                <button
                  key={item.href}
                  onClick={() => scrollToSection(item.href)}
                  className="font-sans text-left text-foreground hover:text-primary transition-colors text-sm font-medium py-2.5 px-2 rounded-none"
                >
                  {item.label}
                </button>
              ))}
              <Button
                onClick={() => {
                  onGetStarted();
                  setIsMobileMenuOpen(false);
                }}
                className="font-sans bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl font-semibold w-full mt-2 transition-transform duration-200 ease-out hover:scale-[1.02] active:scale-[0.98]"
              >
                Get Started Free
              </Button>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};
