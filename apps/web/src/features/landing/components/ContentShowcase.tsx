import { AudioLines, File, FileCode, FileText, Globe, Youtube } from "lucide-react";
import React from "react";
import { LANDING_CONTENT } from "../constants";

export const ContentShowcase: React.FC = () => {
  const getIconForFormat = (iconName: string) => {
    switch (iconName) {
      case "FileText":
        return FileText;
      case "Youtube":
        return Youtube;
      case "Globe":
        return Globe;
      case "AudioLines":
        return AudioLines;
      case "File":
        return File;
      case "FileCode":
        return FileCode;
      default:
        return File;
    }
  };

  return (
    <section className="py-32 md:py-40 px-6">
      <div className="max-w-[1500px] w-full mx-auto">
        {/* Section Header */}
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            {LANDING_CONTENT.contentShowcase.title}
          </h2>
          <p className="text-lg text-muted-foreground">
            {LANDING_CONTENT.contentShowcase.description}
          </p>
        </div>

        {/* Format cards – 3×2 grid of rounded rectangles */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 max-w-3xl mx-auto">
          {LANDING_CONTENT.contentShowcase.formats.map((format) => {
            const Icon = getIconForFormat(format.icon);

            return (
              <div
                key={format.name}
                className="rounded-xl px-4 py-2.5 sm:px-4 sm:py-3 bg-card border border-border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-1.5 min-h-0"
              >
                <Icon className="w-5 h-5 shrink-0 text-primary" />
                <span className="font-medium text-foreground text-center">{format.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
