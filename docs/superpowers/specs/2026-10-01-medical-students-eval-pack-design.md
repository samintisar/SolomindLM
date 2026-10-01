# Medical Students eval pack — design

**Date:** 2026-10-01
**Status:** Approved; implemented on `feature/eval-pack-medical-students`
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

A pack that scores flashcards, quiz, written questions and chat on anatomy & physiology study material uploaded as PDF, with rubric checks that would apply to any medical study material.

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

**Sources:** four English Wikipedia articles at pinned revisions, licensed **CC BY-SA 4.0**. Commercial use is allowed, and nothing in the licence restricts ingestion into an AI product.

How we got here (2026-10-01, user decisions):

- **OpenStax *Anatomy and Physiology* 2e** was the first choice. It is CC BY-NC-SA 4.0 (non-commercial), and SolomindLM is a paid product.
- **The OpenStax 1st edition** carries CC BY 4.0 metadata, but its pages restrict reuse to non-commercial purposes. They also state the book "may not be used in the training of large language models or otherwise be ingested into large language models or generative AI offerings without OpenStax's prior written permission". That is our use.
- **NIH/NCI SEER Training** (US government) is too shallow: no cranial-nerve table, a three-sentence cardiac cycle, and no GFR material.

Each article is printed to PDF from its pinned revision URL (`https://en.wikipedia.org/w/index.php?title=<Title>&oldid=<revid>`) with headless Chrome (Playwright) and Wikipedia's own print stylesheet. Site notices and the old-revision banner are hidden, wide formulas are scaled to the page width, and raster figures wider than 1,200 px are downscaled to 1,200 px (JPEG) to keep files small; SVG images (e.g. math formulas) are otherwise passed through untouched. Text, tables and captions are not altered. The file still goes through OCR like an uploaded lecture PDF, with figures and tables. The trade-off is encyclopedic rather than lecture-style prose, including reference lists.

| File | Article (revision checked 2026-10-01) | What it stresses |
|---|---|---|
| `heart-anatomy.pdf` | [Heart](https://en.wikipedia.org/w/index.php?title=Heart&oldid=1375195018) | structure names in labelled figures |
| `cardiac-cycle.pdf` | [Cardiac cycle](https://en.wikipedia.org/w/index.php?title=Cardiac_cycle&oldid=1376968670) | phase order, valve timing, pressures and volumes |
| `cranial-nerves.pdf` | [Cranial nerves](https://en.wikipedia.org/w/index.php?title=Cranial_nerves&oldid=1357482168) | per-nerve function sections and the skull-exit table into one-fact items (the article has no nerve→function table) |
| `glomerular-filtration.pdf` | [Glomerular filtration rate](https://en.wikipedia.org/w/index.php?title=Glomerular_filtration_rate&oldid=1372412934) | mechanism, normal values, pressure balance |

The revision ids above are pinned; re-printing uses the same `oldid`, so the sources never drift. Target under 5 MB per file and under 15 MB for the pack. "Heart" is long (about 12,500 words), so it is the likeliest to exceed that; if it does, keep it and note the size.

**`LICENSES.md`:** a header gives the licence (CC BY-SA 4.0, https://creativecommons.org/licenses/by-sa/4.0/) and says the authors are the Wikipedia contributors listed in each article's history. It notes that each file is the pinned revision printed to PDF on 2026-10-01 with Wikipedia's print stylesheet, with figures wider than 1,200 px downscaled and text, tables and captions unaltered. It also notes that images keep their own licences, given on each image's Wikimedia Commons page. Below it is one entry per file in the format `validatePack` parses: `- <fileName>: CC BY-SA 4.0, Wikipedia, "<Title>", revision <revid> (<timestamp>), <oldid URL>, authors: <history URL>`. The `oldid` URLs are the reproduction record; the print script is not committed.

**Registration:** `evals/rag/usecases/index.ts` adds `registerPack(medicalStudentsPack, medicalStudentsFixtures)`. Whichever pack PR lands second resolves a one-line conflict there.

**Dev notebook:** the empty "Medical Students" notebook already in the eval owner's `Test` folder on dev (`jd71m7b9dgec4jnjahrg60xrd98fbyb8`) is reused. `eval:seed` creates it on any deployment that lacks it.

## 2. Fixtures

There are 10 fixtures: 2 smoke, 6 train, 2 holdout. Every source appears in at least two fixtures. Flashcards, quiz and chat have at least two fixtures each; written questions has one. Ids are `medical-students/<slug>`. `useCase` and `split` are always set; `notebookId` and `documentIds` never are.

Requests are worded the way a medical student asks. `studioParams.topic` carries the focus for studio runners. Every fixture has `expectedAnswer` (a short reference for judges) and `expectedBehavior`.

`expectedItems` lists distinctive terms that appear in the excerpts (e.g. "tricuspid", "abducens"). Unlike short grammar tokens, anatomy terms are long enough to match as substrings. Every term must appear in the source PDF's text, and is re-checked against the OCR'd text after seeding.

| Split | Slug | Runner | Params | What it stresses |
|---|---|---|---|---|
| smoke | `flashcards-heart-anatomy` | flashcards | 15 cards, medium | structure names from labelled figures |
| smoke | `quiz-cranial-nerves-easy` | quiz | 10 questions, easy | one fact per question about a single nerve |
| train | `flashcards-cranial-nerve-functions` | flashcards | 12 cards, medium | one card per nerve: name ↔ function |
| train | `quiz-cardiac-cycle` | quiz | 10 questions, medium | phase order, valve timing, pressures |
| train | `quiz-cardiovascular-mixed` | quiz | 10 questions, medium | spans heart anatomy and cardiac cycle |
| train | `written-questions-filtration` | writtenQuestions | 5 questions, medium | exam-style explanation of net filtration pressure |
| train | `chat-av-valve-closure` | chat | — | mechanism: why the AV valves close at the start of ventricular systole |
| train | `chat-normal-gfr` | chat | — | values: normal GFR and what determines it, with citations |
| holdout | `quiz-filtration-hard` | quiz | 8 questions, hard | Starling forces, autoregulation |
| holdout | `chat-lateral-gaze-nerve` | chat | — | applied: which nerve is affected if the eye cannot move laterally (answerable from the source) |

Holdout fixtures are never looked at while tuning.

## 3. Rubric

There are six checks. Each describes what any medical study output should do; none refers to these excerpts or fixtures.

| Id | Question (yes = pass) | Applies to | Evidence |
|---|---|---|---|
| `front-hides-answer` | Does every card's front avoid stating, abbreviating or hinting at the answer on its back? | flashcards | output |
| `one-fact-per-item` | Does each card or question test a single structure, function, value or step (one structure or nerve together with its functions counts as a single item)? | flashcards, quiz | output |
| `terms-and-values-exact` | Are all anatomical and physiological terms spelled correctly, and do all numbers and units match the source exactly? | flashcards, quiz, writtenQuestions, chat | sources |
| `answer-key-supported` | Is every answer, answer key and model answer supported by the source, with no distractor that is also correct? | flashcards, quiz, writtenQuestions | sources |
| `mechanism-in-order` | If the request or the output concerns a mechanism or process, does the output give the cause-and-effect steps in the order the source does, rather than just naming terms (or does neither the request nor the output concern a mechanism or process)? | chat, writtenQuestions | sources |
| `no-unsourced-clinical-claims` | Does the output avoid clinical claims (diagnoses, treatments, drug or dose facts) that the source does not contain? | chat, writtenQuestions | sources |

`mechanism-in-order` is conditional because the binary judge has no "not applicable" answer; without it, correct factoid chat answers would fail. The first two mirror the Language Learners checks, so answer leaks (#218) compare across use cases. Studio runners give judges the pack's OCR'd source text, up to the 48K-character budget; chat gives them its retrieved chunks.

## 4. Building and verification

**Excerpts:** print the four pinned Wikipedia revisions to PDF with Playwright (headless Chrome), hiding site notices and downscaling figures wider than 1,200 px. Check each file opens, has its article title near the top, has text in a PDF text dump with no notice text, keeps its figures, and that every embedded image is freely licensed (no non-free/fair-use files).

**Offline checks (required for the PR):**

- `bun run test:convex`: `registry.test.ts` validates every registered pack (files exist, licences listed, ids prefixed, splits set, runners in features, rubric checks apply to a feature).
- `bun run eval:usecases:dry` lists the 10 medical-students fixtures with no "INVALID PACK". The PR adds this step to CI unless #230 has already done so.
- `typecheck:convex`, `lint` and `knip` show no new findings.

**Live check (after user go-ahead; best effort):** the dev deployment is shared with other sessions and the Together key is credit-limited.

1. `bun run eval:seed -- --use-case medical-students` confirms all four PDFs reach `completed` through OCR. Then confirm the cranial-nerve tables and the GFR formulas survive as readable text, and that every `expectedItems` term appears in the extracted text (via `getPackSourceText`).
2. `bun run eval:rag -- --use-case medical-students --split smoke` runs 2 fixtures and shows the scorecard row.

These need, on this machine, a repo-root `.env` with `RAG_EVAL_CONVEX_URL`, `RAG_EVAL_SECRET` and `TOGETHER_AI_API_KEY`, and on dev, `RAG_EVALS_ENABLED`, `RAG_EVAL_SECRET` and `RAG_EVAL_OWNER_EMAIL`. If dev isn't ready, the PR ships on the offline checks and says the live run is pending.

## 5. Delivery

- Branch `feature/eval-pack-medical-students` from `main` (which includes #229). One PR, `Closes #270`.
- The PR body lists each source's page count and size, total source size, the live-check result or why it is pending, and the scorecard row if a live run happened.

## Out of scope

- Agent or prompt changes driven by this pack's scorecard.
- More medical subjects (pharmacology, pathology) or a mind-map runner.
- Generic answer-leak and answer-key grounding checks (piece 2 of the framework design).
