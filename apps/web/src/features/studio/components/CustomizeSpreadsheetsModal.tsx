
import React, { useState, useEffect } from 'react';
import { X, Pencil, Table2, ChevronLeft } from 'lucide-react';

interface CustomizeSpreadsheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (config: SpreadsheetConfig) => void;
}

export interface SpreadsheetConfig {
  spreadsheetType: 'data_extraction' | 'comparison_table' | 'timeline' | 'financial_summary' | 'custom';
  customPrompt: string;
}

interface SpreadsheetFormat {
  id: SpreadsheetConfig['spreadsheetType'];
  title: string;
  description: string;
  hasEdit?: boolean;
  prompt?: string;
}

// Helper function to clean backend prompts for UI display
// Removes "Text:\n{chunk}\n\n" and final labels like "CONCEPT EXTRACTION:"
function cleanPromptForDisplay(prompt: string): string {
  return prompt
    .replace(/\nText:\s*\n\{chunk\}\s*\n\n/g, '') // Remove "Text:\n{chunk}\n\n"
    .replace(/\n\{chunk\}\s*\n\n/g, '') // Also handle case without "Text:"
    .replace(/\n(CONCEPT EXTRACTION|ITEM DETAILS|EVENT LOG|FINANCIAL NOTES|RESEARCH NOTES):\s*$/g, '') // Remove final labels
    .trim();
}

const SPREADSHEET_FORMATS: SpreadsheetFormat[] = [
  {
    id: 'custom',
    title: 'Create Your Own',
    description: 'Create a custom spreadsheet based on your specific requirements and instructions.',
    prompt: ''
  },
  {
    id: 'data_extraction',
    title: 'Data Table',
    description: 'Extract and organize key data points, facts, and figures from your sources into a structured table.',
    hasEdit: true,
    prompt: cleanPromptForDisplay(`Analyze this text and identify the distinct **Concepts** or **Methods** discussed.

GOAL: Summarize the *types* of things found, not every single instance.
- Identify the distinct concepts (e.g., specific Methods, Theories, or Approaches).
- For each concept, extract its general definition and key characteristics.
- If multiple specific examples or datasets are mentioned for one concept, **list them together** under that concept name. 
- Do not create separate entries for every example; group them by the concept they illustrate.

Text:
{chunk}

CONCEPT EXTRACTION:`)
  },
  {
    id: 'comparison_table',
    title: 'Comparison',
    description: 'Compare and contrast different concepts, products, or ideas across multiple dimensions.',
    hasEdit: true,
    prompt: cleanPromptForDisplay(`Analyze this text to identify the specific **Items** or **Products** being compared.

GOAL: Group details by Item/Product.
- Identify the unique items being discussed.
- Under each item, list every feature, spec, pro, and con mentioned.
- If a specific metric is mentioned, record the exact number.

Text:
{chunk}

ITEM DETAILS:`)
  },
  {
    id: 'timeline',
    title: 'Timeline',
    description: 'Organize events, milestones, or developments in chronological order with key details.',
    hasEdit: true,
    prompt: cleanPromptForDisplay(`Analyze this text to identify distinct **Time Periods** or **Major Events**.

GOAL: Extract a chronological flow.
- Identify specific dates or time periods.
- For each date, describe the main event.
- If multiple minor details relate to one main event, group them under that event.

Text:
{chunk}

EVENT LOG:`)
  },
  {
    id: 'financial_summary',
    title: 'Financial',
    description: 'Extract and organize financial data, metrics, and figures into a summary table.',
    hasEdit: true,
    prompt: cleanPromptForDisplay(`Analyze this text to identify distinct **Financial Categories** or **Accounts**.

GOAL: Group figures by Category.
- Identify categories (e.g., broad revenue streams or expense types).
- List the specific amounts and dates associated with each category.
- Keep the raw numbers accurate.

Text:
{chunk}

FINANCIAL NOTES:`)
  },
];

export const CustomizeSpreadsheetsModal: React.FC<CustomizeSpreadsheetsModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
}) => {
  const [configuringFormat, setConfiguringFormat] = useState<SpreadsheetFormat | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setConfiguringFormat(null);
      setCustomPrompt('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFormatClick = (format: SpreadsheetFormat) => {
    if (format.id === 'custom') {
      setConfiguringFormat(format);
      setCustomPrompt('');
    } else {
      onGenerate({ spreadsheetType: format.id, customPrompt: format.prompt || '' });
    }
  };

  const handleEditClick = (e: React.MouseEvent, format: SpreadsheetFormat) => {
    e.stopPropagation();
    setConfiguringFormat(format);
    setCustomPrompt(format.prompt || '');
  };

  const handleGenerate = () => {
    if (configuringFormat) {
      onGenerate({ spreadsheetType: configuringFormat.id, customPrompt });
    }
  };

  return (
    <div className="fixed inset-0 z-110 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-5xl bg-card text-card-foreground rounded-xl shadow-2xl border border-border flex flex-col max-h-[90vh] overflow-hidden font-sans">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border/50 bg-card">
          <div className="flex items-center gap-3">
            {configuringFormat && (
              <button onClick={() => setConfiguringFormat(null)} className="p-2 hover:bg-secondary/50 rounded-full transition-colors -ml-2">
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <Table2 className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold font-sans">Create spreadsheet</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary/50 rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {configuringFormat ? (
          <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 bg-card/50 animate-in slide-in-from-right-4 duration-300">
            <div className="p-6 rounded-xl bg-secondary/20 border border-border">
              <h4 className="text-lg font-bold mb-2 font-serif">{configuringFormat.title}</h4>
              <p className="text-sm text-muted-foreground font-serif leading-relaxed">{configuringFormat.description}</p>
            </div>

            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70 font-sans">Describe the spreadsheet you want to create</h3>
              <textarea
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Tell SolomindLM how to structure and organize your spreadsheet..."
                className="w-full h-56 bg-background border border-border rounded-lg p-6 text-base font-serif leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring transition-all resize-none placeholder:text-muted-foreground/40"
              />
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={handleGenerate}
                className="px-8 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-bold rounded-full transition-all shadow-md active:scale-95 text-sm"
              >
                Generate Spreadsheet
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-10 bg-card/50 animate-in slide-in-from-left-4 duration-300">
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70 font-sans">Format</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {SPREADSHEET_FORMATS.map((format) => (
                  <FormatCard key={format.id} format={format} onClick={() => handleFormatClick(format)} onEditClick={(e) => handleEditClick(e, format)} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const FormatCard: React.FC<{ format: SpreadsheetFormat; onClick: () => void; onEditClick: (e: React.MouseEvent) => void; }> = ({ format, onClick, onEditClick }) => (
  <div onClick={onClick} className="group relative flex flex-col p-5 rounded-xl bg-card border border-border/50 hover:border-primary/40 hover:bg-secondary/30 transition-all cursor-pointer h-48 shadow-sm hover:shadow-md">
    {format.hasEdit && (
      <button onClick={onEditClick} className="absolute top-3 right-3 p-1.5 rounded-full bg-background border border-border text-muted-foreground hover:text-primary transition-colors z-10">
        <Pencil className="w-3 h-3" />
      </button>
    )}
    <h4 className="text-md font-bold mb-2 font-serif pr-6 group-hover:text-primary transition-colors">{format.title}</h4>
    <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-4 font-serif">
      {format.description}
    </p>
  </div>
);
