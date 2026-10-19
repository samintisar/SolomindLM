# Showcase expansion: proposal for approval (2026-10-19)

Nothing here has been seeded. The seed runs only after you approve.

Every source below was fetched on 2026-10-19 and its licence read on the publisher's own page, using the rules in the [seed plan's Sources appendix](2026-10-16-showcase-notebooks-seed.md#sources-appendix). Allowed licences are public domain, CC0, CC BY and CC BY-SA. YouTube videos were checked with the appendix's five-step method.

## Decisions needed

1. **New notebooks.** I recommend **Learn PyTorch**, **AP U.S. Government: Founding Documents** and **Career Research**. Two more are optional: Extreme Heat & Health and Web Security Basics. I'd drop Your First Paycheck: its government pages are thin, some are hard to ingest, and it sits close to financial advice.
2. **PyTorch's official tutorials are BSD-3.** BSD-3 is a permissive licence that only requires attribution, but it isn't on our allowed list. There are two options:
   - Allow BSD-3 for this one notebook. The 4 official "Learn the Basics" pages would be the core, with attribution kept. **(Recommended.)**
   - Use only d2l.ai (CC BY-SA), Wikipedia and the videos.
3. **Regenerate the existing 7 notebooks.** New sources don't change Studio items that already exist. To get Studio items that cover the new sources and use the new prompts, each notebook is deleted on dev and reseeded. That reruns every paid generation, including the literature review and deep research. The other way is to only add sources and the new Studio items, keeping the old ones.
4. **Getting Started practice topic:** "The Moon: phases, tides and eclipses". It gives one source of each type: Wikipedia, a NASA web page, a NASA PDF and a YouTube video.

## Seed changes this needs

- Raise the seed's own 6-source cap (`manifestValidation.ts`) to 15. The app has no such limit.
- Raise the 600-character prompt cap to the Prompt Library's 2,000.
- **Prompt packs.** These are new manifest data. The seed saves each prompt to the owner's Prompt Library and publishes it, idempotently, matching on owner and title. Studio items refer to a pack prompt by key, so each notebook uses exactly the text people can reuse from the Prompt Library.
- The literature review's `paperDiscovery.take` goes from 5 to 11, with 11 pinned DOIs.
- Literature review and deep research tables and reports are copied into Studio, as now.

---

## Existing notebooks: sources to add

### ECON 101 · Midterm Prep (5 → 13)
- Wikipedia articles: Monopoly, Oligopoly, Externality, Economic surplus, Price ceiling, Cost curve.
- CC BY videos from the University of Utah's Department of Economics channel, the same channel as the existing elasticity lecture:
  - *Consumer Surplus* (`O9UfktOERII`, 17 min)
  - *Monopoly versus Competition, Part 1* (`PkRGHZh4XxM`, 14 min)

### Pharmacology Essentials (5 → 13)
- Wikipedia articles: Pharmacodynamics, Therapeutic index, ACE inhibitor, NSAID, Opioid, Antibiotic.
- FDA, *Finding and Learning about Side Effects (adverse reactions)*. Public domain.
- VetMedAcademy (with the MSD Veterinary Manual), *Drug Antagonists, Agonist/Antagonists and Inverse Agonists* (`GTZCKeqnpLo`, CC BY).
- Strong alternate: PMC7557591, *Mechanisms of CYP450 Inhibition* (CC BY 4.0).

### Literature Review: Does Spaced Repetition Work? (5 → 11 papers, all CC BY 4.0)
- Kornmeier et al., PLoS ONE 2014 (10.1371/journal.pone.0090656): spacing in six intervals across two domains.
- Barzagar Nazari & Ebersbach 2018 (10.1002/acp.3485): classroom maths, grades 3 and 7. Wiley blocks automated fetching, so this one may be abstract-only.
- Ebersbach & Barzagar Nazari 2020 (10.3389/fpsyg.2020.00811): a **null result**, which gives the review counter-evidence.
- Lyle et al. 2022 (10.1007/s10648-022-09677-2): spaced retrieval practice in a calculus course.
- Bego et al. 2024 (10.1186/s40594-024-00468-5): meta-analyses across nine STEM courses.
- Rogers, Nakata & Chiu 2025 (10.1017/s0272263124000706): spaced vs massed practice for L2 vocabulary, online.
- Optional context: Wikipedia Spacing effect and Spaced repetition (as URL sources).

### LLM Hallucinations: Paper Digest (6 → 13)
- arXiv papers, each CC BY 4.0 unless noted:
  - 2509.04664 *Why Language Models Hallucinate*
  - 2405.05904 *Does Fine-Tuning on New Knowledge Encourage Hallucinations?*
  - 2410.02707 *LLMs Know More Than They Show*
  - 2306.03341 *Inference-Time Intervention*
  - 2403.18802 *Long-form factuality (SAFE)*, CC0
  - 2501.08292 *HALoGEN*
- Wikipedia, *Hallucination (artificial intelligence)*.
- Coverage once these are added:
  - theory: Kalai, Gekhman
  - detection: SelfCheckGPT, semantic entropy, probing
  - mitigation: RAG, inference-time intervention, verification and editing
  - benchmarks: HALoGEN, LongFact, FAVA

### Home Battery Storage · Market Scan (4 → 12)
- IRS, *Residential Clean Energy Credit*. The credit ended for property placed in service after 2025.
- EIA, *Rooftop solar … Puerto Rico* (2026-04): 171k home and business batteries and a battery-sharing virtual power plant.
- EIA, *Battery storage capacity averaged 70% growth* (2026-08).
- DOE, *Solar and Resilience Basics*: backup power and islanding.
- USFA/FEMA, *Responding to fires that include energy storage systems*: safety.
- Wikipedia articles: Home energy storage, Lithium iron phosphate battery, Virtual power plant.

### Reading a 10-K (1 → 10)
- Costco's other EDGAR filings:
  - Q3 FY2026 10-Q
  - Q4 FY2026 earnings release (8-K Ex. 99.1)
  - DEF 14A proxy statement, which holds executive pay and the auditor vote
- SEC investor education:
  - *How to Read a 10-K* (PDF)
  - *How to Read an 8-K* (PDF)
  - *Beginners' Guide to Financial Statements*
- Wikipedia articles: Form 10-K, Income statement, Cash flow statement.

### Getting Started with SolomindLM (1 → 6)
- The existing pasted guide.
- Wikipedia, *Lunar phase*.
- NASA web pages: *Moon Phases* and *Tides*.
- NASA *Earth's Moon* lithograph (PDF).
- Launch Pad Astronomy, *Phases and Motions of the Moon* (`1CC0P7y90PU`, CC BY). The channel is run by a Towson University astronomy teacher.

---

## New notebooks

### 1. Learn PyTorch from Scratch (recommended)
**Who it's for:** a Python developer learning PyTorch: tensors → autograd → `nn.Module` → training loop → saving models.

**Sources (10–12):**
- PyTorch *Learn the Basics* tutorial pages: Tensors, Autograd, Build Model, Optimization. BSD-3, so this depends on decision 2.
- d2l.ai chapters, CC BY-SA 4.0:
  - *Data Manipulation*
  - *Automatic Differentiation*
  - *Linear Regression from Scratch*
- Wikipedia articles: PyTorch, Automatic differentiation, Backpropagation, Stochastic gradient descent.
- CC BY videos:
  - University of Utah, *Machine Learning Lecture 23 – PyTorch Tutorial* (`YhJMd78ctdw`)
  - NYU Deep Learning practicum on autograd (`eEzCZnOFU1w`)

**Studio** (Learn-a-library pack):
- Learning Guide chat
- API flashcards (40)
- "Read the code" quiz (15)
- "Write the code" written questions (6)
- Cheat-sheet report
- "Concepts explained with code" report
- Library mind map
- API reference spreadsheet
- Deep-dive audio

### 2. AP U.S. Government: Founding Documents (recommended)
**Who it's for:** an AP Gov or civics student working on the foundational-documents unit and the argument essay.

**Sources (11):**
- National Archives transcripts: Constitution, Bill of Rights, Declaration of Independence, Articles of Confederation.
- Federalist Papers text from the Library of Congress: Nos. 1–10, 51 and 78.
- Wikipedia: *Federalist No. 10* and *Anti-Federalism*.
- CC BY videos:
  - US National Archives, *Anti-Federalists and the Bill of Rights*
  - Teach Democracy, *If Men Were Angels*
  - An AP teacher's *Federalist 10* explainer

**Studio** (Primary-source humanities pack):
- Learning Guide chat
- Graded argument essays (3, hard)
- Federalists vs Anti-Federalists debate audio
- 1776–1791 timeline spreadsheet
- Study guide
- Clause and amendment flashcards
- Quiz

### 3. Career Research: Data Scientist vs Software Developer vs Statistician (recommended)
**Who it's for:** a student or career-switcher choosing a path and then preparing for interviews.

**Sources (9–10):**
- Bureau of Labor Statistics Occupational Outlook Handbook pages for each role, plus information security analyst. Public domain.
- O*NET summaries for each role (CC BY 4.0, credit USDOL/ETA).
- Wikipedia: *Data science* and *Software engineering*.

**Studio** (Decision research pack):
- Comparison spreadsheet: pay, growth, education, tasks
- Infographic
- Deep research (web + news): hiring trends and AI's effect on entry-level roles
- Briefing
- Mock-interview written questions
- Debate audio: "which path?"

### Optional
- **Extreme Heat & Health: Policy Briefing.** CDC and National Weather Service pages plus Wikipedia, with deep research as the headline feature. EPA was dropped because its disclaimer reads as non-commercial.
- **Web Security Basics.** OWASP Top 10 2025 (CC BY 3.0), OWASP Cheat Sheets (CC BY-SA 4.0), MDN (CC BY-SA) and NIST SP 800-63B (public domain). It could reuse the Learn-a-library pack.

---

## Prompt packs (published to the Prompt Library)

Each pack is a set of generic prompts, one for each Studio type that kind of notebook needs. No prompt names a specific library, course, company or topic. The PyTorch pack works unchanged for TensorFlow, pandas or Rust, the exam pack for any concept-plus-problems course, and so on.

Prompt titles follow the pattern "<Pack> · <what it makes>". Built-in Studio types are used where they already fit, such as the study guide and the financial summary.

| Pack | Used by | Prompts |
| --- | --- | --- |
| Learn a coding library or language | Learn PyTorch | API recall flashcards, "Read the code" quiz, "Write the code" written questions, cheat-sheet report, "Concepts explained with code" report, library mind map, API reference spreadsheet, learning deep-dive audio |
| Course exam prep | ECON 101 | exam concepts and worked-problem flashcards, "Apply it, don't recall it" quiz, "Show your reasoning" written questions, course mind map, exam recap audio |
| Clinical and life-science coursework | Pharmacology | mechanism → effect → caution flashcards, clinical-reasoning quiz, explain-the-mechanism written questions |
| Research paper digest | LLM Hallucinations, literature review | methods comparison spreadsheet, field digest report, "strengths and blind spots" critique audio, papers-and-ideas flashcards |
| Reading a company filing | Reading a 10-K | "find it, compute it, interpret it" quiz, analyst written questions, filing walkthrough report, filing literacy flashcards |
| Market and product research | Home Battery | market scan table, decision briefing, key-numbers infographic |
| Primary-source humanities | AP Gov | argument essay written questions (claim, evidence from the documents, reasoning, counter-argument), debate audio, timeline spreadsheet, document flashcards |
| Decision research | Career Research | option comparison table, mock-interview written questions, "which path?" debate audio, decision briefing |

The full prompt text is drafted and will go into the manifest for review in the PR.

After seeding, I'll read every Studio item for accuracy, for whether it follows its prompt, and for whether it's useful, and fix the prompts before asking you to publish.

---

## Decisions (approved 2026-10-19)

1. New notebooks: **Learn PyTorch from Scratch**, **AP U.S. Government: Founding Documents** and **Career Research**. Heat & Health, Web Security and Your First Paycheck are not included.
2. BSD-3 is allowed for the PyTorch "Learn the Basics" tutorials in that notebook only, with attribution kept in each source's licence. The NYU practicum video was left out because its course site may be CC BY-NC-SA.
3. The existing 7 notebooks are deleted on dev and reseeded, so every Studio item uses the new sources and prompts.
4. Getting Started practises on "The Moon". The guide gained a "Practise in this notebook" section and a note on the Prompt Library.
5. The prompt packs are published to the public Prompt Library when the seed runs with `publish: true`. Rollback: `npx convex run showcase/promptLibrary:unpublishShowcasePrompts '{"ownerEmail":"…"}'`.
