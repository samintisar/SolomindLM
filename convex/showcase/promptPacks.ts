/**
 * Reusable Studio prompts, grouped in packs by the kind of notebook they suit. The seed saves each
 * one to the owner's Prompt Library (and publishes it with the notebooks), and manifest Studio items
 * use them through `promptKey`, so a showcase item runs exactly the text people can reuse.
 * Keep them generic: no prompt names a specific library, course, company or topic.
 */
import type { StudioKind } from "./manifest";

export interface ShowcasePrompt {
  /** Prompt Library title, unique per owner; "<Pack> · <what it makes>". */
  title: string;
  description: string;
  studioTool: StudioKind;
  text: string;
}

const CODE = "Learn a library";
const EXAM = "Course exam prep";
const CLINICAL = "Clinical science";
const PAPERS = "Research papers";
const FILING = "Company filing";
const MARKET = "Market research";
const DOCUMENTS = "Primary sources";
const DECISION = "Decision research";

export const SHOWCASE_PROMPTS = {
  // ── Learn a coding library or language ─────────────────────────────────
  "code.flashcards": {
    title: `${CODE} · API recall flashcards`,
    description:
      "Flashcards that build working fluency with a programming library or language: code-to-output, task-to-API, core concepts and common gotchas.",
    studioTool: "flashcards",
    text: `Make cards that build working fluency with the library or language in the sources, not trivia. Mix four kinds:
1. "What does this do?": a short code snippet (3–8 lines, in a fenced code block) on the front; its effect, output or result on the back.
2. "How do I…?": a concrete task on the front; the idiomatic call or a minimal snippet on the back.
3. Concept cards: a core abstraction, what it is for and why it exists, in one or two sentences.
4. Gotcha cards: a common mistake on the front; why it fails and the fix on the back.
Use only functions, classes, arguments and signatures that appear in the sources; never invent APIs. When the sources show both an older and a recommended form, teach the recommended one. Keep each back under 60 words.`,
  },
  "code.quiz": {
    title: `${CODE} · Read-the-code quiz`,
    description:
      "A quiz you can only pass by reading and reasoning about code: outputs, shapes and types, errors and fixes.",
    studioTool: "quiz",
    text: `Write questions that can only be answered by understanding code, not by recognising words. At least half of the questions show a short snippet in a fenced code block and ask what it prints or returns, what shape, type or value results, which line raises an error and why, or which change fixes a bug. The rest ask which API fits a described task, or what happens when one argument changes.
Wrong options must be mistakes learners really make: off-by-one errors, the wrong dimension or axis, mutating in place versus returning a copy, forgetting a required call, mixing up similar functions.
Every snippet must be correct and runnable as written, unless the question is about its bug. Use only APIs that appear in the sources. In each explanation, walk through the code step by step.`,
  },
  "code.written": {
    title: `${CODE} · Write-the-code questions`,
    description:
      "Short coding tasks graded like a code review: write a small function, fix a failing snippet, or rewrite code idiomatically.",
    studioTool: "writtenQuestions",
    text: `Ask the learner to write or fix small pieces of code. Each question states a concrete task with its inputs and expected behaviour, for example: write a function that does X; this snippet fails with error Y, so fix it and explain why; rewrite this loop using the library's idiomatic API. Each task must be solvable in 5–25 lines using only what the sources teach, and must name one edge case to handle.
The model answer is idiomatic, working code in a fenced code block, followed by a short explanation.
Rubric criteria: (1) correct behaviour on the stated inputs; (2) correct use of the library's real API, with no invented functions; (3) the named edge case is handled; (4) the code is readable. Give partial credit for the right approach with minor syntax slips.`,
  },
  "code.cheatsheet": {
    title: `${CODE} · One-page cheat sheet`,
    description:
      "A one-page cheat sheet for a library or language: core concepts, the most-used calls with tiny examples, common patterns and gotchas.",
    studioTool: "report",
    text: `Write a one-page cheat sheet for the library or language in the sources, for someone who has just finished a first tutorial. Sections:
1. Core concepts: one line each.
2. Most-used calls (15–25), grouped by task, each with a minimal code example and a one-line note.
3. Common patterns: 3–4 end-to-end snippets of 5–15 lines for the workflows the sources teach.
4. Gotchas: what goes wrong and how to avoid it.
5. Where to go next: the parts of the sources that go deeper.
Prefer tables and code over prose. Only use APIs shown in the sources, and cite them.`,
  },
  "code.concepts": {
    title: `${CODE} · Concepts explained with code`,
    description:
      "Explains a library's core ideas from first principles, each with a mental model, a runnable example and the classic misunderstanding.",
    studioTool: "report",
    text: `Explain the core ideas of the library or language in the sources from first principles, for a programmer who is new to it. For each idea:
- the problem it solves;
- a mental model in plain words;
- a minimal runnable example;
- what goes wrong when it is misunderstood, with the symptom a learner would see;
- how it connects to the next idea.
Order the ideas so each one builds on the last, from the basic data structures to a complete working program. Cite the sources for every claim and never invent APIs.`,
  },
  "code.mindmap": {
    title: `${CODE} · Library map`,
    description:
      "A map of a library or language as a learner explores it: data structures, modules, workflows, tooling and ecosystem.",
    studioTool: "mindmap",
    text: `Map the library or language as a learner would explore it. Top-level branches: core data structures; main modules or subsystems; the typical workflow from start to finish; tooling (debugging, testing, performance, saving and loading); ecosystem and integrations. Leaves are concrete API names or concepts from the sources, each with a few words on what it is for.`,
  },
  "code.reference": {
    title: `${CODE} · API reference table`,
    description:
      "A reference table of a library's most important functions, classes and methods, with arguments, returns and pitfalls.",
    studioTool: "spreadsheet",
    text: `Build a reference table of the most important functions, classes and methods that appear in the sources. Columns: Name; Module or namespace; Task group; What it does (one line); Key arguments; Returns; Typical use; Common pitfall. One row per API, sorted by task group so related calls sit together. Only include APIs that appear in the sources, and leave a cell blank rather than guessing.`,
  },
  "code.audio": {
    title: `${CODE} · How the pieces fit`,
    description:
      "An audio walk-through of how a library's pieces fit together, the usual workflow and the mistakes beginners make.",
    studioTool: "audio",
    text: `Talk through how the library's pieces fit together for someone learning it: the core abstraction, the usual workflow from start to finish, the two or three mistakes beginners make most and how to recognise them, and how to choose between similar tools. Describe code in words rather than reading it aloud symbol by symbol.`,
  },

  // ── Course exam prep (concepts plus problem solving) ───────────────────
  "exam.flashcards": {
    title: `${EXAM} · Concepts and worked problems`,
    description:
      "Exam-ready flashcards that test understanding: definitions with why they matter, cause and effect, distinctions and short worked problems.",
    studioTool: "flashcards",
    text: `Make exam-ready cards that test understanding, not just definitions. Mix:
- definition cards phrased as "What is X, and why does it matter?";
- cause-and-effect cards: "What happens to A when B changes, and why?";
- distinction cards: "X vs Y: what is the key difference?";
- short worked problems with the numbers on the front and the method plus the answer on the back.
Use the course's own terms, notation and formulas from the sources. Keep each back under 60 words.`,
  },
  "exam.quiz": {
    title: `${EXAM} · Apply-it quiz`,
    description:
      "Exam-style multiple choice that makes students apply ideas to new scenarios, read graphs and tables, and do short calculations.",
    studioTool: "quiz",
    text: `Write exam-style questions that make students apply ideas to new situations rather than recall wording:
- scenario questions ("a change happens to…; what happens to…?");
- graph or table interpretation, described in words;
- short calculations whose wrong options come from common errors (sign errors, the wrong formula, confusing a shift of a curve with a movement along it);
- "which statement is correct?" questions that target typical misconceptions.
Each explanation shows the reasoning step by step and names the misconception behind each wrong option.`,
  },
  "exam.written": {
    title: `${EXAM} · Show-your-reasoning questions`,
    description:
      "Short-answer exam questions that need several reasoning steps, with rubrics that give credit for each step.",
    studioTool: "writtenQuestions",
    text: `Write exam-style short-answer questions that need several reasoning steps: explain a mechanism, predict an outcome and justify it, work a numeric problem and interpret the result, or evaluate a claim using the course's concepts. Model answers show each step.
Rubric criteria award points separately for: the correct concept; correct application or calculation; and a clear explanation that links them. Give partial credit for correct reasoning with an arithmetic slip.`,
  },
  "exam.mindmap": {
    title: `${EXAM} · Course map`,
    description:
      "A syllabus-style map of a course: units, the key concepts in each, and the formulas, graphs or models that go with them.",
    studioTool: "mindmap",
    text: `Map the course as it would appear on a syllabus: units as top-level branches, the key concepts under each, and the formulas, graphs, models or examples that belong to each concept. Where the sources connect concepts across units, show the link.`,
  },
  "exam.audio": {
    title: `${EXAM} · Night-before recap`,
    description:
      "A short revision recap: what is most likely to be examined, how it connects, classic mistakes and one worked example.",
    studioTool: "audio",
    text: `A quick revision recap for a student the night before the exam: the ideas most likely to be examined, how they connect, the classic mistakes students make, and one worked example talked through in words.`,
  },

  // ── Clinical and life-science coursework ───────────────────────────────
  "clinical.flashcards": {
    title: `${CLINICAL} · Mechanism, effect, caution`,
    description:
      "Flashcards that link mechanisms to clinical consequences: how it works, why it causes an effect, key differences and safety points.",
    studioTool: "flashcards",
    text: `Make cards that link mechanism to clinical consequence. Kinds:
- mechanism: "How does X work?";
- effect: "Why does X cause Y?";
- comparison: "X vs Y: what is the key difference in mechanism or use?";
- safety: contraindications, interactions and what to monitor.
Use generic names and the terminology in the sources. This is for learning, not clinical use: give no dosing advice. Keep each back under 60 words.`,
  },
  "clinical.quiz": {
    title: `${CLINICAL} · Clinical-reasoning quiz`,
    description:
      "Short patient vignettes that test whether students can apply mechanisms to predict effects, interactions and adverse reactions.",
    studioTool: "quiz",
    text: `Write short vignette questions that require applying mechanisms: a patient scenario with one or two relevant details, then ask which effect, interaction or adverse reaction is most likely, and why. Wrong options are plausible confusions: a similar class, the wrong receptor or pathway, or the wrong direction of an effect. Each explanation ties the answer back to the mechanism in the sources. No dose calculations unless the sources teach them.`,
  },
  "clinical.written": {
    title: `${CLINICAL} · Explain-the-mechanism questions`,
    description:
      "Short answers that ask students to explain a mechanism and its consequence, marked on accuracy, the causal link and terminology.",
    studioTool: "writtenQuestions",
    text: `Ask students to explain, in three to five sentences, a mechanism and its consequence: why an interaction happens, why a class has a characteristic adverse effect, or how a change in absorption, distribution, metabolism or excretion alters drug levels and effect.
Rubric criteria: the correct mechanism; the correct consequence; an explicit causal link between them; precise terminology.`,
  },

  // ── Research papers ────────────────────────────────────────────────────
  "papers.comparison": {
    title: `${PAPERS} · Methods comparison table`,
    description:
      "One row per paper: the problem, method, what it needs, data, headline result, stated limitations and when to use it.",
    studioTool: "spreadsheet",
    text: `Compare the papers in the sources in one table, one row per paper. Columns: Paper (short title and year); Problem addressed; Approach (one line); What it needs (model access, retrieval, extra training or compute); Datasets or benchmarks; Headline result (with the metric); Limitations the authors state; Best used when. Quote numbers exactly as reported, and leave a cell blank rather than guessing.`,
  },
  "papers.digest": {
    title: `${PAPERS} · Field digest`,
    description:
      "A digest of a research area for practitioners: the problem, a taxonomy of approaches, the evidence, disagreements and open problems.",
    studioTool: "report",
    text: `Write a digest of the research area the sources cover, for a practitioner who has not read the papers:
1. The problem and why it matters.
2. A taxonomy of approaches that groups the papers.
3. For each group: what it does, the evidence for it, and its main limitation.
4. Where the papers agree and where they disagree.
5. Open problems.
6. What to use in practice today, and when.
Cite every claim.`,
  },
  "papers.critique": {
    title: `${PAPERS} · Strengths and blind spots`,
    description:
      "An audio critique of a body of research: what is well supported, where evaluations are weak and what a sceptical reviewer would ask.",
    studioTool: "audio",
    text: `Critique the body of work in the sources: which claims are well supported, where the evaluations are weak (benchmarks, metrics, sample or model sizes, baselines, data leakage), what the papers assume, and what a sceptical reviewer would ask next.`,
  },
  "papers.flashcards": {
    title: `${PAPERS} · Papers and key ideas`,
    description:
      "Flashcards for recalling each paper's core idea, method and finding, plus the field's key terms.",
    studioTool: "flashcards",
    text: `Make cards that let a reader recall each paper's core idea, method and main finding, plus the key terms of the field. Fronts ask "What problem does this method address, and how?", "What did this study find?" or define a term. Backs are under 50 words and name the paper. Include a few cards that compare two papers.`,
  },
  "papers.mindmap": {
    title: `${PAPERS} · Research landscape`,
    description:
      "A map of a research area: the problem, families of approaches, the papers in each, and how they are evaluated.",
    studioTool: "mindmap",
    text: `Map the research area in the sources: the core problem and its causes; families of approaches, with the papers and methods in each; how work in the area is evaluated (benchmarks and metrics); and open questions. Label each method with the paper it comes from.`,
  },

  // ── Reading a company filing ───────────────────────────────────────────
  "filing.quiz": {
    title: `${FILING} · Find it, compute it, interpret it`,
    description:
      "A quiz that makes you use an annual or quarterly report: find a figure, compute a ratio, and say what it means.",
    studioTool: "quiz",
    text: `Write questions that make the learner use the filing:
- locate a figure, and name the section where it is disclosed;
- compute a ratio or growth rate from reported numbers (gross margin, operating margin, revenue growth, current ratio, free cash flow);
- interpret what a number says about the business;
- know where things are disclosed (risk factors, management's discussion, segment notes, accounting policies).
Use only numbers from the filings, and show the arithmetic in each explanation.`,
  },
  "filing.written": {
    title: `${FILING} · Analyst questions`,
    description:
      "Questions an analyst answers from a filing: explain a change in a key metric, weigh a risk, compare segments.",
    studioTool: "writtenQuestions",
    text: `Ask the questions an analyst answers from a filing: explain a change in a key metric and its stated drivers; assess a risk factor's likely impact; compare segments; or identify an accounting choice and its effect. Model answers cite the section and the numbers.
Rubric criteria: correct figures; the right section of the filing; a sound interpretation; and saying what the filing does not tell you.`,
  },
  "filing.walkthrough": {
    title: `${FILING} · Filing walkthrough`,
    description:
      "Walks a first-time reader through an annual report, part by part, using the filing's own content as the example.",
    studioTool: "report",
    text: `Walk a first-time reader through the filing: what each major part (business overview, risk factors, management's discussion and analysis, the financial statements, the notes) is for and what to look for in it, using this filing's actual content as the example. End with the five numbers every reader should pull from it and what each one reveals.`,
  },
  "filing.flashcards": {
    title: `${FILING} · Filing literacy`,
    description:
      "Flashcards on where things live in a filing and what key line items and ratios mean, with the filing's own numbers as examples.",
    studioTool: "flashcards",
    text: `Make cards on where things live in an annual or quarterly report and what the key line items and ratios mean. Fronts ask "Where would you find…?", "What does this line item measure?" or "How do you compute this ratio?". Backs answer in under 50 words and give this filing's own number as the example.`,
  },

  // ── Market and product research ────────────────────────────────────────
  "market.table": {
    title: `${MARKET} · Market scan table`,
    description:
      "A table of the options, products or players in a market: specs, cost, incentives, strengths, drawbacks and best fit.",
    studioTool: "spreadsheet",
    text: `Build a table of the options, products, technologies or players described in the sources. Columns: Name; Category; Key specs or features; Cost or price (with unit and date); Incentives or rules that apply; Strengths; Drawbacks; Best fit for. Leave a cell blank rather than guessing, and give the date of every figure.`,
  },
  "market.briefing": {
    title: `${MARKET} · Decision briefing`,
    description:
      "A briefing for someone deciding whether and what to buy or invest in: market, cost drivers, options, incentives and risks.",
    studioTool: "report",
    text: `Write a decision briefing for someone deciding whether, and what, to buy or invest in:
1. The market in one paragraph, with dated figures.
2. What drives cost and value.
3. The main options and their trade-offs.
4. Incentives, regulations and recent changes that alter the maths.
5. Risks and open questions.
6. A checklist of questions to answer before deciding.
Cite every figure with its date.`,
  },

  // ── Primary sources (history, civics, humanities) ──────────────────────
  "documents.essay": {
    title: `${DOCUMENTS} · Argument essay`,
    description:
      "Argument-essay prompts graded on a defensible claim, evidence from the documents, reasoning and a counter-argument.",
    studioTool: "writtenQuestions",
    text: `Write argument-essay prompts that ask the student to take and defend a position on a question the documents speak to, for example which idea best explains an outcome, or how far one text answers another's concerns. Each prompt names two or three of the documents the student should use.
The model answer has a clear thesis, uses specific evidence quoted or paraphrased from the documents, explains how the evidence supports the claim, and responds to a counter-argument.
Rubric criteria: (1) a defensible thesis; (2) specific evidence from at least two named documents; (3) reasoning that links the evidence to the thesis; (4) a counter-argument that is answered, not just mentioned.`,
  },
  "documents.debate": {
    title: `${DOCUMENTS} · Debate between the authors`,
    description:
      "An audio debate in which hosts argue the positions of the documents' authors, quoting them and answering each other.",
    studioTool: "audio",
    text: `Stage a debate between the positions the documents represent. Each host argues one side using the authors' own arguments, quoting or closely paraphrasing the documents, and responds directly to the other's points. End by naming what each side got right in hindsight.`,
  },
  "documents.timeline": {
    title: `${DOCUMENTS} · Timeline of events and texts`,
    description:
      "A dated timeline of the events and documents in the sources, with who was involved and why each matters.",
    studioTool: "spreadsheet",
    text: `Build a timeline of the events and documents in the sources, one row per event, in date order. Columns: Date; Event or document; Who was involved; What happened or what it says (one line); Why it matters; Related document. Use only dates given in the sources.`,
  },
  "documents.flashcards": {
    title: `${DOCUMENTS} · Documents and key passages`,
    description:
      "Flashcards on what each document says, its key passages and clauses, and the arguments for and against it.",
    studioTool: "flashcards",
    text: `Make cards on the documents themselves: what each section, clause or passage says in plain words; who wrote it and why; the argument a passage makes; and how documents respond to each other. Quote short passages on fronts where it helps ("Which document says…, and what does it mean?"). Keep each back under 60 words.`,
  },
  "documents.quiz": {
    title: `${DOCUMENTS} · Document-based quiz`,
    description:
      "Multiple choice built on short quotations: identify the source, interpret the passage and connect it to its context.",
    studioTool: "quiz",
    text: `Write questions built on short quotations from the documents: identify which document a passage comes from, what it means, which argument it supports, or which principle it applies. Include questions that connect a passage to its historical context or to another document. Wrong options should be plausible confusions between documents or principles.`,
  },

  // ── Decision research (careers, options, choices) ──────────────────────
  "decision.table": {
    title: `${DECISION} · Option comparison table`,
    description:
      "One row per option with the facts that matter for choosing: cost or pay, outlook, requirements, day-to-day reality, pros and cons.",
    studioTool: "spreadsheet",
    text: `Compare the options in the sources, one row per option. Columns: Option; What it involves day to day; Requirements to get in; Cost or pay (with the year); Outlook or growth (with the period); Key skills; Pros; Cons; Best fit for. Quote figures exactly as the sources give them, and leave a cell blank rather than guessing.`,
  },
  "decision.briefing": {
    title: `${DECISION} · Choose-a-path briefing`,
    description:
      "A briefing that helps someone choose between options: what each involves, the evidence, trade-offs, and how to decide.",
    studioTool: "report",
    text: `Write a briefing for someone choosing between the options in the sources:
1. What each option involves, in plain words.
2. The facts that matter (pay or cost, outlook, requirements), with dates.
3. Trade-offs and who each option suits.
4. How to move from one option to another, if that is possible.
5. A short decision guide: the questions to ask yourself and what the answers point to.
Cite every figure.`,
  },
  "decision.interview": {
    title: `${DECISION} · Mock interview questions`,
    description:
      "Interview questions for the roles or programmes in the sources, with model answers and a rubric an interviewer would use.",
    studioTool: "writtenQuestions",
    text: `Write mock interview questions for the roles, programmes or positions described in the sources: a mix of "why this path?", questions about the core tasks and skills, and a short scenario where the candidate explains how they would handle a typical piece of work. Model answers are concise and use the sources' own description of the work.
Rubric criteria: a specific, relevant answer; evidence of understanding the day-to-day work; a structured explanation; and honesty about trade-offs.`,
  },
  "decision.debate": {
    title: `${DECISION} · Which path? debate`,
    description:
      "An audio debate between two hosts who each argue for a different option, using the facts in the sources.",
    studioTool: "audio",
    text: `Two hosts each argue for a different option using the facts in the sources: cost or pay, outlook, requirements, day-to-day reality and risks. They challenge each other's numbers and assumptions, then agree on who each option suits best.`,
  },
} as const satisfies Record<string, ShowcasePrompt>;

export type ShowcasePromptKey = keyof typeof SHOWCASE_PROMPTS;
