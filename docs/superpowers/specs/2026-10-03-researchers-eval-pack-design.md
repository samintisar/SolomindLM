# Researchers eval pack — design

Fourth use-case pack (framework: [`2026-09-29-use-case-eval-packs-design.md`](2026-09-29-use-case-eval-packs-design.md)).

## Claim under test

Landing page: "Work through literature review mode with papers in your notebook." Example: "Upload research papers → Screen sources and draft a synthesis report".

Literature review mode does not read notebook papers; it searches arXiv, Semantic Scholar and PubMed (#301). So the pack tests the notebook-paper workflow researchers actually have (chat, synthesis report, comparison table, mind map) against committed papers, plus one literature review fixture as an end-to-end smoke judged on structure only, because its inputs come from live search.

## Sources

Four open-access CC BY 4.0 studies on one question, physical activity and depression in adults, one per design. A different field from the existing ML-only fixtures.

| File | Paper | Design |
|---|---|---|
| `meta-analysis-pearce-2022.pdf` | Pearce et al., JAMA Psychiatry 2022 | Dose-response meta-analysis, 15 cohorts, 191 130 adults |
| `cohort-tilda-2023.pdf` | Laird et al., JAMA Netw Open 2023 | Prospective cohort (TILDA), 4016 adults ≥50 |
| `rct-emotion-2018.pdf` | Lambert et al., J Med Internet Res 2018 | Pilot RCT (eMotion), 62 randomized |
| `cross-sectional-nhanes-2022.pdf` | Rutherford et al., BMC Public Health 2022 | Cross-sectional (NHANES), 10 047 adults |

Whole papers, references included, as a researcher would upload them. JAMA and JMIR block scripted downloads, so those three are the PMC open-access pages printed to PDF; the BMC paper is the publisher PDF.

## Fixtures

10: 2 smoke, 6 train, 2 holdout. Chat ×5, spreadsheet ×2, report ×1 (briefing), mind map ×1, literature review ×1. Single-paper questions scope to that paper with `documentTitleHint`; synthesis requests use all four. The studies partly disagree (diminishing returns, chronic-disease thresholds, leisure vs work/travel activity, pilot vs efficacy), which is what the synthesis fixtures probe.

## Rubric

| Check | Applies to | Evidence |
|---|---|---|
| `findings-attributed` | chat, report, spreadsheet, mindmap | sources |
| `numbers-exact` | chat, report, spreadsheet | sources |
| `association-not-causation` | chat, report, mindmap | sources |
| `conflicts-surfaced` | chat, report, mindmap | sources |
| `limitations-noted` | report | sources |
| `review-cites-sources` | literatureReview | output |

Checks describe any set of research papers, never these files, and never go into production prompts.
