
import React, { useState, useEffect } from 'react';
import { X, Pencil, FilePlus2, ChevronLeft } from 'lucide-react';

interface ReportFormat {
  id: string;
  title: string;
  description: string;
  hasEdit?: boolean;
  prompt?: string;
}

const FORMATS: ReportFormat[] = [
  {
    id: 'custom',
    title: 'Create Your Own',
    description: 'Craft reports your way by specifying structure, style, tone, and more',
    prompt: ''
  },
  {
    id: 'briefing',
    title: 'Briefing Doc',
    description: 'Overview of your sources featuring key insights and quotes',
    hasEdit: true,
    prompt: `Create a comprehensive briefing document that synthesizes the main themes and ideas from the sources. Start with a concise Executive Summary that presents the most critical takeaways upfront. The body of the document must provide a detailed and thorough examination of the main themes, evidence, and conclusions found in the sources. This analysis should be structured logically with headings and bullet points to ensure clarity. The tone must be objective and incisive.

## Executive Summary
[Concise overview of the most critical takeaways]

## Main Themes
[Detailed examination of core themes found in the sources]

## Key Findings and Evidence
[Organized insights with supporting data, quotes, or examples]

## Conclusions
[Significant outcomes and implications]

## Recommendations
[Action items based on findings]`
  },
  {
    id: 'study_guide',
    title: 'Study Guide',
    description: 'Short-answer quiz, suggested essay questions, and glossary of key terms',
    hasEdit: true,
    prompt: `You are a highly capable research assistant and tutor. Create a detailed study guide designed to review understanding of the sources. Create a quiz with ten short-answer questions (2-3 sentences each) and include a separate answer key. Suggest five essay format questions, but do not supply answers. Also conclude with a comprehensive glossary of key terms with definitions.

## Learning Objectives
[What students should be able to do after studying]

## Study Notes
[Organized summary of main topics and concepts]

## Quiz Questions
[10 short-answer questions (2-3 sentences each)]

## Answer Key
[Answers to the quiz questions]

## Essay Questions
[5 essay prompts for deeper exploration - no answers provided]

## Glossary
[Comprehensive list of key terms with definitions]`
  },
  {
    id: 'blog_post',
    title: 'Blog Post',
    description: 'Insightful takeaways distilled into a highly readable article',
    hasEdit: true,
    prompt: `Act as a thoughtful writer and synthesizer of ideas, tasked with creating an engaging and readable blog post for a popular online publishing platform known for its clean aesthetic and insightful content. Your goal is to distill the top most surprising, counter-intuitive, or impactful takeaways from the provided source materials into a compelling listicle. The writing style should be clean, accessible, and highly scannable, employing a conversational yet intelligent tone. Craft a compelling, click-worthy headline. Begin the article with a short introduction that hooks the reader by establishing a relatable problem or curiosity, then present each of the takeaway points as a distinct section with a clear, bolded subheading. Within each section, use short paragraphs to explain the concept clearly, and don't just summarize; offer a brief analysis or a reflection on why this point is so interesting or important, and if a powerful quote exists in the sources, feature it in a blockquote for emphasis. Conclude the post with a brief, forward-looking summary that leaves the reader with a final thought-provoking question or a powerful takeaway to ponder.`
  },
];

const SUGGESTED_FORMATS: ReportFormat[] = [
  {
    id: 'summary',
    title: 'Summary',
    description: 'A concise synthesis of the essential information from your sources.',
    hasEdit: true,
    prompt: `Create a comprehensive yet concise summary that synthesizes the essential information from the sources. Begin with an overview that captures the core subject and purpose. The body should systematically present the main arguments, key evidence supporting those arguments, and important conclusions. Maintain a neutral, objective tone while ensuring all significant points are covered. Use clear headings and bullet points to enhance readability.

## Overview
[Brief introduction to the subject and purpose of the sources]

## Main Arguments
[Core claims and positions presented in the sources]

## Key Evidence
[Supporting data, examples, and evidence]

## Conclusions
[Significant findings, outcomes, and implications]`
  },
  {
    id: 'technical_report',
    title: 'Technical Report',
    description: 'Detailed technical documentation with specifications, methodologies, data analysis, and findings.',
    hasEdit: true,
    prompt: `Create a detailed technical report that thoroughly documents the technical aspects of the subject matter. Begin with an executive summary of technical findings. The body should include comprehensive sections on technical specifications, methodologies employed, data and metrics analysis, and detailed findings. Use precise technical language and include specific parameters, configurations, and quantitative measurements where applicable. The report should be structured for technical professionals who require in-depth information.

## Executive Summary
[Concise overview of technical findings]

## Technical Specifications
[Detailed parameters, configurations, and requirements]

## Methodologies
[Approaches, algorithms, or frameworks used]

## Data and Metrics
[Quantitative information and measurements]

## Analysis
[Detailed examination of technical data]

## Findings and Conclusions
[Technical conclusions and recommendations]`
  },
  {
    id: 'concept_explainer',
    title: 'Concept Explainer',
    description: 'Accessible explanations of core concepts with definitions, examples, and relationship mapping.',
    hasEdit: true,
    prompt: `Create an accessible and comprehensive explanation of the core concepts found in the sources. Begin with an introduction that explains why these concepts matter and who they are relevant for. For each concept, provide a clear definition, explain how it relates to other concepts, give concrete examples or analogies to aid understanding, and address common misconceptions. Use clear, jargon-free language that makes complex ideas understandable to a non-expert audience. Organize the content logically with concepts building upon each other.

## Introduction
[Why these concepts matter and who they are for]

## Core Concepts
[For each concept include:]
### [Concept Name]
- **Definition**: [Clear, concise explanation]
- **How It Relates**: [Connections to other concepts]
- **Examples**: [Concrete instances or analogies]
- **Common Misconceptions**: [What people often get wrong]

## Key Relationships
[How concepts interact and connect]

## Summary
[Quick reference of the most important points]`
  },
  {
    id: 'methodology_overview',
    title: 'Methodology Overview',
    description: 'Comprehensive documentation of research methods, frameworks, data collection, and analysis approaches.',
    hasEdit: true,
    prompt: `Create a comprehensive overview of the methodological approaches found in the sources. Begin with an introduction that explains the purpose and scope of the methodologies covered. Systematically document the research methods, frameworks applied, data collection techniques, and analysis approaches used. For each method, explain its purpose, how it was implemented, and what it was designed to achieve. Use clear headings and structured formatting to make the information easily accessible to researchers or practitioners who may need to understand or apply these methods.

## Introduction
[Purpose and scope of the methodologies]

## Research Methods
[Detailed description of approaches and techniques used]

## Frameworks Applied
[Theoretical or practical models and their applications]

## Data Collection
[How information was gathered, including tools and processes]

## Analysis Approaches
[How data was processed, analyzed, and interpreted]

## Methodological Considerations
[Strengths, limitations, and best practices]`
  },
];

const ALL_FORMATS = [...FORMATS, ...SUGGESTED_FORMATS];

export const CreateReportModal: React.FC<CreateReportModalProps> = ({ isOpen, onClose, onSelectFormat }) => {
  const [configuringFormat, setConfiguringFormat] = useState<ReportFormat | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');

  useEffect(() => {
    if (!isOpen) {
      setConfiguringFormat(null);
      setCustomPrompt('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFormatClick = (format: ReportFormat) => {
    if (format.id === 'custom') {
      setConfiguringFormat(format);
      setCustomPrompt('');
    } else {
      onSelectFormat(format.id);
    }
  };

  const handleEditClick = (e: React.MouseEvent, format: ReportFormat) => {
    e.stopPropagation();
    setConfiguringFormat(format);
    setCustomPrompt(format.prompt || '');
  };

  const handleGenerate = () => {
    if (configuringFormat) {
      onSelectFormat(configuringFormat.id, customPrompt);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200">
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
            <FilePlus2 className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold font-sans">Create report</h2>
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
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70 font-sans">Describe the report you want to create</h3>
              <textarea 
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Tell SolomindLM how to structure and write your report..."
                className="w-full h-56 bg-background border border-border rounded-lg p-6 text-base font-serif leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring transition-all resize-none placeholder:text-muted-foreground/40"
              />
            </div>

            <div className="flex justify-end pt-4">
              <button 
                onClick={handleGenerate} 
                className="px-8 py-3 bg-primary text-primary-foreground hover:bg-primary/90 font-bold rounded-full transition-all shadow-md active:scale-95 text-sm"
              >
                Generate Report
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-10 bg-card/50 animate-in slide-in-from-left-4 duration-300">
            <div className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground/70 font-sans">Format</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {ALL_FORMATS.map((format) => (
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

const FormatCard: React.FC<{ format: ReportFormat; onClick: () => void; onEditClick: (e: React.MouseEvent) => void; }> = ({ format, onClick, onEditClick }) => (
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

interface CreateReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFormat: (formatId: string, customPrompt?: string) => void;
}
