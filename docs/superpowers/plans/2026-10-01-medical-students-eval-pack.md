# Medical Students Eval Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the `medical-students` use-case eval pack: four OpenStax *Anatomy and Physiology* (1st edition, CC BY 4.0) sections printed to PDF, 10 fixtures and a six-check rubric, registered so `eval:usecases` scores it.

**Architecture:** A pack is a folder under `evals/rag/usecases/<id>/` with `manifest.ts`, `fixtures.ts` and `sources/` (+ `LICENSES.md`), registered in `evals/rag/usecases/index.ts`. The framework (#229, already on `main`) validates, seeds and runs it; this plan adds content only. No Convex, prompt or agent code changes.

**Tech Stack:** TypeScript (Bun), vitest (`vitest.convex.config.ts`), Playwright (repo dependency) with installed Chrome for printing, `pdftotext`/`pdfinfo` for checking PDFs.

**Spec:** [docs/superpowers/specs/2026-10-01-medical-students-eval-pack-design.md](../specs/2026-10-01-medical-students-eval-pack-design.md). **Issue:** #270. **Branch:** `feature/eval-pack-medical-students` (from `main`).

**Rules that apply throughout:**
- Rubric questions and fixture text must stay general to medical study material; never copy fixture specifics into production prompts (CLAUDE.md "Prompt authoring").
- Never kill processes by name; never use bare `git stash`.
- Run vitest with `TAVILY_API_KEY=` blanked so live discovery tests are skipped, as CI does.
- After editing any `.ts` file, run `bunx biome format --write <file>` before committing.

---

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `.cache/openstax/` | create (gitignored) | print and check scripts; never committed |
| `evals/rag/usecases/medical-students/sources/*.pdf` | create | the four 1st-edition sections printed to PDF |
| `evals/rag/usecases/medical-students/sources/LICENSES.md` | create | attribution + page range per file (parsed by `validatePack`) |
| `evals/rag/usecases/medical-students/manifest.ts` | create | `medicalStudentsPack: UseCasePack` (claim, features, sources, rubric) |
| `evals/rag/usecases/medical-students/fixtures.ts` | create | `medicalStudentsFixtures: EvalFixture[]` (10 fixtures) |
| `evals/rag/usecases/medical-students/pack.test.ts` | create | pins the spec's split counts, runner coverage and rubric ids |
| `evals/rag/usecases/index.ts` | modify | register the pack |
| `.github/workflows/ci.yml` | modify | add `eval:usecases:dry` step (skip if #230 already added it) |

Pack modules must import only types from `../types` and `../../types`; importing values from `evals/rag/fixtures` would be circular (see the comment in `index.ts`).

---

### Task 1: (done) Choose the source edition

The 2nd edition is CC BY-NC-SA 4.0 (non-commercial), so it was dropped (user decision, 2026-10-01). Sources are the **1st edition** (2013, CC BY 4.0), which is web-only. Nothing to do; Tasks 2–4 replace the old download/locate/cut steps.

---

### Task 2: Write the print script

**Files:**
- Create: `.cache/openstax/print.mjs` (gitignored by `.gitignore:120` `.cache`; never committed)

- [ ] **Step 1: Write the script**

```js
// .cache/openstax/print.mjs — usage: node print.mjs <slug> <out.pdf>
// Prints one OpenStax A&P 1e section to PDF with the site chrome and cookie banner hidden.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { chromium } from "playwright";

const MAX_WIDTH = 1200;
const [slug, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
// Downscale figures wider than MAX_WIDTH to keep the PDFs small (OpenStax serves ~300 dpi figures).
// Figure URLs (openstax.org/apps/image-cdn/v1/f=webp/...) have no file extension, so match by resource type.
await page.route("**/*", async (route) => {
  if (route.request().resourceType() !== "image") return route.continue();
  const response = await route.fetch();
  const body = await response.body();
  try {
    const img = await loadImage(body);
    if (img.width <= MAX_WIDTH) return route.fulfill({ response, body });
    const height = Math.round((img.height * MAX_WIDTH) / img.width);
    const canvas = createCanvas(MAX_WIDTH, height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, MAX_WIDTH, height);
    ctx.drawImage(img, 0, 0, MAX_WIDTH, height);
    return route.fulfill({ response, body: canvas.toBuffer("image/jpeg", 85), headers: { ...response.headers(), "content-type": "image/jpeg" } });
  } catch {
    return route.fulfill({ response, body }); // not decodable (e.g. svg): pass through
  }
});
await page.goto(`https://openstax.org/books/anatomy-and-physiology/pages/${slug}`, {
  waitUntil: "networkidle",
  timeout: 90_000,
});
await page.waitForSelector("main h1, [data-type='page'] h1, h1", { timeout: 30_000 });
// Load lazy images: scroll to the bottom in steps.
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 800) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 150));
  }
});
await page.waitForLoadState("networkidle");
// Hide the cookie/consent banner and fixed site chrome without interacting with them.
await page.addStyleTag({
  content: `
    #onetrust-consent-sdk, .onetrust-pc-dark-filter, [id*="cookie" i], [class*="cookie" i],
    [class*="consent" i], header, nav, footer, [data-testid="toolbar"], [data-testid="topbar"] { display: none !important; }
  `,
});
await page.emulateMedia({ media: "print" });
await page.pdf({ path: out, format: "Letter", printBackground: true, margin: { top: "0.5in", bottom: "0.5in", left: "0.5in", right: "0.5in" } });
await browser.close();
console.log(out);
```

Playwright (1.63) and `@napi-rs/canvas` are already in `node_modules`; `channel: "chrome"` uses the installed Google Chrome. Hiding the banner with CSS means no consent choice is made. Without the downscaling route the heart and cranial-nerve sections print at 19 MB and 14 MB.

---

### Task 3: Print the four sections and check them

**Files:**
- Create: `evals/rag/usecases/medical-students/sources/heart-anatomy.pdf`
- Create: `evals/rag/usecases/medical-students/sources/cardiac-cycle.pdf`
- Create: `evals/rag/usecases/medical-students/sources/cranial-nerves.pdf`
- Create: `evals/rag/usecases/medical-students/sources/glomerular-filtration.pdf`

- [ ] **Step 1: Print**

```bash
D=evals/rag/usecases/medical-students/sources
mkdir -p $D
node .cache/openstax/print.mjs 19-1-heart-anatomy $D/heart-anatomy.pdf
node .cache/openstax/print.mjs 19-3-cardiac-cycle $D/cardiac-cycle.pdf
node .cache/openstax/print.mjs 13-4-the-peripheral-nervous-system $D/cranial-nerves.pdf
node .cache/openstax/print.mjs 25-5-physiology-of-urine-formation $D/glomerular-filtration.pdf
```

- [ ] **Step 2: Check size, heading, banner text and the cranial nerve table**

```bash
ls -l $D/*.pdf                                    # each < 5 MB, total < 15 MB
for f in $D/*.pdf; do echo "== $f"; pdfinfo "$f" | grep Pages; pdftotext -l 1 "$f" - | head -2; done
for f in $D/*.pdf; do printf "%s banner hits: " "$f"; pdftotext "$f" - | grep -ciE "cookie|privacy notice|reject all|accept all"; done   # expected: 0 each
pdftotext -layout $D/cranial-nerves.pdf - | grep -ioE "olfactory|optic|oculomotor|trochlear|trigeminal|abducens|facial|vestibulocochlear|glossopharyngeal|vagus|accessory|hypoglossal" | tr A-Z a-z | sort -u | wc -l   # expected: 12
pdftotext $D/glomerular-filtration.pdf - | grep -ciE "net filtration pressure|GFR"   # expected: > 0
```

Expected: the first line of each file is its section heading (e.g. `19.3 Cardiac Cycle`); no banner text; all 12 cranial nerves; GFR material present.

- [ ] **Step 3: Check figures rendered**

```bash
pdfimages -list $D/heart-anatomy.pdf | head -5   # expected: image rows listed (figures present)
```

If `pdfimages` is unavailable, render a page (`pdftoppm -f 2 -l 2 -png -r 60 <file> .cache/openstax/check`) and look at it. If figures are blank, increase the scroll wait in `print.mjs` (e.g. 400 ms) and re-print. Also confirm figures are at most 1,200 px wide (`pdfimages -list`) and their labels are legible (render a figure page with `pdftoppm -r 100` and look at it). If a file still exceeds 5 MB, keep it and note the size in the PR body.

---

### Task 4: Write `LICENSES.md` and commit the sources

**Files:**
- Create: `evals/rag/usecases/medical-students/sources/LICENSES.md`

- [ ] **Step 1: Write the file**

`validatePack` parses lines of the form `- <fileName>: …` (file name followed directly by `:`). Check the author list against the 1st edition's preface or book page before committing.

```markdown
# Source licences: medical-students

All sources are from **Anatomy and Physiology** (1st edition) by J. Gordon Betts, Kelly A. Young, James A. Wise, Eddie Johnson, Brandon Poe, Dean H. Kruse, Oksana Korol, Jody E. Johnson, Mark Womble and Peter DeSaix, published by OpenStax (Rice University), 2013. Licensed under Creative Commons Attribution 4.0 International (CC BY 4.0, https://creativecommons.org/licenses/by/4.0/). Book: https://openstax.org/books/anatomy-and-physiology/pages/1-introduction

Each file is one whole section of the web edition, printed to PDF from openstax.org on 2026-10-01 with headless Chrome. Site navigation and the cookie banner were hidden before printing, and figures wider than 1,200 px were downscaled to 1,200 px (JPEG) to keep the files small; the section's text, captions and tables were not changed. The OpenStax name, OpenStax logo, OpenStax book covers, Rice University name and Rice University logo are not subject to the Creative Commons licence.

- heart-anatomy.pdf: CC BY 4.0, Anatomy and Physiology (1st edition), section 19.1 Heart Anatomy, printed from https://openstax.org/books/anatomy-and-physiology/pages/19-1-heart-anatomy
- cardiac-cycle.pdf: CC BY 4.0, Anatomy and Physiology (1st edition), section 19.3 Cardiac Cycle, printed from https://openstax.org/books/anatomy-and-physiology/pages/19-3-cardiac-cycle
- cranial-nerves.pdf: CC BY 4.0, Anatomy and Physiology (1st edition), section 13.4 The Peripheral Nervous System (includes the cranial nerves and their table), printed from https://openstax.org/books/anatomy-and-physiology/pages/13-4-the-peripheral-nervous-system
- glomerular-filtration.pdf: CC BY 4.0, Anatomy and Physiology (1st edition), section 25.5 Physiology of Urine Formation, printed from https://openstax.org/books/anatomy-and-physiology/pages/25-5-physiology-of-urine-formation
```

- [ ] **Step 2: Commit the sources**

```bash
git add evals/rag/usecases/medical-students/sources
git commit -m "feat(evals): add OpenStax A&P (1st edition) sources for the medical students pack" -m "Refs #270" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Write the pack test (failing)

**Files:**
- Create: `evals/rag/usecases/medical-students/pack.test.ts`

- [ ] **Step 1: Write the test**

It pins what the spec fixes (split counts, runner coverage, rubric ids) on top of the generic `registry.test.ts` validation.

```ts
import { describe, expect, it } from "vitest";
import { getPack } from "../index";
import { validatePack } from "../validate";

const RUNNERS = ["flashcards", "quiz", "writtenQuestions", "chat"] as const;

describe("medical-students pack", () => {
  const registered = getPack("medical-students");
  const { pack, fixtures } = registered;

  it("is valid", () => {
    expect(validatePack(registered)).toEqual([]);
  });

  it("has 2 smoke, 6 train and 2 holdout fixtures", () => {
    const count = (split: string) => fixtures.filter((f) => f.split === split).length;
    expect([count("smoke"), count("train"), count("holdout")]).toEqual([2, 6, 2]);
  });

  it("exercises every feature (written questions once, the rest at least twice)", () => {
    expect(pack.features).toEqual([...RUNNERS]);
    const count = (runner: string) => fixtures.filter((f) => f.runner === runner).length;
    expect(count("writtenQuestions")).toBeGreaterThanOrEqual(1);
    for (const runner of ["flashcards", "quiz", "chat"]) {
      expect(count(runner)).toBeGreaterThanOrEqual(2);
    }
  });

  it("has the six rubric checks from the spec", () => {
    expect(pack.rubric.map((c) => c.id)).toEqual([
      "front-hides-answer",
      "one-fact-per-item",
      "terms-and-values-exact",
      "answer-key-supported",
      "mechanism-in-order",
      "no-unsourced-clinical-claims",
    ]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
TAVILY_API_KEY= bunx vitest run --config vitest.convex.config.ts evals/rag/usecases/medical-students/pack.test.ts
```

Expected: FAIL with `Unknown use-case pack "medical-students". Registered: …`.

---

### Task 6: Write the manifest

**Files:**
- Create: `evals/rag/usecases/medical-students/manifest.ts`

- [ ] **Step 1: Write the manifest**

```ts
import type { UseCasePack } from "../types";

/**
 * Medical students: lecture material uploaded as PDF (here OpenStax anatomy &
 * physiology excerpts). Rubric checks describe what a good study aid looks like
 * for any medical content, not these particular sources.
 */
export const medicalStudentsPack: UseCasePack = {
  id: "medical-students",
  title: "Medical Students",
  notebookTitle: "Medical Students",
  advertisedClaim:
    "Turn dense lectures and research papers into memorizable flashcards and quizzes.",
  features: ["flashcards", "quiz", "writtenQuestions", "chat"],
  sources: [
    "heart-anatomy.pdf",
    "cardiac-cycle.pdf",
    "cranial-nerves.pdf",
    "glomerular-filtration.pdf",
  ],
  rubric: [
    {
      id: "front-hides-answer",
      question:
        "Does every card's front avoid stating, abbreviating or hinting at the answer given on its back?",
      appliesTo: ["flashcards"],
      evidence: "output",
    },
    {
      id: "one-fact-per-item",
      question:
        "Does each card or question test a single structure, function, value or step?",
      appliesTo: ["flashcards", "quiz"],
      evidence: "output",
    },
    {
      id: "terms-and-values-exact",
      question:
        "Are all anatomical and physiological terms spelled correctly, and do all numbers and units match the source exactly?",
      appliesTo: ["flashcards", "quiz", "writtenQuestions", "chat"],
      evidence: "sources",
    },
    {
      id: "answer-key-supported",
      question:
        "Is every answer, answer key and model answer supported by the source, with no distractor that is also correct?",
      appliesTo: ["flashcards", "quiz", "writtenQuestions"],
      evidence: "sources",
    },
    {
      id: "mechanism-in-order",
      question:
        "Does the explanation give the cause-and-effect steps of the mechanism in the order the source does, rather than just naming terms?",
      appliesTo: ["chat", "writtenQuestions"],
      evidence: "sources",
    },
    {
      id: "no-unsourced-clinical-claims",
      question:
        "Does the output avoid clinical claims (diagnoses, treatments, drug or dose facts) that the source does not contain?",
      appliesTo: ["chat", "writtenQuestions"],
      evidence: "sources",
    },
  ],
};
```

- [ ] **Step 2: Format**

```bash
bunx biome format --write evals/rag/usecases/medical-students/manifest.ts
```

---

### Task 7: Write the fixtures

**Files:**
- Create: `evals/rag/usecases/medical-students/fixtures.ts`

- [ ] **Step 1: Write the fixtures**

`expectedItems` uses only terms the output almost certainly contains (recall passes at ≥ 0.9), and only where the term is distinctive. Task 8 checks every term against the excerpt text.

```ts
import type { EvalFixture } from "../../types";

/**
 * Medical students pack fixtures. Requests are phrased the way a medical student
 * would ask; studio focus goes through `studioParams.topic`. Notebook and
 * document ids are filled in at run time from the seeded "Medical Students"
 * notebook, so they are never set here.
 *
 * `expectedItems` holds only distinctive terms the output should contain;
 * `expectedAnswer` is a short reference for judges.
 */
const base = {
  schemaVersion: 1,
  useCase: "medical-students",
} as const;

const tags = (...extra: string[]) => ["use-case", "medical-students", "anatomy", ...extra];

export const medicalStudentsFixtures: EvalFixture[] = [
  // ─── smoke ────────────────────────────────────────────────
  {
    ...base,
    id: "medical-students/flashcards-heart-anatomy",
    split: "smoke",
    runner: "flashcards",
    question: "Make flashcards from my heart anatomy lecture so I can learn the chambers, valves and vessels.",
    expectedItems: ["right atrium", "left ventricle", "tricuspid"],
    expectedAnswer:
      "Single-fact cards on the four chambers, the atrioventricular and semilunar valves, and the great vessels, " +
      "e.g. front: 'Valve between the right atrium and right ventricle' back: 'tricuspid valve'.",
    expectedBehavior:
      "Cards cover chambers, valves and great vessels from the lecture. Each card tests one structure, " +
      "the front does not give the answer away, and every term is spelled as in the source.",
    studioParams: { cardCount: 15, difficulty: "medium", topic: "heart chambers, valves and great vessels" },
    expectedStructure: { minItems: 10 },
    tags: tags("flashcards", "cardiovascular"),
  },
  {
    ...base,
    id: "medical-students/quiz-cranial-nerves-easy",
    split: "smoke",
    runner: "quiz",
    question: "Give me an easy quiz on the cranial nerves. I just started neuro.",
    expectedItems: [],
    expectedAnswer:
      "Short questions matching a cranial nerve to its main function or type, e.g. the optic nerve carries vision, " +
      "the hypoglossal nerve moves the tongue.",
    expectedBehavior:
      "Beginner questions, each testing one nerve's name, number, function or sensory/motor type from the table. " +
      "Exactly one option is correct and it matches the source.",
    studioParams: { questionCount: 10, difficulty: "easy", topic: "cranial nerve names and functions" },
    expectedStructure: { minItems: 8 },
    tags: tags("quiz", "nervous-system", "table"),
  },

  // ─── train ────────────────────────────────────────────────
  {
    ...base,
    id: "medical-students/flashcards-cranial-nerve-table",
    split: "train",
    runner: "flashcards",
    question: "Make one flashcard per cranial nerve: nerve on the front, what it does on the back.",
    expectedItems: [
      "olfactory",
      "optic",
      "oculomotor",
      "trochlear",
      "trigeminal",
      "abducens",
      "facial",
      "vestibulocochlear",
      "glossopharyngeal",
      "vagus",
      "accessory",
      "hypoglossal",
    ],
    expectedAnswer:
      "Twelve cards, one per cranial nerve, each giving that nerve's function from the table " +
      "(e.g. abducens: lateral eye movement; vagus: visceral control of thoracic and abdominal organs).",
    expectedBehavior:
      "One card for each of the twelve cranial nerves, built from the reference table. Functions match the table; " +
      "no card mixes two nerves.",
    studioParams: { cardCount: 12, difficulty: "medium", topic: "the twelve cranial nerves and their functions" },
    expectedStructure: { minItems: 12 },
    tags: tags("flashcards", "nervous-system", "table"),
  },
  {
    ...base,
    id: "medical-students/quiz-cardiac-cycle",
    split: "train",
    runner: "quiz",
    question: "Quiz me on the cardiac cycle: the phases, when the valves open and close, and the pressures.",
    expectedItems: [],
    expectedAnswer:
      "Questions on the order of atrial systole, ventricular systole (isovolumic contraction, ventricular ejection) and " +
      "ventricular diastole (isovolumic relaxation), on valve opening and closing as pressures change, and on volumes " +
      "such as end diastolic volume and stroke volume.",
    expectedBehavior:
      "Questions on phase order, valve timing and pressure or volume values from the lecture. " +
      "Exactly one option is correct per question, and every value matches the source.",
    studioParams: { questionCount: 10, difficulty: "medium", topic: "phases of the cardiac cycle, valve timing and pressures" },
    expectedStructure: { minItems: 8 },
    tags: tags("quiz", "cardiovascular", "process"),
  },
  {
    ...base,
    id: "medical-students/quiz-cardiovascular-mixed",
    split: "train",
    runner: "quiz",
    question: "Make a quiz that mixes heart structure with how the heart works during each beat.",
    expectedItems: [],
    expectedAnswer:
      "Questions that connect structures to the cycle, e.g. which valve closes when ventricular pressure exceeds atrial " +
      "pressure, or which chamber ejects blood into the aorta.",
    expectedBehavior:
      "Questions drawing on both the heart anatomy and the cardiac cycle material, some linking a structure to its role " +
      "in a phase. Exactly one correct option per question, consistent with the sources.",
    studioParams: { questionCount: 10, difficulty: "medium", topic: "heart structures and their roles in the cardiac cycle" },
    expectedStructure: { minItems: 8 },
    scenarioCategory: "multi-doc",
    tags: tags("quiz", "cardiovascular", "multi-doc"),
  },
  {
    ...base,
    id: "medical-students/written-questions-filtration",
    split: "train",
    runner: "writtenQuestions",
    question: "Give me exam-style short-answer questions on glomerular filtration, with model answers.",
    expectedItems: ["net filtration pressure"],
    expectedAnswer:
      "Questions such as 'Explain how net filtration pressure is calculated', with model answers that combine glomerular " +
      "blood hydrostatic pressure, capsular hydrostatic pressure and blood colloid osmotic pressure as the source does.",
    expectedBehavior:
      "Short-answer questions on filtration pressures and GFR. Model answers explain the mechanism step by step, " +
      "use the source's values and add no clinical claims the source lacks.",
    studioParams: { questionCount: 5, difficulty: "medium", topic: "glomerular filtration and net filtration pressure" },
    expectedStructure: { minItems: 4 },
    tags: tags("writtenQuestions", "renal", "mechanism"),
  },
  {
    ...base,
    id: "medical-students/chat-av-valve-closure",
    split: "train",
    runner: "chat",
    question: "Why do the AV valves close at the start of ventricular systole?",
    expectedItems: ["isovolumic contraction"],
    expectedAnswer:
      "When the ventricles begin to contract, ventricular pressure rises above atrial pressure, pushing blood back " +
      "against the atrioventricular valve cusps and closing them; with all valves closed, this is isovolumic contraction.",
    expectedBehavior:
      "Explains the pressure change that closes the AV valves, in the order the lecture gives it, with citations, " +
      "and names the isovolumic contraction phase.",
    scenarioCategory: "causality",
    tags: tags("chat", "cardiovascular", "mechanism"),
  },
  {
    ...base,
    id: "medical-students/chat-normal-gfr",
    split: "train",
    runner: "chat",
    question: "What's a normal GFR, and what sets the net filtration pressure?",
    expectedItems: ["125", "net filtration pressure"],
    expectedAnswer:
      "The source gives a normal GFR of about 125 mL/min. Net filtration pressure is glomerular blood hydrostatic pressure " +
      "minus capsular hydrostatic pressure and blood colloid osmotic pressure (about 55 − 15 − 30 = 10 mm Hg).",
    expectedBehavior:
      "Gives the normal GFR value and the three pressures that set net filtration pressure, with the source's numbers " +
      "and units and citations.",
    scenarioCategory: "factoid",
    tags: tags("chat", "renal", "values"),
  },

  // ─── holdout (never tune against these) ───────────────────
  {
    ...base,
    id: "medical-students/quiz-filtration-hard",
    split: "holdout",
    runner: "quiz",
    question: "Hard quiz on glomerular filtration: pressures, GFR and how the kidney keeps it steady.",
    expectedItems: [],
    expectedAnswer:
      "Harder questions on how each pressure changes net filtration pressure and GFR, and on the regulation of GFR " +
      "(autoregulation mechanisms) as the source describes them.",
    expectedBehavior:
      "Harder questions that require reasoning about pressure changes and GFR regulation. Exactly one correct option per " +
      "question, every value and mechanism consistent with the source.",
    studioParams: { questionCount: 8, difficulty: "hard", topic: "filtration pressures, GFR and its regulation" },
    expectedStructure: { minItems: 6 },
    tags: tags("quiz", "renal", "mechanism"),
  },
  {
    ...base,
    id: "medical-students/chat-lateral-gaze-nerve",
    split: "holdout",
    runner: "chat",
    question: "If a patient can't move one eye outward, which cranial nerve is most likely involved, based on my notes?",
    expectedItems: ["abducens", "lateral rectus"],
    expectedAnswer:
      "The abducens nerve (cranial nerve VI), which controls the lateral rectus muscle that moves the eye laterally.",
    expectedBehavior:
      "Names the abducens nerve and the lateral rectus from the cranial nerve material, with citations, " +
      "without adding diagnoses or treatments the notes do not contain.",
    scenarioCategory: "explanation",
    tags: tags("chat", "nervous-system", "applied"),
  },
];
```

- [ ] **Step 2: Format**

```bash
bunx biome format --write evals/rag/usecases/medical-students/fixtures.ts
```

---

### Task 8: Check fixture terms and values against the excerpts

**Files:**
- Create: `.cache/openstax/check_terms.py` (not committed)
- Possibly modify: `evals/rag/usecases/medical-students/fixtures.ts`

- [ ] **Step 1: Write the checker**

```python
# .cache/openstax/check_terms.py — every expectedItems term must appear in its excerpt text.
import subprocess

D = "evals/rag/usecases/medical-students/sources"
TERMS = {
    "heart-anatomy.pdf": ["right atrium", "left ventricle", "tricuspid"],
    "cranial-nerves.pdf": [
        "olfactory", "optic", "oculomotor", "trochlear", "trigeminal", "abducens",
        "facial", "vestibulocochlear", "glossopharyngeal", "vagus", "accessory",
        "hypoglossal", "lateral rectus",
    ],
    "cardiac-cycle.pdf": ["isovolumic contraction"],
    "glomerular-filtration.pdf": ["net filtration pressure", "125"],
}
missing = []
for name, terms in TERMS.items():
    text = subprocess.run(["pdftotext", f"{D}/{name}", "-"], capture_output=True, text=True).stdout
    flat = " ".join(text.split()).lower()
    for term in terms:
        if term.lower() not in flat:
            missing.append(f"{name}: {term}")
print("\n".join(missing) if missing else "all terms present")
```

- [ ] **Step 2: Run it**

```bash
python .cache/openstax/check_terms.py
```

Expected: `all terms present`. For any missing term, read the excerpt (`pdftotext -layout <file> - | less`) and change the fixture's `expectedItems` (and `expectedAnswer`) to the source's own wording or value. Drop the term only if the source doesn't cover it. If "lateral rectus" is absent from `cranial-nerves.pdf`, remove it from `chat-lateral-gaze-nerve.expectedItems`.

- [ ] **Step 3: Check the values in `expectedAnswer`**

```bash
pdftotext -layout evals/rag/usecases/medical-students/sources/glomerular-filtration.pdf - | grep -nE "mL/min|mm Hg|GFR" | head -20
pdftotext -layout evals/rag/usecases/medical-students/sources/cardiac-cycle.pdf - | grep -niE "isovolumic|end diastolic|stroke volume" | head -10
```

Make `chat-normal-gfr.expectedAnswer` and `written-questions-filtration.expectedAnswer` state exactly the GFR and pressure values the excerpt gives. Make `quiz-cardiac-cycle.expectedAnswer` use the excerpt's phase names.

---

### Task 9: Register the pack and make the pack test pass

**Files:**
- Modify: `evals/rag/usecases/index.ts` (imports at the top; the `USE_CASE_PACKS` array)

- [ ] **Step 1: Register**

Add after the existing imports:

```ts
import { medicalStudentsFixtures } from "./medical-students/fixtures";
import { medicalStudentsPack } from "./medical-students/manifest";
```

and change the registry:

```ts
export const USE_CASE_PACKS: RegisteredPack[] = [
  registerPack(medicalStudentsPack, medicalStudentsFixtures),
];
```

If `main` already registers the language-learners pack (#230 merged), keep its entry and add this one after it.

- [ ] **Step 2: Run the pack and registry tests**

```bash
bunx biome format --write evals/rag/usecases/index.ts
TAVILY_API_KEY= bunx vitest run --config vitest.convex.config.ts evals/rag/usecases
```

Expected: PASS, including `medical-students/pack.test.ts` and `registry.test.ts`. If `validatePack` reports problems, fix the named file (usually a `LICENSES.md` line not starting `- <fileName>:`).

- [ ] **Step 3: Dry runs**

```bash
bun run eval:usecases:dry 2>&1 | grep -E "Running|INVALID|medical-students/" | head -15
bun run eval:rag:dry 2>&1 | grep -E "Running [0-9]+ fixture"
```

Expected: the use-case dry run says `Running 10 fixture(s)` (plus 10 per other registered pack) and lists the medical-students ids, with no `INVALID PACK`. Plain `eval:rag:dry` still says `Running 94 fixture(s)` (pack fixtures excluded).

- [ ] **Step 4: Commit**

```bash
git add evals/rag/usecases/index.ts evals/rag/usecases/medical-students/manifest.ts evals/rag/usecases/medical-students/fixtures.ts evals/rag/usecases/medical-students/pack.test.ts
git commit -m "feat(evals): add Medical Students use-case pack

Four OpenStax A&P (1st edition) sections as PDF (heart anatomy, cardiac cycle,
cranial nerves, glomerular filtration), 10 fixtures across flashcards,
quiz, written questions and chat (smoke 2, train 6, holdout 2), and six
general rubric checks for medical study material.

Refs #270"
```

---

### Task 10: Run use-case dry runs in CI

**Files:**
- Modify: `.github/workflows/ci.yml` (after the `RAG eval fixture dry-run` step, around line 214)

- [ ] **Step 1: Check whether the step already exists**

```bash
grep -n "eval:usecases:dry" .github/workflows/ci.yml
```

If it prints a line (#230 merged first), skip to Task 11.

- [ ] **Step 2: Add the step**

Directly after:

```yaml
      - name: RAG eval fixture dry-run
        run: bun run eval:rag:dry
```

add:

```yaml

      - name: Use-case eval packs dry-run
        run: bun run eval:usecases:dry
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: dry-run use-case eval packs

Refs #270"
```

---

### Task 11: Verification gates

- [ ] **Step 1: Typecheck and lint**

```bash
bun run typecheck:convex
bunx biome check . --diagnostic-level=error
bunx knip --no-exit-code 2>&1 | grep -i "medical-students" || echo "knip: nothing for medical-students"
```

Expected: typecheck exit 0; Biome "No fixes applied" with no errors; Knip reports nothing under `medical-students`.

- [ ] **Step 2: Convex test suite**

```bash
TAVILY_API_KEY= bun run test:convex 2>&1 | grep -E "Test Files|Tests |FAIL"
```

Expected: all files pass, no `FAIL`.

---

### Task 12: Live check on dev (user go-ahead required; best effort)

Dev is shared with other sessions and the Together key is credit-limited. Ask the user before starting, and skip this task if they decline or the prerequisites are missing.

- [ ] **Step 1: Check prerequisites**

The repo-root `.env` (worktree root) needs `RAG_EVAL_CONVEX_URL`, `RAG_EVAL_SECRET` and `TOGETHER_AI_API_KEY`. The dev deployment needs `RAG_EVALS_ENABLED=true`, `RAG_EVAL_SECRET` and `RAG_EVAL_OWNER_EMAIL`, plus the #229 functions (on `main`):

```bash
for k in RAG_EVAL_CONVEX_URL RAG_EVAL_SECRET TOGETHER_AI_API_KEY; do grep -q "^$k=" .env && echo "$k set" || echo "$k MISSING"; done
npx convex env list 2>/dev/null | grep -oE "^(RAG_EVALS_ENABLED|RAG_EVAL_SECRET|RAG_EVAL_OWNER_EMAIL)"
```

If anything is missing, tell the user what (they can run `bun run eval:rag:bootstrap-env` and `npx convex env set RAG_EVAL_OWNER_EMAIL <email>`), and record "live check pending" for the PR.

- [ ] **Step 2: Seed**

```bash
bun run eval:seed -- --use-case medical-students
```

Expected: `ready: notebook jd71m7b9dgec4jnjahrg60xrd98fbyb8, 4 doc(s), N chunk(s), 4 changed`. OCR of four PDFs can take several minutes; if it times out, re-run (it resumes waiting).

- [ ] **Step 3: Check the OCR'd text keeps the terms**

```ts
// .cache/openstax/ocr_terms.ts — run with: bun --env-file=.env run .cache/openstax/ocr_terms.ts
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import { medicalStudentsFixtures } from "../../evals/rag/usecases/medical-students/fixtures";

const client = new ConvexHttpClient(process.env.RAG_EVAL_CONVEX_URL!.trim());
const evalSecret = process.env.RAG_EVAL_SECRET!.trim();
const nb = await client.action(api.eval.seedEvalAction.resolvePackNotebook, {
  evalSecret,
  notebookTitle: "Medical Students",
});
if (!nb) throw new Error("Medical Students notebook not found");
const texts = await client.action(api.eval.seedEvalAction.getPackSourceText, {
  evalSecret,
  documentIds: nb.docs.map((d) => d.documentId),
});
const all = texts.map((t) => t.text).join("\n").toLowerCase();
for (const f of medicalStudentsFixtures) {
  const missing = f.expectedItems.filter((term) => !all.includes(term.toLowerCase()));
  console.log(missing.length ? `${f.id}: MISSING ${missing.join(", ")}` : `${f.id}: ok`);
}
console.log(texts.map((t) => `${t.fileName}: ${t.text.length} chars`).join("\n"));
```

Expected: every fixture `ok`. A term missing here but present in Task 8's `pdftotext` check means OCR mangled it. Record it for the PR as an ingestion finding; don't change the fixture to match the mangled text.

- [ ] **Step 4: Smoke run**

```bash
bun run eval:rag -- --use-case medical-students --split smoke
```

Expected: 2 fixtures run, and the report ends with a `Use-case scorecard:` block containing a `medical-students` row per runner. Copy the scorecard into the PR body. Rubric failures are findings, not plan failures. The CLI exits 1 on metric failures; that is expected here.

---

### Task 13: Open the PR

- [ ] **Step 1: Push**

```bash
git push -u origin feature/eval-pack-medical-students
```

The pre-push hook runs typecheck, lint and design lint; all must pass.

- [ ] **Step 2: Create the PR**

```bash
gh pr create --base main --title "feat(evals): add Medical Students use-case pack" --body-file - <<'EOF'
## What
The Medical Students use-case eval pack (#270), on the framework from #229.

- **Sources:** four sections of OpenStax *Anatomy and Physiology* (1st edition, CC BY 4.0) printed to PDF, so they go through OCR like a lecture upload: <list each file with section, page count and size>. The 2nd edition is CC BY-NC-SA (non-commercial), so it is not used.
- **Fixtures:** 10 across flashcards, quiz, written questions and chat (smoke 2, train 6, holdout 2).
- **Rubric:** six checks for any medical study material: card fronts hide answers, one fact per item, terms and values exact, answer keys supported, mechanisms in source order, no unsourced clinical claims.
- **CI:** `eval:usecases:dry` <added | already added by #230>.

## Why
Closes #270

## How to test
- `bun run test:convex` (includes `evals/rag/usecases/medical-students/pack.test.ts` and `registry.test.ts`)
- `bun run eval:usecases:dry`
- Live: `bun run eval:seed -- --use-case medical-students`, then `bun run eval:rag -- --use-case medical-students --split smoke`

## Live check
<scorecard rows and OCR term check results from Task 12, or "pending: <what is missing>">

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Fill in every `<…>` from the actual results before running the command; none may remain in the posted body.

- [ ] **Step 3: Bind the PR in the app**

Call the ccd_pr `get_status` tool; if it does not report this PR, call `bind_pr` with the PR number.
