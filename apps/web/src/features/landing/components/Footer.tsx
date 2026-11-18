import React from "react";
import { Twitter } from "lucide-react";
import { Link } from "react-router-dom";

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-background">
      <div className="max-w-[1500px] w-full mx-auto px-6 py-16 md:py-20">
        <div className="grid grid-cols-2 md:grid-cols-12 gap-8 md:gap-6 lg:gap-8 mb-16">
          {/* Brand */}
          <div className="col-span-2 md:col-span-5 lg:col-span-5">
            <div className="text-foreground font-bold text-xl mb-4">SolomindLM</div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-sm">
              Intelligent knowledge management for researchers and learners.
            </p>
            <div className="flex items-center gap-3">
              <a
                href="https://discord.gg/solomindlm"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Discord"
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              >
                <DiscordIcon className="w-4 h-4" />
              </a>
              <a
                href="https://x.com/SolomindLM"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Twitter"
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
              >
                <Twitter className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Company */}
          <div className="md:col-span-2 lg:col-span-2 md:col-start-7">
            <h4 className="font-semibold text-foreground text-sm uppercase tracking-wider mb-4">Company</h4>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  to="/privacy"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  to="/terms"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Terms
                </Link>
              </li>
            </ul>
          </div>

          {/* AI Tools */}
          <div className="md:col-span-3 lg:col-span-3">
            <h4 className="font-semibold text-foreground text-sm uppercase tracking-wider mb-4">AI Tools</h4>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/tools/ai-flashcard-generator"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  AI Flashcard Generator
                </Link>
              </li>
              <li>
                <Link
                  to="/tools/ai-quiz-generator"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  AI Quiz Generator
                </Link>
              </li>
              <li>
                <Link
                  to="/tools/ai-study-guide-creator"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  AI Study Guide Creator
                </Link>
              </li>
              <li>
                <Link
                  to="/tools/pdf-to-study-materials"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  PDF to Study Materials
                </Link>
              </li>
              <li>
                <Link
                  to="/tools/ai-mind-map-generator"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  AI Mind Map Generator
                </Link>
              </li>
            </ul>
          </div>

          {/* Comparisons */}
          <div className="md:col-span-2 lg:col-span-2">
            <h4 className="font-semibold text-foreground text-sm uppercase tracking-wider mb-4">Comparisons</h4>
            <ul className="space-y-3">
              <li>
                <Link
                  to="/vs/notebooklm"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  SolomindLM vs NotebookLM
                </Link>
              </li>
              <li>
                <Link
                  to="/vs/anki"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  SolomindLM vs Anki
                </Link>
              </li>
              <li>
                <Link
                  to="/vs/quizlet"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  SolomindLM vs Quizlet
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-border pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-sm text-muted-foreground">&copy; {currentYear} SolomindLM</div>
          <nav className="flex items-center gap-6">
            <Link
              to="/privacy"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Privacy
            </Link>
            <Link
              to="/terms"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Terms
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};
