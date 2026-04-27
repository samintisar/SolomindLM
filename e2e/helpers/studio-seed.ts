import type { Page } from "@playwright/test";
import {
  PASTED_TEXT_TITLE,
  addPasteTextSource,
  waitForSourceStatus,
} from "./source-assertions";
import { openSourcesPanel } from "./navigation";

/**
 * Substantive pasted article for studio E2E: long enough for realistic chunking,
 * retrieval, and report outlines (not a single lorem line).
 */
function studioSeedArticle(runId: number): string {
  return [
    `E2E studio run ${runId} — Urban heat islands and mitigation (synthetic notes for automated tests).`,
    "",
    "Introduction",
    "Cities replace vegetation and moist surfaces with asphalt, concrete, and rooftops that absorb and re-radiate heat. The resulting urban heat island (UHI) effect can raise nighttime temperatures by several degrees Celsius compared with nearby rural areas. Warmer nights increase cooling demand, stress vulnerable populations, and interact with air quality and storm dynamics.",
    "",
    "Drivers and measurement",
    "Key drivers include reduced evapotranspiration, anthropogenic waste heat from buildings and vehicles, canyon geometry that traps radiation, and materials with low albedo. Planners measure UHI intensity with fixed weather stations, mobile transects, and satellite land-surface temperature products. Intercomparing methods matters because canopy-layer heat exposure differs from skin temperature seen from orbit.",
    "",
    "Mitigation strategies",
    "Green infrastructure—street trees, green roofs, and parks—restores shading and evapotranspiration. Cool roofs and cool pavements raise albedo and reduce sensible heat flux. Strategic urban form that channels breezes, preserves riparian corridors, and avoids wall-to-wall impervious cover can lower peak temperatures. Policies often combine codes (e.g. cool-roof requirements), incentives, and public investments in vulnerable neighborhoods.",
    "",
    "Equity and next steps",
    "UHI burdens are uneven: lower-income areas often have fewer trees, more industrial land uses, and older housing with limited insulation or air conditioning. Effective programs pair physical interventions with energy affordability and public health outreach. Research frontiers include neighborhood-scale modeling, evaluating co-benefits for carbon and stormwater, and designing monitoring networks that residents trust.",
  ].join("\n");
}

/**
 * Ingests pasted text so studio flows (report, mind map, etc.) that require
 * selected sources can run. Waits for processing to complete.
 */
export async function seedPastedTextSourceForStudio(page: Page) {
  const text = studioSeedArticle(Date.now());
  await openSourcesPanel(page);
  await addPasteTextSource(page, text);
  await waitForSourceStatus(page, PASTED_TEXT_TITLE, "completed", 180_000);
}
