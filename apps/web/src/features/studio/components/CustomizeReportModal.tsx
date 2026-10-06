import type React from "react";
import type { StudioDialogTheme } from "./customize/dialogTheme";
import { type PromptFormat, PromptFormatPicker } from "./customize/PromptFormatPicker";
import { StudioCustomizeDialog } from "./customize/StudioCustomizeDialog";

const CUSTOM_FORMAT: PromptFormat<string> = {
  id: "custom",
  title: "Create Your Own",
  description: "Craft reports your way by specifying structure, style, tone, and more",
  prompt: "",
};

const FORMATS: PromptFormat<string>[] = [
  CUSTOM_FORMAT,
  {
    id: "briefing",
    title: "Briefing Doc",
    description: "Overview of your sources featuring key insights and quotes",
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
[Action items based on findings]`,
  },
  {
    id: "study_guide",
    title: "Study Guide",
    description: "Short-answer quiz, suggested essay questions, and glossary of key terms",
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
[Comprehensive list of key terms with definitions]`,
  },
  {
    id: "blog_post",
    title: "Blog Post",
    description: "Insightful takeaways distilled into a highly readable article",
    prompt: `Act as a thoughtful writer and synthesizer of ideas, tasked with creating an engaging and readable blog post for a popular online publishing platform known for its clean aesthetic and insightful content. Your goal is to distill the top most surprising, counter-intuitive, or impactful takeaways from the provided source materials into a compelling listicle. The writing style should be clean, accessible, and highly scannable, employing a conversational yet intelligent tone. Craft a compelling, click-worthy headline. Begin the article with a short introduction that hooks the reader by establishing a relatable problem or curiosity, then present each of the takeaway points as a distinct section with a clear, bolded subheading. Within each section, use short paragraphs to explain the concept clearly, and don't just summarize; offer a brief analysis or a reflection on why this point is so interesting or important, and if a powerful quote exists in the sources, feature it in a blockquote for emphasis. Conclude the post with a brief, forward-looking summary that leaves the reader with a final thought-provoking question or a powerful takeaway to ponder.`,
  },
];

const SUGGESTED_FORMATS: PromptFormat<string>[] = [
  {
    id: "summary",
    title: "Summary",
    description: "A concise synthesis of the essential information from your sources.",
    prompt: `Create a comprehensive yet concise summary that synthesizes the essential information from the sources. Begin with an overview that captures the core subject and purpose. The body should systematically present the main arguments, key evidence supporting those arguments, and important conclusions. Maintain a neutral, objective tone while ensuring all significant points are covered. Use clear headings and bullet points to enhance readability.

## Overview
[Brief introduction to the subject and purpose of the sources]

## Main Arguments
[Core claims and positions presented in the sources]

## Key Evidence
[Supporting data, examples, and evidence]

## Conclusions
[Significant findings, outcomes, and implications]`,
  },
  {
    id: "technical_report",
    title: "Technical Report",
    description:
      "Detailed technical documentation with specifications, methodologies, data analysis, and findings.",
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
[Technical conclusions and recommendations]`,
  },
  {
    id: "concept_explainer",
    title: "Concept Explainer",
    description:
      "Accessible explanations of core concepts with definitions, examples, and relationship mapping.",
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
[Quick reference of the most important points]`,
  },
  {
    id: "methodology_overview",
    title: "Methodology Overview",
    description:
      "Comprehensive documentation of research methods, frameworks, data collection, and analysis approaches.",
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
[Strengths, limitations, and best practices]`,
  },
];

const ALL_FORMATS = [...FORMATS, ...SUGGESTED_FORMATS];

export const CustomizeReportModal: React.FC<CustomizeReportModalProps> = ({
  isOpen,
  onClose,
  onSelectFormat,
  embedded = false,
  theme,
  preview = false,
}) => (
  <StudioCustomizeDialog
    open={isOpen}
    onClose={onClose}
    embedded={embedded}
    theme={theme}
    preview={preview}
    wide
  >
    <PromptFormatPicker
      kind="report"
      title="Create report"
      description="Pick a format, or write your own instructions."
      studioTool="report"
      formats={ALL_FORMATS}
      customFormat={CUSTOM_FORMAT}
      onPick={(format) => onSelectFormat(format.id)}
      onGenerate={(formatId, prompt) => onSelectFormat(formatId, prompt)}
      promptLabel="Describe the report you want to create"
      promptPlaceholder="Tell SolomindLM how to structure and write your report..."
      generateLabel="Generate Report"
      columns={4}
    />
  </StudioCustomizeDialog>
);

interface CustomizeReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectFormat: (formatId: string, customPrompt?: string) => void;
  /** When true, opens inside a positioned parent (the marketing hero preview) instead of the viewport. */
  embedded?: boolean;
  /** Pins light-theme tokens on always-light pages (the auth page). */
  theme?: StudioDialogTheme;
  /** A marketing mock-up (landing, sign-in): hides Discover Prompts and Save as reusable prompt. */
  preview?: boolean;
}
