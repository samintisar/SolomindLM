/**
 * Prompt templates for ReportGraph.
 *
 * Contains all prompt templates for different report types.
 */

// ============================================================
// MAP PROMPTS
// ============================================================

export const MAP_PROMPTS: Record<string, string> = {
  briefing: `Extract key insights, main themes, evidence, and action items from this section:

{chunk}

Format your response as:
- Main Topics: [list 3-5 key topics this section covers]
- Key Insights: [bulleted list of critical takeaways]
- Main Themes: [core topics and patterns]
- Supporting Evidence: [data, quotes, or examples that back up claims]
- Action Items: [specific next steps or recommendations]

INSIGHTS:`,

  study_guide: `Extract learning content from this section:

{chunk}

Format your response as:
- Main Topics: [list 3-5 key topics this section covers]
- Learning Objectives: [what students should understand]
- Key Concepts: [definitions with explanations]
- Important Terms: [vocabulary words with brief definitions]
- Potential Quiz Questions: [short-answer questions based on this section]

CONCEPTS:`,

  blog_post: `Extract engaging content for a blog post from this section:

{chunk}

Format your response as:
- Main Topics: [list 3-5 key topics this section covers]
- Surprising Takeaways: [counter-intuitive or unexpected points]
- Impactful Insights: [ideas that would resonate with readers]
- Notable Quotes: [powerful quotes worth featuring]
- Actionable Advice: [practical tips readers can apply]

CONTENT:`,

  summary: `Extract the essential information from this section:

{chunk}

Format your response as:
- Main Topics: [list 3-5 key topics this section covers]
- Main Arguments: [core claims and positions]
- Key Evidence: [supporting data and examples]
- Important Conclusions: [significant findings or outcomes]
- Context: [relevant background information]

SUMMARY:`,

  technical_report: `Extract technical details from this section:

{chunk}

Format your response as:
- Main Topics: [list 3-5 key topics this section covers]
- Technical Specifications: [specific parameters, configurations, or requirements]
- Methodologies: [approaches, algorithms, or frameworks used]
- Data and Metrics: [quantitative information and measurements]
- Findings: [technical conclusions and observations]

TECHNICAL:`,

  concept_explainer: `Identify concepts and relationships from this section:

{chunk}

Format your response as:
- Main Topics: [list 3-5 key topics this section covers]
- Core Concepts: [main ideas and definitions]
- Relationships: [how concepts connect to each other]
- Examples: [illustrative instances or analogies]
- Common Misconceptions: [potential misunderstandings to clarify]

CONCEPTS:`,

  methodology_overview: `Extract methodological information from this section:

{chunk}

Format your response as:
- Main Topics: [list 3-5 key topics this section covers]
- Research Methods: [approaches and techniques used]
- Frameworks Applied: [theoretical or practical models]
- Data Collection: [how information was gathered]
- Analysis Approaches: [how data was processed and interpreted]

METHODOLOGY:`,

  custom: `{customPrompt}

{chunk}`,
};

// ============================================================
// REDUCE PROMPTS
// ============================================================

export const REDUCE_PROMPTS: Record<string, string> = {
  briefing: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Create a comprehensive briefing document that synthesizes the main themes and ideas from the sources. Start with a concise Executive Summary that presents the most critical takeaways upfront. The body of the document must provide a detailed and thorough examination of the main themes, evidence, and conclusions found in the sources. This analysis should be structured logically with headings and bullet points to ensure clarity. The tone must be objective and incisive.

## Executive Summary
[Concise overview of the most critical takeaways]

## Main Themes
[Detailed examination of core themes found in the sources]

## Key Findings and Evidence
[Organized insights with supporting data, quotes, or examples]

## Conclusions
[Significant outcomes and implications]

## Recommendations
[Action items based on findings]

Based on the following source material:

{content}

BRIEFING DOC:`,

  study_guide: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

You are a highly capable research assistant and tutor. Create a detailed study guide designed to review understanding of the sources. Create a quiz with ten short-answer questions (2-3 sentences each) and include a separate answer key. Suggest five essay format questions, but do not supply answers. Also conclude with a comprehensive glossary of key terms with definitions.

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
[Comprehensive list of key terms with definitions]

Based on the following source material:

{content}

STUDY GUIDE:`,

  blog_post: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Act as a thoughtful writer and synthesizer of ideas, tasked with creating an engaging and readable blog post for a popular online publishing platform known for its clean aesthetic and insightful content. Your goal is to distill the top most surprising, counter-intuitive, or impactful takeaways from the provided source materials into a compelling listicle. The writing style should be clean, accessible, and highly scannable, employing a conversational yet intelligent tone. Craft a compelling, click-worthy headline. Begin the article with a short introduction that hooks the reader by establishing a relatable problem or curiosity, then present each of the takeaway points as a distinct section with a clear, bolded subheading. Within each section, use short paragraphs to explain the concept clearly, and don't just summarize; offer a brief analysis or a reflection on why this point is so interesting or important, and if a powerful quote exists in the sources, feature it in a blockquote for emphasis. Conclude the post with a brief, forward-looking summary that leaves the reader with a final thought-provoking question or a powerful takeaway to ponder.

## [Compelling, Click-Worthy Headline]

### Introduction
[Hook that establishes a relatable problem or curiosity]

### [First Key Takeaway]
[Clear explanation with analysis and potential blockquote]

### [Second Key Takeaway]
[Clear explanation with analysis and potential blockquote]

### [Third Key Takeaway]
[Clear explanation with analysis and potential blockquote]

### [Additional Key Takeaways as needed]
[Continue with same structure]

### Conclusion
[Forward-looking summary with final thought-provoking question or powerful takeaway]

Based on the following source material:

{content}

BLOG POST:`,

  summary: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Create a comprehensive yet concise summary that synthesizes the essential information from the sources. Begin with an overview that captures the core subject and purpose. The body should systematically present the main arguments, key evidence supporting those arguments, and important conclusions. Maintain a neutral, objective tone while ensuring all significant points are covered. Use clear headings and bullet points to enhance readability.

## Overview
[Brief introduction to the subject and purpose of the sources]

## Main Arguments
[Core claims and positions presented in the sources]

## Key Evidence
[Supporting data, examples, and evidence]

## Conclusions
[Significant findings, outcomes, and implications]

Based on the following source material:

{content}

SUMMARY:`,

  technical_report: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Create a detailed technical report that thoroughly documents the technical aspects of the subject matter. Begin with an executive summary of technical findings. The body should include comprehensive sections on technical specifications, methodologies employed, data and metrics analysis, and detailed findings. Use precise technical language and include specific parameters, configurations, and quantitative measurements where applicable. The report should be structured for technical professionals who require in-depth information.

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
[Technical conclusions and recommendations]

Based on the following source material:

{content}

TECHNICAL REPORT:`,

  concept_explainer: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Create an accessible and comprehensive explanation of the core concepts found in the sources. Begin with an introduction that explains why these concepts matter and who they are relevant for. For each concept, provide a clear definition, explain how it relates to other concepts, give concrete examples or analogies to aid understanding, and address common misconceptions. Use clear, jargon-free language that makes complex ideas understandable to a non-expert audience. Organize the content logically with concepts building upon each other.

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
[Quick reference of the most important points]

Based on the following source material:

{content}

CONCEPT EXPLAINER:`,

  methodology_overview: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

Create a comprehensive overview of the methodological approaches found in the sources. Begin with an introduction that explains the purpose and scope of the methodologies covered. Systematically document the research methods, frameworks applied, data collection techniques, and analysis approaches used. For each method, explain its purpose, how it was implemented, and what it was designed to achieve. Use clear headings and structured formatting to make the information easily accessible to researchers or practitioners who may need to understand or apply these methods.

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

  custom: `CRITICAL REQUIREMENT - READ CAREFULLY:
You MUST cover ALL major topics present in the source material.
Do not focus primarily on one or two topics while neglecting others.
Ensure each major theme receives balanced, thorough coverage.
If the sources cover 6+ distinct topics, each should be addressed meaningfully.

{customPrompt}

{content}`,
};
