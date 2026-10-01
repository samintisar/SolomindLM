import type { EvalFixture } from "../../types";

/**
 * Professionals pack fixtures. Requests are phrased the way someone briefing a
 * team or a manager would ask. Most target one report, so they scope to it with
 * `studioParams.documentTitleHint` (like ticking one source in the app); the
 * cross-report mind map uses every source. Notebook and document ids are filled
 * in at run time from the seeded "Professionals" notebook, so they are never set
 * here.
 *
 * `expectedItems` holds only distinctive terms the output should contain;
 * `expectedAnswer` is a short reference for judges.
 */
const base = {
  schemaVersion: 1,
  useCase: "professionals",
} as const;

const tags = (...extra: string[]) => ["use-case", "professionals", "business", ...extra];

const BEIGE_BOOK = "beige-book";
const ENERGY_OUTLOOK = "steo";
const FEED_OUTLOOK = "feed-grains";
const FTC_REPORT = "ai-partnerships";

export const professionalsFixtures: EvalFixture[] = [
  // ─── smoke ────────────────────────────────────────────────
  {
    ...base,
    id: "professionals/report-beige-book-exec-summary",
    split: "smoke",
    runner: "report",
    question:
      "Write an executive summary of the latest Beige Book for our CFO: overall activity, labor, prices and outlook.",
    expectedItems: ["data center", "tariff"],
    expectedAnswer:
      "Activity increased modestly since early July (ten of twelve Districts grew slightly to moderately, two were " +
      "unchanged). Employment rose very slightly; skilled trades were hard to find; wage growth was modest to moderate. " +
      "Prices rose moderately, with elevated input costs for energy, transportation and metals and continued tariff " +
      "effects. Manufacturing picked up on defense and data center orders. Outlook positive but uncertain (energy " +
      "prices, policy, international conflict).",
    expectedBehavior:
      "A short executive summary up front, then sections on activity, labor markets, prices and outlook, all from the " +
      "Beige Book's National Summary. Uses the report's own qualitative terms (slight, modest, moderate) without " +
      "inventing figures or recommendations.",
    studioParams: {
      reportType: "briefing",
      customPrompt: "Executive summary for a CFO: overall activity, labor, prices and outlook.",
      documentTitleHint: BEIGE_BOOK,
    },
    expectedStructure: { requiredSections: ["Executive Summary"] },
    tags: tags("report", "economy"),
  },
  {
    ...base,
    id: "professionals/spreadsheet-energy-price-forecast",
    split: "smoke",
    runner: "spreadsheet",
    question:
      "Put the EIA's annual price forecasts into a table: Brent crude, retail gasoline and Henry Hub natural gas for 2025, 2026 and 2027.",
    expectedItems: ["Brent", "Henry Hub", "gasoline"],
    expectedAnswer:
      "Brent crude ($/barrel): 2025 $69, 2026 $91, 2027 $74. Retail gasoline ($/gallon): $3.10, $3.84, $3.35. " +
      "Henry Hub natural gas ($/MMBtu): $3.53, $3.43, $3.28. 2025 is history; 2026 and 2027 are forecasts.",
    expectedBehavior:
      "One row per price series with a column per year, units in the headers, values exactly as in the STEO " +
      "overview table, and forecast years marked as forecasts.",
    studioParams: {
      customPrompt:
        "Annual price forecasts: Brent crude, retail gasoline and Henry Hub natural gas for 2025, 2026 and 2027, with units.",
      documentTitleHint: ENERGY_OUTLOOK,
    },
    expectedStructure: { minItems: 3, jsonShape: "spreadsheet" },
    tags: tags("spreadsheet", "energy"),
  },

  // ─── train ────────────────────────────────────────────────
  {
    ...base,
    id: "professionals/chat-corn-forecast-cut",
    split: "train",
    runner: "chat",
    question: "Why did USDA cut its 2026 corn production forecast this month, and by how much?",
    expectedItems: ["178.5", "15.8 billion"],
    expectedAnswer:
      "NASS's first objective-yield estimate lowered the corn yield 2.2 bushels per acre to 178.5 and harvested area " +
      "by 86,000 acres to 88.5 million, cutting production 213 million bushels to 15.8 billion (down 1 percent). " +
      "Drought and heat in Plains States drove the largest cuts: Nebraska, North Dakota and Kansas. It is still " +
      "projected as the second-largest crop on record.",
    expectedBehavior:
      "Gives the cause (lower yield from the objective survey, slightly lower harvested area), the size of the cut " +
      "and the new total, with figures exactly as in the Feed Outlook.",
    studioParams: { documentTitleHint: FEED_OUTLOOK },
    tags: tags("chat", "agriculture"),
  },
  {
    ...base,
    id: "professionals/chat-ftc-areas-to-watch",
    split: "train",
    runner: "chat",
    question:
      "What does the FTC staff say we should watch in the cloud–AI developer partnerships? Keep it brief.",
    expectedItems: ["switching cost", "sensitive"],
    expectedAnswer:
      "Three areas to watch: how the partnerships may affect access to key inputs such as computing resources and " +
      "engineering talent; how contractual terms and technical barriers may raise switching costs for AI developers; " +
      "and the partnerships give the cloud partners access to sensitive technical and business information that may " +
      "be unavailable to others.",
    expectedBehavior:
      "Names the report's areas to watch (inputs, switching costs, sensitive information) as the FTC staff's " +
      "observations, without turning them into legal conclusions or advice.",
    studioParams: { documentTitleHint: FTC_REPORT },
    tags: tags("chat", "technology"),
  },
  {
    ...base,
    id: "professionals/chat-boston-vs-dallas",
    split: "train",
    runner: "chat",
    question: "How did the Boston and Dallas districts compare in this Beige Book?",
    expectedItems: ["Boston", "Dallas"],
    expectedAnswer:
      "Boston: activity expanded slightly, consumer spending grew only marginally, employment edged up, prices rose " +
      "slightly, and the outlook turned somewhat more pessimistic. Dallas: activity expanded moderately with growth " +
      "picking up in manufacturing, banking and energy, employment grew modestly, prices rose moderately (robustly " +
      "in manufacturing), drought hurt agriculture, and outlooks were stable to positive.",
    expectedBehavior:
      "Compares the two districts on activity, employment, prices and outlook, attributing each point to the right " +
      "district and using the report's own wording for the pace of change.",
    studioParams: { documentTitleHint: BEIGE_BOOK },
    tags: tags("chat", "economy"),
  },
  {
    ...base,
    id: "professionals/report-oil-market-briefing",
    split: "train",
    runner: "report",
    question:
      "Brief our logistics team on the oil and diesel outlook from the latest EIA Short-Term Energy Outlook.",
    expectedItems: ["Strait of Hormuz", "distillate"],
    expectedAnswer:
      "Brent averaged $91/b in August, $7/b above July, as global inventories fell about 400 million barrels this " +
      "year; EIA expects around $90/b in 2H26, falling to $74/b in 2027 as Middle East output recovers via the " +
      "Strait of Hormuz and alternative routes. U.S. distillate inventories are forecast to drop below 100 million " +
      "barrels in September and stay below the five-year low through much of 2027, keeping diesel prices high.",
    expectedBehavior:
      "Executive summary first, then crude prices and supply, and distillate/diesel inventories and prices, with " +
      "figures from the STEO and forecasts labelled as forecasts.",
    studioParams: {
      reportType: "briefing",
      customPrompt: "Briefing for a logistics team on the oil and diesel outlook.",
      documentTitleHint: ENERGY_OUTLOOK,
    },
    expectedStructure: { requiredSections: ["Executive Summary"] },
    tags: tags("report", "energy"),
  },
  {
    ...base,
    id: "professionals/spreadsheet-corn-state-changes",
    split: "train",
    runner: "spreadsheet",
    question:
      "Make a table of the states with the biggest month-to-month changes in the 2026 corn production forecast.",
    expectedItems: ["Nebraska", "North Dakota", "Kansas"],
    expectedAnswer:
      "Largest cuts: Nebraska −67 million bushels, North Dakota −48 million, Kansas −39 million. Largest increases: " +
      "Iowa +38 million, New York +20 million.",
    expectedBehavior:
      "One row per state with the change in million bushels and its direction, values exactly as in the Feed Outlook.",
    studioParams: {
      customPrompt:
        "States with the largest month-to-month changes in the 2026 corn production forecast, in million bushels.",
      documentTitleHint: FEED_OUTLOOK,
    },
    expectedStructure: { minItems: 3, jsonShape: "spreadsheet" },
    tags: tags("spreadsheet", "agriculture"),
  },
  {
    ...base,
    id: "professionals/mindmap-beige-book-themes",
    split: "train",
    runner: "mindmap",
    question: "Map the main themes of the latest Beige Book.",
    expectedItems: ["labor", "prices"],
    expectedAnswer:
      "Branches for overall activity (consumer spending, manufacturing, construction, agriculture), labor markets " +
      "(employment, availability, wages, AI effects) and prices (input costs, tariffs, health care and insurance), " +
      "plus district highlights.",
    expectedBehavior:
      "Groups the Beige Book's findings into its main themes with related points under each, no outside content.",
    studioParams: { documentTitleHint: BEIGE_BOOK },
    expectedStructure: { minItems: 5, jsonShape: "mindmap" },
    tags: tags("mindmap", "economy"),
  },

  // ─── holdout ──────────────────────────────────────────────
  {
    ...base,
    id: "professionals/report-ftc-board-summary",
    split: "holdout",
    runner: "report",
    question:
      "Summarize the FTC staff report on cloud provider and AI developer partnerships for our board.",
    expectedItems: ["Microsoft", "Anthropic", "switching"],
    expectedAnswer:
      "The FTC's 6(b) study of Microsoft-OpenAI, Amazon-Anthropic and Alphabet-Anthropic found the partnerships give " +
      "cloud partners significant equity and revenue-sharing rights and certain consultation, control and " +
      "exclusivity rights, and require AI developers to spend much of the investment on the partner's cloud. Areas to " +
      "watch: access to " +
      "inputs, switching costs, and access to sensitive information. Staff stress it is not a formal legal or " +
      "economic analysis.",
    expectedBehavior:
      "Board-level summary first, then key partnership terms and areas to watch, attributed to FTC staff and " +
      "keeping the report's caveat that it is not a legal finding.",
    studioParams: {
      reportType: "briefing",
      customPrompt: "Board-level summary of the key findings and areas to watch.",
      documentTitleHint: FTC_REPORT,
    },
    expectedStructure: { requiredSections: ["Executive Summary"] },
    tags: tags("report", "technology"),
  },
  {
    ...base,
    id: "professionals/mindmap-cross-report-risks",
    split: "holdout",
    runner: "mindmap",
    question: "Map the key risks and pressures across all my reports.",
    expectedItems: [],
    expectedAnswer:
      "Branches per report: Beige Book (input costs and tariffs, weak consumer demand, uncertainty about energy and " +
      "policy), STEO (constrained Middle East exports, low distillate inventories, high diesel prices), Feed Outlook " +
      "(drought and heat cutting corn yields), FTC report (input access, switching costs, sensitive information).",
    expectedBehavior:
      "Covers all four reports and keeps each risk under the report it comes from, without merging unrelated findings.",
    expectedStructure: { minItems: 5, jsonShape: "mindmap" },
    tags: tags("mindmap", "cross-report"),
  },
];
