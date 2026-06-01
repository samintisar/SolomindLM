import { Globe } from "lucide-react";
import React from "react";
import { NotebookItem } from "@/shared/types/index";
import { ListHeader } from "../ListHeader";

interface FeaturedSectionProps {
  featuredNotebooks: NotebookItem[];
  viewMode: "grid" | "list";
  onSelectNotebook: (notebook: NotebookItem) => void;
}

export const FeaturedSection: React.FC<FeaturedSectionProps> = ({
  featuredNotebooks,
  viewMode,
  onSelectNotebook,
}) => {
  if (featuredNotebooks.length === 0) return null;

  return (
    <section className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-display font-bold text-foreground">Featured notebooks</h2>
      </div>

      {viewMode === "grid" ? (
        /* FEATURED GRID */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuredNotebooks.map((nb) => (
            <div
              key={nb.id}
              onClick={() => onSelectNotebook(nb)}
              className="group relative aspect-16/10 rounded-2xl overflow-hidden cursor-pointer shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ring-1 ring-border/50"
            >
              {/* Background Image/Color */}
              <div className={`absolute inset-0 ${nb.coverColor} transition-opacity`}>
                <div
                  className="absolute inset-0 opacity-30 mix-blend-multiply"
                  style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
                  }}
                />
                <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/20 to-transparent" />
              </div>

              <div className="absolute inset-0 p-6 flex flex-col justify-end text-white z-10">
                <div className="flex items-center gap-2 mb-3 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                  <div className="w-6 h-6 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-xs font-bold uppercase ring-1 ring-white/30">
                    {nb.author?.charAt(0)}
                  </div>
                  <span className="text-xs font-medium text-white/90 truncate drop-shadow-sm">
                    {nb.author}
                  </span>
                </div>
                <h3 className="text-lg font-bold leading-tight mb-3 drop-shadow-md line-clamp-2 font-sans tracking-tight">
                  {nb.title}
                </h3>
                <div className="flex items-center gap-3 text-sm font-medium text-white/80 uppercase tracking-wide">
                  <div className="flex items-center gap-1.5">
                    <Globe className="w-3 h-3 shrink-0" />
                    <span>{nb.sourceCount} sources</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* FEATURED LIST */
        <div className="flex flex-col gap-3">
          <ListHeader />
          {featuredNotebooks.map((nb) => (
            <div
              key={nb.id}
              onClick={() => onSelectNotebook(nb)}
              className="group grid grid-cols-[1fr_auto_40px] items-center gap-6 p-4 rounded-xl bg-card border border-border shadow-sm hover:shadow-md hover:border-primary/20 cursor-pointer transition-all"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className={`w-10 h-10 rounded-lg ${nb.coverColor} bg-opacity-[3%] flex items-center justify-center shrink-0`}
                >
                  <Globe
                    className={`w-5 h-5 ${(nb.coverColor || "").replace("bg-", "text-")} opacity-50 shrink-0`}
                  />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="font-bold text-foreground font-serif truncate">{nb.title}</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide truncate">
                    {nb.author}
                  </span>
                </div>
              </div>
              <div className="w-20 flex justify-end">
                <div className="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-md text-xs font-medium text-muted-foreground">
                  <Globe className="w-3 h-3 shrink-0" />
                  <span>{nb.sourceCount}</span>
                </div>
              </div>
              <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-2 hover:bg-secondary rounded-xl text-muted-foreground hover:text-foreground transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="12" cy="5" r="1" />
                    <circle cx="12" cy="19" r="1" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
};
