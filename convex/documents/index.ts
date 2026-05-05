// Barrel file: re-exports all document operations to preserve api.documents.index.* paths

// Public CRUD
export {
  generateUploadUrl,
  upload,
  get,
  list,
  update,
  remove,
  removeMany,
} from "./public";

// Content retrieval
export { getContent, getSignedUrl } from "./content";

// Chunk operations
export {
  listChunksByDocument,
  getChunks,
  listChunksByNotebook,
  storeChunk,
} from "./chunks";

// Search
export { keywordSearch, fetchChunks } from "./search";

// External sources
export { addExternalSources } from "./sources";

// Source guide
export {
  getDocumentInternal,
  getDocumentChunksInternal,
  getSourceGuide,
  setSourceGuide,
} from "./guide";

// Internal state operations
export {
  updateStatus,
  updateTitle,
  updateMetadata,
  patch,
  setExtractedMarkdown,
  setDocumentFileUrl,
  prepareDocumentReembed,
} from "./internalOps";

// Refresh pipeline helpers
export {
  userCanAccessStorage,
  listDocumentsForNotebookReadInternal,
  listDocumentsForNotebookRefresh,
  getDocumentForRefresh,
  getDocumentDetails,
  getDocumentsByIds,
} from "./refresh";
