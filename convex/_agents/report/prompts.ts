"use node";
import { MARKDOWN_MATH_NOTATION_FOR_APP } from "../_shared/markdownMathPrompt.js";

/**
 * Prompt templates for ReportGraph.
 *
 * Updated for SolomindLM to include:
 * 1. "Key Quotes" extraction (for citations)
 * 2. "All Topics" coverage (preventing data loss)
 * 3. Deeper analysis sections (Critical Analysis, Glossaries)
 */

// ============================================================
// SYSTEM PROMPTS
// ============================================================

/** System prompt for map phase content analysis and topic extraction */
export const MAP_SYSTEM_PROMPT = `You are a professional content analyzer and writer. Always extract 3-5 key topics and provide comprehensive summaries.

CRITICAL OUTPUT FORMAT: You MUST output your summaries in MARKDOWN text format, NOT JSON. Use markdown headers, bullet points, and standard formatting. Do NOT output JSON objects or arrays.

${MARKDOWN_MATH_NOTATION_FOR_APP}`;

/**
 * Map phase when using structured output (JSON schema / withStructuredOutput).
 * Wire format is JSON; markdown lives inside the `summary` string field.
 */
export const MAP_STRUCTURED_SYSTEM_PROMPT = `You are a professional content analyzer and writer. Always extract 3-5 key topics and provide comprehensive summaries.

CRITICAL OUTPUT FORMAT: Respond only with a JSON object matching the required schema. Do not output raw markdown outside JSON.
- "topics": array of 3-5 key topic strings
- "summary": the full section summary as markdown text (headers, bullet points, formatting) inside this string field

${MARKDOWN_MATH_NOTATION_FOR_APP}`;

/** System prompt for collapse phase summary condensation */
export const COLLAPSE_SYSTEM_PROMPT = `You are a skilled summarizer. Always maintain structured format with topic headers like "Main Topics:". CRITICAL: You MUST output MARKDOWN text format, NOT JSON. Use markdown headers and bullet points, not JSON objects or arrays.

${MARKDOWN_MATH_NOTATION_FOR_APP}`;

/** System prompt for reduce phase final report generation */
export const REDUCE_SYSTEM_PROMPT = `You are a professional content writer and editor. 

CRITICAL OUTPUT FORMAT REQUIREMENTS:
- You MUST output content in MARKDOWN format, NOT JSON
- Use Markdown headers (##, ###) for sections
- Use Markdown bullet points and lists
- Use Markdown bold (**text**) for emphasis
- Do NOT use JSON objects, arrays, or key-value pairs
- Your output should be readable Markdown text that can be directly rendered

The user wants a nicely formatted document they can read, not raw JSON data.

${MARKDOWN_MATH_NOTATION_FOR_APP}`;

// ============================================================
// MAP PROMPTS
// ============================================================

export const MAP_PROMPTS: Record<string, string> = {
  briefing: `Analyze this section deeply. Extract key insights, main themes, evidence, and verbatim quotes.

{chunk}

Format your response as:
- Main Topics: [List ALL distinct topics discussed in this section - do not limit to top 3]
- Key Insights: [Bulleted list of critical takeaways]
- Key Quotes: [Extract 3-5 direct verbatim quotes that support the insights, for citation purposes]
- Main Themes: [Core topics and patterns]
- Supporting Evidence: [Data, statistics, or specific examples that back up claims]
- Action Items: [Specific next steps or recommendations]

INSIGHTS:`,

  study_guide: `Extract learning content from this section.

{chunk}

Format your response as:
- Main Topics: [List ALL distinct topics discussed in this section - do not limit to top 3]
- Learning Objectives: [What students should be able to do or understand]
- Key Concepts: [Definitions of core ideas with brief explanations]
- Key Quotes: [Extract 3-5 direct verbatim quotes that define concepts or summarize key points]
- Important Terms: [Vocabulary words with brief definitions]
- Potential Quiz Questions: [Short-answer questions based on this section]

CONCEPTS:`,

  blog_post: `Extract engaging content for a blog post from this section.

{chunk}

Format your response as:
- Main Topics: [List ALL distinct topics discussed in this section - do not limit to top 3]
- Surprising Takeaways: [Counter-intuitive, novel, or unexpected points]
- Impactful Insights: [Ideas that would resonate emotionally or intellectually with readers]
- Notable Quotes: [Powerful, punchy verbatim quotes worth featuring as blockquotes]
- Actionable Advice: [Practical tips readers can apply immediately]

CONTENT:`,

  summary: `Extract the essential information from this section.

{chunk}

Format your response as:
- Main Topics: [List ALL distinct topics discussed in this section - do not limit to top 3]
- Main Arguments: [Core claims and positions presented]
- Key Evidence: [Supporting data, studies, and examples]
- Key Quotes: [Extract 3-5 direct verbatim quotes that represent the core arguments]
- Important Conclusions: [Significant findings or outcomes]
- Context: [Relevant background information needed to understand the text]

SUMMARY:`,

  technical_report: `Extract technical details and specifications from this section.

{chunk}

Format your response as:
- Main Topics: [List ALL distinct topics discussed in this section - do not limit to top 3]
- Technical Specifications: [Specific parameters, configurations, versions, or requirements]
- Methodologies: [Approaches, algorithms, protocols, or frameworks used]
- Data and Metrics: [Exact quantitative information, measurements, and benchmarks]
- Key Quotes: [Extract direct verbatim quotes describing specifications or findings]
- Findings: [Technical conclusions and observations]

TECHNICAL:`,

  concept_explainer: `Identify concepts, definitions, and relationships from this section.

{chunk}

Format your response as:
- Main Topics: [List ALL distinct topics discussed in this section - do not limit to top 3]
- Core Concepts: [Main ideas and their specific definitions]
- Relationships: [How these concepts connect to, influence, or contradict each other]
- Key Quotes: [Extract direct verbatim quotes that define the core concepts]
- Examples: [Illustrative instances, case studies, or analogies mentioned]
- Common Misconceptions: [Potential misunderstandings or clarifications]

CONCEPTS:`,

  methodology_overview: `Extract methodological information from this section.

{chunk}

Format your response as:
- Main Topics: [List ALL distinct topics discussed in this section - do not limit to top 3]
- Research Methods: [Specific approaches, techniques, and study designs used]
- Frameworks Applied: [Theoretical or practical models utilized]
- Data Collection: [How information was gathered (sample size, tools, duration)]
- Key Quotes: [Extract direct verbatim quotes describing the methods or limitations]
- Analysis Approaches: [How data was processed and interpreted]

METHODOLOGY:`,

  custom: `{customPrompt}

{chunk}`,
};

// ============================================================
// COLLAPSE PROMPTS
// ============================================================

export const COLLAPSE_PROMPTS: Record<string, string> = {
  default: `Condense these summaries while PRESERVING the structured format.
Keep the "Main Topics:" section intact with all topic listings.
Only condense the detailed explanations while maintaining the overall structure.

{content}

CONDENSED (maintain topic structure and "Main Topics:" format):`,

  custom: `Condense these summaries while PRESERVING the structured format.
Keep the "Main Topics:" section intact with all topic listings.
Only condense the detailed explanations while maintaining the overall structure.

The user has a custom focus area. When condensing, prioritize content related to this focus while still preserving other topics.

User's Custom Focus: "{customPrompt}"

{content}

CONDENSED (maintain topic structure and "Main Topics:" format, prioritize custom focus):`,
};

// ============================================================
// REDUCE PROMPTS
// ============================================================

export const REDUCE_PROMPTS: Record<string, string> = {
  briefing: `CRITICAL OUTPUT FORMAT: You MUST respond with MARKDOWN text, NOT JSON. Use ## headers, bullet points, and standard Markdown formatting. Do NOT output JSON objects or arrays.

CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Create a comprehensive briefing document that synthesizes the main themes and ideas from the sources. Start with a concise Executive Summary that presents the most critical takeaways upfront. The body of the document must provide a detailed and thorough examination of the main themes, evidence, and conclusions. This analysis should be structured logically with headings.

## Executive Summary
[Concise overview of the most critical takeaways]

## Main Themes
[Detailed examination of core themes found in the sources]

## Key Findings and Evidence
[Organized insights with supporting data. Integrate specific quotes where relevant.]

## Critical Analysis
[Identify potential biases, missing data, counter-arguments, or limitations in the source's claims]

## Conclusions
[Significant outcomes and implications]

## Recommendations
[Action items based on findings]

Based on the following source material:

{content}

BRIEFING DOC:`,

  study_guide: `CRITICAL OUTPUT FORMAT: You MUST respond with MARKDOWN text, NOT JSON. Use ## headers, bullet points, and standard Markdown formatting. Do NOT output JSON objects or arrays.

CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

You are a highly capable research assistant and tutor. Create a detailed study guide designed to review understanding of the sources. Create a quiz with ten short-answer questions and include a separate answer key. Suggest five essay format questions. Conclude with a comprehensive glossary.

## Learning Objectives
[What students should be able to do after studying]

## Study Notes
[Organized summary of main topics and concepts. Use bold text for key terms.]

## Quiz Questions
[10 short-answer questions (2-3 sentences each) to test comprehension]

## Answer Key
[Answers to the quiz questions]

## Essay Questions
[5 essay prompts for deeper exploration - no answers provided]

## Glossary
[Comprehensive list of key terms with clear definitions based on the text]

Based on the following source material:

{content}

STUDY GUIDE:`,

  blog_post: `CRITICAL OUTPUT FORMAT: You MUST respond with MARKDOWN text, NOT JSON. Use ## headers, bullet points, and standard Markdown formatting. Do NOT output JSON objects or arrays.

CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Act as a thoughtful writer and synthesizer of ideas, tasked with creating an engaging and readable blog post for a popular online publishing platform known for its clean aesthetic and insightful content. Your goal is to distill the top most surprising, counter-intuitive, or impactful takeaways from the provided source materials into a compelling listicle. The writing style should be clean, accessible, and highly scannable. Craft a compelling, click-worthy headline.

## [Compelling, Click-Worthy Headline]

### Introduction
[Hook that establishes a relatable problem or curiosity]

### [First Key Takeaway]
[Clear explanation with analysis. Include a blockquote if a powerful quote exists in the source.]

### [Second Key Takeaway]
[Clear explanation with analysis. Include a blockquote if a powerful quote exists in the source.]

### [Third Key Takeaway]
[Clear explanation with analysis. Include a blockquote if a powerful quote exists in the source.]

### [Additional Key Takeaways as needed]
[Continue with same structure for other major topics]

### Conclusion
[Forward-looking summary with final thought-provoking question or powerful takeaway]

Based on the following source material:

{content}

BLOG POST:`,

  summary: `CRITICAL OUTPUT FORMAT: You MUST respond with MARKDOWN text, NOT JSON. Use ## headers, bullet points, and standard Markdown formatting. Do NOT output JSON objects or arrays.

CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Create a comprehensive yet concise summary that synthesizes the essential information from the sources. Begin with an overview that captures the core subject and purpose. The body should systematically present the main arguments, key evidence supporting those arguments, and important conclusions. Maintain a neutral, objective tone.

## Overview
[Brief introduction to the subject and purpose of the sources]

## Main Arguments
[Core claims and positions presented in the sources]

## Key Evidence
[Supporting data, examples, and evidence used to back the arguments]

## Conclusions
[Significant findings, outcomes, and implications]

Based on the following source material:

{content}

SUMMARY:`,

  technical_report: `CRITICAL OUTPUT FORMAT: You MUST respond with MARKDOWN text, NOT JSON. Use ## headers, bullet points, and standard Markdown formatting. Do NOT output JSON objects or arrays.

CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Create a detailed technical report that thoroughly documents the technical aspects of the subject matter. Begin with an executive summary. The body should include comprehensive sections on technical specifications, methodologies, data analysis, and findings. Use precise technical language.

## Executive Summary
[Concise overview of technical findings]

## Technical Specifications
[Detailed parameters, configurations, requirements, and versions]

## Methodologies
[Approaches, algorithms, or frameworks used]

## Data and Metrics
[Quantitative information, measurements, and benchmarks]

## Analysis
[Detailed examination of technical data]

## Findings and Conclusions
[Technical conclusions and recommendations]

## Glossary
[Definitions of technical terms and acronyms used in the report]

Based on the following source material:

{content}

TECHNICAL REPORT:`,

  concept_explainer: `CRITICAL OUTPUT FORMAT: You MUST respond with MARKDOWN text, NOT JSON. Use ## headers, bullet points, and standard Markdown formatting. Do NOT output JSON objects or arrays.

CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Create an accessible and comprehensive explanation of the core concepts found in the sources. Begin with an introduction that explains why these concepts matter. For each concept, provide a clear definition, explain how it relates to other concepts, give concrete examples, and address common misconceptions. Organize the content logically.

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

## Glossary
[Quick reference list of all defined terms]

Based on the following source material:

{content}

CONCEPT EXPLAINER:`,

  methodology_overview: `CRITICAL OUTPUT FORMAT: You MUST respond with MARKDOWN text, NOT JSON. Use ## headers, bullet points, and standard Markdown formatting. Do NOT output JSON objects or arrays.

CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Create a comprehensive overview of the methodological approaches found in the sources. Begin with an introduction that explains the purpose and scope. Systematically document the research methods, frameworks applied, data collection techniques, and analysis approaches used.

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
[Strengths, limitations, and best practices]

Based on the following source material:

{content}

METHODOLOGY OVERVIEW:`,

  custom: `CRITICAL OUTPUT FORMAT: You MUST respond with MARKDOWN text, NOT JSON. Use ## headers, bullet points, and standard Markdown formatting. Do NOT output JSON objects or arrays.

INSTRUCTIONS:
The user has provided a custom prompt below.
Unless the user explicitly asks to focus on a narrow specific detail, you MUST generally cover all major topics found in the source material.
However, the user's custom instruction takes precedence if it conflicts with general coverage.

User's Custom Prompt:
"{customPrompt}"

Based on the following source material:

{content}`,
};
