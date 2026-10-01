# Medical Students eval pack — design

**Date:** 2026-10-01
**Status:** Approved in brainstorming, awaiting spec review
**Issue:** #270
**Builds on:** the use-case eval packs framework (#229, [design](2026-09-29-use-case-eval-packs-design.md)). Sibling of the Language Learners pack (#230).

## Problem

The landing page promises medical students: "Turn dense lectures and research papers into memorizable flashcards and quizzes." The example is "Upload an anatomy lecture → Generate a flashcard draft to review". No eval uses medical content, and no eval fixture goes through PDF OCR: the legacy fixtures use two English ML notebooks, and the Language Learners pack uses Markdown.

Medical study material fails in its own ways:

- labelled figures, whose labels and captions OCR scatters through the text;
- large reference tables, which must become correct one-fact cards;
- exact values and units, where a wrong number is a wrong answer;
- mechanisms, where the order of cause and effect is the content;
- invented clinical claims, which are worse here than in any other domain.

## Goal

A pack that scores flashcards, quiz, written questions and chat on real anatomy & physiology lecture material uploaded as PDF, with rubric checks that would apply to any medical study material.

**Non-goal:** tuning agents or prompts to this pack. Scorecard-driven fixes follow the CLAUDE.md prompt rule: general pipeline engineering only.

## 1. Layout and sources

```
evals/rag/usecases/medical-students/
  manifest.ts
  fixtures.ts
  sources/
    LICENSES.md
    heart-anatomy.pdf
    cardiac-cycle.pdf
    cranial-nerves.pdf
    glomerular-filtration.pdf
```

**Manifest:** `id: "medical-students"`, `title` and `notebookTitle: "Medical Students"`, `advertisedClaim` set to the landing-page line above, `features: ["flashcards", "quiz", "writtenQuestions", "chat"]`, `sources` listing the four PDFs.

**Sources:** OpenStax *Anatomy and Physiology 2e* (Rice University, CC BY 4.0). Each file is one contiguous page range cut unchanged from the official book PDF. Running headers, page numbers, figures, captions and tables stay as typeset, because that is what a student uploads.

| File | Section | What it stresses |
|---|---|---|
| `heart-anatomy.pdf` | §19.1 Heart Anatomy | structure names in labelled figures |
| `cardiac-cycle.pdf` | §19.3 Cardiac Cycle | phase order, valve timing, pressures and volumes |
| `cranial-nerves.pdf` | §13.4, the cranial nerves and their reference table | table rows into one-fact items |
| `glomerular-filtration.pdf` | §25.6 Physiology of Urine Formation | mechanism, normal values, pressure balance |

Section numbers and titles are confirmed against the downloaded PDF before cutting. If the book places a topic under a different number, the topic wins and `LICENSES.md` records the real section. Each excerpt starts at its section heading and ends where the next section begins, so it may include part of a neighbouring section's page. Target 1–3 MB per file and under 10 MB for the pack.

**`LICENSES.md`:** a header gives the book, authors, publisher, edition, licence (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/), the book URL, and a note that pages are reproduced unmodified and that the OpenStax name and logo are not covered by the licence. Below it is one entry per file in the format `validatePack` parses: `- <fileName>: CC BY 4.0, <section>, book pages <first>–<last> (PDF pages <first>–<last>)`. These page ranges are the reproduction record; no extraction script is committed.

**Registration:** `evals/rag/usecases/index.ts` adds `registerPack(medicalStudentsPack, medicalStudentsFixtures)`. Whichever pack PR lands second resolves a one-line conflict there.

**Dev notebook:** the empty "Medical Students" notebook already in the eval owner's `Test` folder on dev (`jd71m7b9dgec4jnjahrg60xrd98fbyb8`) is reused. `eval:seed` creates it on any deployment that lacks it.

## 2. Fixtures

There are 10 fixtures: 2 smoke, 6 train, 2 holdout. Every runner and every source appears at least twice. Ids are `medical-students/<slug>`. `useCase` and `split` are always set; `notebookId` and `documentIds` never are.

Requests are worded the way a medical student asks. `studioParams.topic` carries the focus for studio runners. Every fixture has `expectedAnswer` (a short reference for judges) and `expectedBehavior`.

`expectedItems` lists distinctive terms that appear in the excerpts (e.g. "tricuspid", "abducens"). Unlike short grammar tokens, anatomy terms are long enough to match as substrings. Every term must appear in the source PDF's text, and is re-checked against the OCR'd text after seeding.

| Split | Slug | Runner | Params | What it stresses |
|---|---|---|---|---|
| smoke | `flashcards-heart-anatomy` | flashcards | 15 cards, medium | structure names from labelled figures |
| smoke | `quiz-cranial-nerves-easy` | quiz | 10 questions, easy | one fact per question from the table |
| train | `flashcards-cranial-nerve-table` | flashcards | 12 cards, medium | table rows → name ↔ function cards |
| train | `quiz-cardiac-cycle` | quiz | 10 questions, medium | phase order, valve timing, pressures |
| train | `quiz-cardiovascular-mixed` | quiz | 10 questions, medium | spans heart anatomy and cardiac cycle |
| train | `written-questions-filtration` | writtenQuestions | 5 questions, medium | exam-style explanation of net filtration pressure |
| train | `chat-av-valve-closure` | chat | — | mechanism: why the AV valves close at the start of ventricular systole |
| train | `chat-normal-gfr` | chat | — | values: normal GFR and what determines it, with citations |
| holdout | `quiz-filtration-hard` | quiz | 8 questions, hard | Starling forces, autoregulation |
| holdout | `chat-lateral-gaze-nerve` | chat | — | applied: which nerve is affected if the eye cannot move laterally (answerable from the table) |

Holdout fixtures are never looked at while tuning.

## 3. Rubric

There are six checks. Each describes what any medical study output should do; none refers to these excerpts or fixtures.

| Id | Question (yes = pass) | Applies to | Evidence |
|---|---|---|---|
| `front-hides-answer` | Does every card's front avoid stating, abbreviating or hinting at the answer on its back? | flashcards | output |
| `one-fact-per-item` | Does each card or question test a single structure, function, value or step? | flashcards, quiz | output |
| `terms-and-values-exact` | Are all anatomical and physiological terms spelled correctly, and do all numbers and units match the source exactly? | flashcards, quiz, writtenQuestions, chat | sources |
| `answer-key-supported` | Is every answer, answer key and model answer supported by the source, with no distractor that is also correct? | flashcards, quiz, writtenQuestions | sources |
| `mechanism-in-order` | Does the explanation give the cause→effect steps of the mechanism in the order the source does, rather than just naming terms? | chat, writtenQuestions | sources |
| `no-unsourced-clinical-claims` | Does the output avoid clinical claims (diagnoses, treatments, drug or dose facts) that the source does not contain? | chat, writtenQuestions | sources |

The first two mirror the Language Learners checks, so answer leaks (#218) compare across use cases. Studio runners give judges the pack's OCR'd source text, up to the 48K-character budget; chat gives them its retrieved chunks.

## 4. Building and verification

**Excerpts:** download the OpenStax *A&P 2e* PDF once, asking the user first and stating its size. Cut the four page ranges with a local PDF tool (qpdf, or `pdf-lib` if already installed). Check each file opens, starts at its section heading and has text in a PDF text dump.

**Offline checks (required for the PR):**

- `bun run test:convex`: `registry.test.ts` validates every registered pack (files exist, licences listed, ids prefixed, splits set, runners in features, rubric checks apply to a feature).
- `bun run eval:usecases:dry` lists the 10 medical-students fixtures with no "INVALID PACK". The PR adds this step to CI unless #230 has already done so.
- `typecheck:convex`, `lint` and `knip` show no new findings.

**Live check (after user go-ahead; best effort):** the dev deployment is shared with other sessions and the Together key is credit-limited.

1. `bun run eval:seed -- --use-case medical-students` confirms all four PDFs reach `completed` through OCR. Then confirm the cranial-nerve table survives as readable text, and that every `expectedItems` term appears in the extracted text (via `getPackSourceText`).
2. `bun run eval:rag -- --use-case medical-students --split smoke` runs 2 fixtures and shows the scorecard row.

These need, on this machine, a repo-root `.env` with `RAG_EVAL_CONVEX_URL`, `RAG_EVAL_SECRET` and `TOGETHER_AI_API_KEY`, and on dev, `RAG_EVALS_ENABLED`, `RAG_EVAL_SECRET` and `RAG_EVAL_OWNER_EMAIL`. If dev isn't ready, the PR ships on the offline checks and says the live run is pending.

## 5. Delivery

- Branch `feature/eval-pack-medical-students` from `main` (which includes #229). One PR, `Closes #270`.
- The PR body lists the page ranges, total source size, the live-check result or why it is pending, and the scorecard row if a live run happened.

## Out of scope

- Agent or prompt changes driven by this pack's scorecard.
- More medical subjects (pharmacology, pathology) or a mind-map runner.
- Generic answer-leak and answer-key grounding checks (piece 2 of the framework design).
