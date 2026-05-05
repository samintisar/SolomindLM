/**
 * Job Helpers - Centralized mutations for job status updates
 *
 * This barrel file re-exports all job helper mutations from their
 * focused entity modules for backward compatibility.
 *
 * @deprecated Prefer importing directly from the entity-specific
 * modules (e.g., `./jobHelpers/flashcard`) for new code.
 */

// ─── Error Utilities ────────────────────────────────────────────────

export { jobErrorMetadataValidator, buildErrorMetadata } from "./jobHelpers/errors.js";

// ─── Document Helpers ───────────────────────────────────────────────

export {
  updateDocumentJobStatus,
  markDocumentJobFailed,
} from "./jobHelpers/document.js";

// ─── Flashcard Helpers ──────────────────────────────────────────────

export {
  updateFlashcardTitle,
  saveFlashcardResults,
  updateFlashcardStatus,
  markFlashcardFailed,
  initFlashcardMapPhase,
  storeFlashcardMapResult,
  clearFlashcardMapData,
} from "./jobHelpers/flashcard.js";

// ─── Quiz Helpers ───────────────────────────────────────────────────

export {
  saveQuizResults,
  updateQuizTitle,
  updateQuizStatus,
  markQuizFailed,
  initQuizMapPhase,
  storeQuizMapResult,
  clearQuizMapData,
} from "./jobHelpers/quiz.js";

// ─── Written Questions Helpers ──────────────────────────────────────

export {
  updateWrittenQuestionsTitle,
  saveWrittenQuestionsResults,
  updateWrittenQuestionsStatus,
  markWrittenQuestionsFailed,
  initWrittenQuestionsMapPhase,
  storeWrittenQuestionsMapResult,
  clearWrittenQuestionsMapData,
} from "./jobHelpers/writtenQuestions.js";

// ─── Report Helpers ─────────────────────────────────────────────────

export {
  saveReportResults,
  updateReportTitle,
  updateReportStatus,
  markReportFailed,
  initReportMapPhase,
  storeReportMapResult,
  clearReportMapData,
} from "./jobHelpers/report.js";

// ─── Mind Map Helpers ───────────────────────────────────────────────

export {
  saveMindMapResults,
  updateMindMapTitle,
  updateMindMapStatus,
  markMindMapFailed,
  initMindMapMapPhase,
  storeMindMapMapResult,
  clearMindMapMapData,
} from "./jobHelpers/mindmap.js";

// ─── Spreadsheet Helpers ────────────────────────────────────────────

export {
  saveSpreadsheetResults,
  updateSpreadsheetTitle,
  updateSpreadsheetStatus,
  markSpreadsheetFailed,
  initSpreadsheetMapPhase,
  storeSpreadsheetMapResult,
  clearSpreadsheetMapData,
} from "./jobHelpers/spreadsheet.js";

// ─── Audio Overview Helpers ─────────────────────────────────────────

export {
  saveAudioOverviewResults,
  updateAudioOverviewTitle,
  updateAudioOverviewStatus,
  markAudioOverviewFailed,
  initAudioOverviewMapPhase,
  storeAudioOverviewMapResult,
  clearAudioOverviewMapData,
} from "./jobHelpers/audioOverview.js";
