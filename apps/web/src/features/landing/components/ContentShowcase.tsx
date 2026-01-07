import React from 'react';
import { FileText, Youtube, Globe, AudioLines, File, FileCode } from 'lucide-react';
import { LANDING_CONTENT } from '../constants';

export const ContentShowcase: React.FC = () => {
  const getIconForFormat = (iconName: string) => {
    switch (iconName) {
      case 'FileText': return FileText;
      case 'Youtube': return Youtube;
      case 'Globe': return Globe;
      case 'AudioLines': return AudioLines;
      case 'File': return File;
      case 'FileCode': return FileCode;
      default: return File;
    }
  };

  return (
    <section className="py-20 px-6 bg-background">
      <div className="max-w-4xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-sans font-bold text-foreground mb-4">
            {LANDING_CONTENT.contentShowcase.title}
          </h2>
          <p className="text-lg text-muted-foreground">
            {LANDING_CONTENT.contentShowcase.description}
          </p>
        </div>

        {/* Format Pills */}
        <div className="flex flex-wrap gap-4 justify-center">
          {LANDING_CONTENT.contentShowcase.formats.map((format) => {
            const Icon = getIconForFormat(format.icon);

            return (
              <div
                key={format.name}
                className="px-6 py-3 rounded-full bg-card border border-border shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-2"
              >
                <Icon className="w-5 h-5 text-primary" />
                <span className="font-medium text-foreground">{format.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
