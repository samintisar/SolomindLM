# Professionals eval pack — design

Third use-case pack (framework: [`2026-09-29-use-case-eval-packs-design.md`](2026-09-29-use-case-eval-packs-design.md)).

## Claim under test

Landing page: "Summarize industry reports and stay updated with minimal reading time." Example: "Upload a market report → Get executive summary and key insights".

## Features

`report`, `chat`, `mindmap`, `spreadsheet`: executive summaries and briefings, follow-up questions, theme overviews, and pulling figures into a table. Study aids (flashcards, quizzes) are out of scope for this persona.

## Sources

Four U.S. federal reports (public domain, attribution only), each trimmed to about 25–30K characters of text so OCR stays cheap and the rubric judge sees most of each one:

| File | Report | Pages kept |
|---|---|---|
| `regional-economy-beige-book.pdf` | Federal Reserve Beige Book, 2 Sep 2026 | 1–12 (national summary, Boston), 48–51 (Dallas) |
| `energy-outlook-steo.pdf` | EIA Short-Term Energy Outlook, Sep 2026 | 1–14 (narrative), 32 (Table 2, prices) |
| `feed-grains-outlook.pdf` | USDA ERS Feed Outlook, Sep 2026 | all 13 |
| `ai-partnerships-ftc.pdf` | FTC AI Partnerships 6(b) staff report, Jan 2025 | 1, 4–6, 20–23, 41 |

Rejected: Wikipedia (doesn't read like a market report); OECD / World Bank CC BY reports (licences vary per title, some NC or no-AI terms); BLS releases (block scripted downloads).

## Scoping

Most professional requests target one report, the way a user ticks one source in the app. Pack fixtures therefore set `studioParams.documentTitleHint`, which needs the framework change in #290 (pack fixtures previously always got every pack document). One holdout mind map is deliberately unscoped and covers all four reports.

## Fixtures

10 fixtures: 2 smoke, 6 train, 2 holdout. Report ×3 (briefing type, `requiredSections: ["Executive Summary"]`), chat ×3, spreadsheet ×2, mind map ×2. `expectedItems` are distinctive terms or row labels; numeric correctness is left to the `numbers-exact` rubric check because short numbers match by accident.

## Rubric

| Check | Applies to | Evidence |
|---|---|---|
| `numbers-exact` | report, chat, spreadsheet, mindmap | sources |
| `forecast-not-fact` | report, chat, spreadsheet | sources |
| `attributed-correctly` | report, chat, mindmap | sources |
| `exec-summary-leads` | report | output |
| `table-cells-from-source` | spreadsheet | sources |
| `no-unsourced-advice` | report, chat | sources |

Checks describe any business report, never these files, and never go into production prompts.
