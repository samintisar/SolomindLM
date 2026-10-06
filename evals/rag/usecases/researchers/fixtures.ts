import type { EvalFixture } from "../../types";

/**
 * Researchers pack fixtures. Requests are phrased the way a researcher working
 * through a set of papers would ask. Questions about one paper scope to it with
 * `studioParams.documentTitleHint` (like ticking one source in the app);
 * synthesis requests use every paper. The literature review fixture includes all
 * four papers and searches external databases as well (#301), so it should cite
 * both; each pack paper is checked by its first author or cohort name. Notebook and document
 * ids are filled in at run time from the seeded "Researchers" notebook, so they
 * are never set here.
 *
 * `expectedItems` holds only distinctive terms the output should contain;
 * `expectedAnswer` is a short reference for judges.
 */
const base = {
  schemaVersion: 1,
  useCase: "researchers",
} as const;

const tags = (...extra: string[]) => ["use-case", "researchers", "public-health", ...extra];

const META_ANALYSIS = "meta-analysis";
const COHORT = "cohort";
const TRIAL = "rct";
const CROSS_SECTIONAL = "cross-sectional";

export const researchersFixtures: EvalFixture[] = [
  // ─── smoke ────────────────────────────────────────────────
  {
    ...base,
    id: "researchers/spreadsheet-study-comparison",
    split: "smoke",
    runner: "spreadsheet",
    question:
      "Make a comparison table of my four papers: design, population, sample size, how physical activity and depression were measured, and the main finding.",
    expectedItems: ["meta-analysis", "cohort", "cross-sectional", "PHQ"],
    expectedAnswer:
      "Pearce 2022: meta-analysis of 15 prospective cohorts, 191 130 adults; 8.8 mMET-h/wk linked to 25% lower " +
      "depression risk. Laird 2023: TILDA cohort, 4016 adults aged ≥50, IPAQ and CES-D/CIDI; 400 to <600 MET-min/wk " +
      "linked to 43% lower odds of depression. Lambert 2018: eMotion pilot RCT, 62 randomized adults with depressive " +
      "symptoms, PHQ-8 and accelerometers; feasible, exploratory PHQ-8 difference −3.6. Rutherford 2022: NHANES " +
      "2011–2014 cross-sectional, 10 047 US adults, GPAQ and PHQ-9; leisure-time MVPA ≥150 min/wk linked to lower " +
      "depression, work and travel activity not.",
    expectedBehavior:
      "One row per paper with the requested columns, each cell taken from that paper, designs named correctly and " +
      "observational findings stated as associations.",
    studioParams: {
      customPrompt:
        "Compare the papers: design, population, sample size, physical activity measure, depression measure, main finding.",
    },
    expectedStructure: { minItems: 4, jsonShape: "spreadsheet" },
    tags: tags("spreadsheet", "synthesis"),
  },
  {
    ...base,
    id: "researchers/chat-meta-analysis-dose",
    split: "smoke",
    runner: "chat",
    question:
      "How much physical activity did the meta-analysis link to a lower risk of depression, and by how much?",
    expectedItems: ["4.4", "8.8"],
    expectedAnswer:
      "Relative to no activity, half the recommended volume (4.4 mMET-h/wk) was associated with 18% (95% CI 13%–23%) " +
      "lower risk and the recommended 8.8 mMET-h/wk with 25% (18%–32%) lower risk, with diminishing additional " +
      "benefit and more uncertainty beyond that. The association was curvilinear and heterogeneity was large " +
      "(I² = 74%).",
    expectedBehavior:
      "Gives both volumes with their risk reductions and confidence intervals as reported, as associations from " +
      "prospective cohorts, and mentions the diminishing returns.",
    studioParams: { documentTitleHint: META_ANALYSIS },
    tags: tags("chat", "meta-analysis"),
  },

  // ─── train ────────────────────────────────────────────────
  {
    ...base,
    id: "researchers/report-evidence-synthesis",
    split: "train",
    runner: "report",
    question:
      "Draft a short synthesis of what my four papers say about physical activity and depression: where they agree, where they differ, and their limitations.",
    expectedItems: ["leisure", "pilot"],
    expectedAnswer:
      "Agreement: more physical activity is associated with less depression (meta-analysis, cohort, cross-sectional), " +
      "with the steepest gains at low volumes. Differences: benefit plateaus at higher volumes (meta-analysis); " +
      "thresholds differ with chronic disease (TILDA); only leisure-time activity, not work or travel, is linked to " +
      "lower depression (NHANES); the eMotion trial is a pilot showing feasibility, not efficacy. Limitations: " +
      "observational designs, self-reported activity, heterogeneity, small pilot sample.",
    expectedBehavior:
      "Summary first, then agreements, differences and limitations, each point tied to the right study and design, " +
      "observational results as associations.",
    studioParams: {
      reportType: "briefing",
      customPrompt:
        "Evidence synthesis: agreements, differences and limitations across the papers.",
    },
    expectedStructure: { requiredSections: ["Executive Summary"] },
    tags: tags("report", "synthesis"),
  },
  {
    ...base,
    id: "researchers/chat-tilda-dose-chronic-disease",
    split: "train",
    runner: "chat",
    question:
      "In the TILDA cohort, what activity dose was linked to lower depression, and did it differ for people with chronic disease?",
    expectedItems: ["400", "chronic disease"],
    expectedAnswer:
      "Overall, 400 to <600 MET-min/wk was associated with a 16% lower rate of depressive symptoms (AIRR 0.84) and 43% " +
      "lower odds of depression (AOR 0.57) versus 0 MET-min/wk. With chronic disease, 600 to <1200 MET-min/wk was " +
      "associated with an 8% lower rate (AIRR 0.92) and 44% lower odds (AOR 0.56); without disease, more than 2400 " +
      "MET-min/wk was needed for similar protection against depressive symptoms (AIRR 0.81).",
    expectedBehavior:
      "Gives the dose bands and estimates exactly as reported, contrasts the chronic-disease subgroup, and keeps them " +
      "as associations from a cohort study.",
    studioParams: { documentTitleHint: COHORT },
    tags: tags("chat", "cohort"),
  },
  {
    ...base,
    id: "researchers/chat-nhanes-activity-domains",
    split: "train",
    runner: "chat",
    question: "Did every kind of physical activity relate to depression in the NHANES study?",
    expectedItems: ["leisure", "work", "travel"],
    expectedAnswer:
      "No. Total MVPA and leisure-time MVPA of at least 150 min/wk were associated with lower depression scores, but " +
      "work and travel physical activity were not associated with depression. BMI did not moderate these " +
      "relationships. It is cross-sectional, so it cannot show direction.",
    expectedBehavior:
      "Separates the domains, reports which were associated and which were not, and notes the cross-sectional design.",
    studioParams: { documentTitleHint: CROSS_SECTIONAL },
    tags: tags("chat", "cross-sectional"),
  },
  {
    ...base,
    id: "researchers/chat-do-studies-agree",
    split: "train",
    runner: "chat",
    question: "Do my papers agree that more physical activity always means less depression?",
    expectedItems: ["leisure", "work"],
    expectedAnswer:
      "Not entirely. The meta-analysis finds a curvilinear association with diminishing additional benefit above " +
      "8.8 mMET-h/wk; TILDA finds different dose thresholds with and without chronic disease; NHANES finds only " +
      "leisure-time activity, not work or travel activity, associated with lower depression; the eMotion pilot " +
      "trial was not designed to test efficacy.",
    expectedBehavior:
      "Answers no, with each nuance attributed to the right paper, and does not merge the findings into one claim.",
    tags: tags("chat", "synthesis"),
  },
  {
    ...base,
    id: "researchers/chat-each-paper-activity-measure",
    split: "train",
    runner: "chat",
    question: "How did each of my four papers measure physical activity?",
    // One term per paper, so the answer only passes if every selected source contributed.
    expectedItems: ["mMET", "IPAQ", "acceleromet", "GPAQ"],
    expectedAnswer:
      "Pearce 2022 harmonised the cohorts' self-reported activity into marginal MET-hours per week (mMET-h/wk); " +
      "Laird 2023 (TILDA) used the self-reported IPAQ; Lambert 2018 (eMotion) used accelerometers alongside " +
      "self-report; Rutherford 2022 (NHANES) used the self-reported GPAQ, split into work, travel and leisure domains.",
    expectedBehavior:
      "Covers all four papers, one measure per paper attributed to the right study, and says nothing is missing " +
      "for any of them.",
    tags: tags("chat", "synthesis", "multi-source"),
  },
  {
    ...base,
    id: "researchers/spreadsheet-meta-analysis-risk",
    split: "train",
    runner: "spreadsheet",
    question:
      "Tabulate the meta-analysis's relative risks of depression at each physical activity volume, with confidence intervals.",
    expectedItems: ["0.82", "0.75", "0.72"],
    expectedAnswer:
      "Depression RR (95% CI) relative to 0 mMET-h/wk: 4.4 → 0.82 (0.77–0.87); 8.8 → 0.75 (0.68–0.82); 17.5 → 0.72 " +
      "(0.64–0.81). Major depression: 0.83, 0.75, 0.74. Elevated depressive symptoms: 0.80, 0.73, 0.70.",
    expectedBehavior:
      "One row per outcome or volume with the relative risk and confidence interval exactly as in Table 2, units in " +
      "the headers.",
    studioParams: {
      customPrompt:
        "Relative risks of depression with 95% CIs at each physical activity volume (mMET-h/wk).",
      documentTitleHint: META_ANALYSIS,
    },
    expectedStructure: { minItems: 3, jsonShape: "spreadsheet" },
    tags: tags("spreadsheet", "meta-analysis"),
  },
  {
    ...base,
    id: "researchers/mindmap-evidence-map",
    split: "train",
    runner: "mindmap",
    question: "Map the evidence on physical activity and depression across my papers.",
    expectedItems: ["leisure", "dose"],
    expectedAnswer:
      "Branches by study or theme: dose-response (meta-analysis, TILDA thresholds), type of activity (NHANES " +
      "leisure vs work and travel), intervention (eMotion pilot feasibility), and limitations.",
    expectedBehavior:
      "Organises findings by study or theme with each finding under the paper it comes from and no outside content.",
    expectedStructure: { minItems: 6, jsonShape: "mindmap" },
    tags: tags("mindmap", "synthesis"),
  },

  // ─── holdout ──────────────────────────────────────────────
  {
    ...base,
    id: "researchers/chat-emotion-trial-conclusion",
    split: "holdout",
    runner: "chat",
    question:
      "Was the eMotion trial big enough to show the intervention works? What did it actually conclude?",
    expectedItems: ["pilot", "feasib"],
    expectedAnswer:
      "No: it was a pilot RCT (62 randomized, 81% followed up on PHQ-8) assessing feasibility and acceptability. " +
      "Exploratory analysis showed lower PHQ-8 in the intervention group at 2 months (adjusted mean difference −3.6, " +
      "95% CI −6.1 to −1.1), but the authors conclude only that delivery was feasible and the intervention is ready " +
      "for a full-scale trial, with engagement to improve.",
    expectedBehavior:
      "Says it was not powered to show efficacy, reports the exploratory result as exploratory, and gives the " +
      "authors' feasibility conclusion.",
    studioParams: { documentTitleHint: TRIAL },
    tags: tags("chat", "trial"),
  },
  {
    ...base,
    id: "researchers/literature-review-dose-response",
    split: "holdout",
    runner: "literatureReview",
    question:
      "What is the dose-response relationship between physical activity and depression in adults?",
    // One entry per pack paper (any of its words counts): the review must include and cite all four.
    // Terms a search-only review also produces ("NHANES"; "Laird" is a co-author of Pearce) are avoided.
    expectedItems: [
      "depression",
      "physical activity",
      "Pearce",
      "TILDA Irish",
      "Lambert",
      "Rutherford",
    ],
    expectedBehavior:
      "Includes the four papers from the notebook without screening them out, adds papers found by searching " +
      "academic databases, extracts a table and writes a structured narrative review that cites both the " +
      "notebook papers and the search results it includes.",
    expectedStructure: {
      minItems: 1,
      requiredSections: ["Introduction", "Methods", "Results", "Discussion", "Conclusion"],
    },
    tags: tags("literature-review"),
  },
];
