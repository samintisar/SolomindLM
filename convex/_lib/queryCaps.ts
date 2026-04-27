/**
 * Hard caps for single-request reads (avoid unbounded .collect() on growing tables).
 */
export const MAX_USER_WIDE_DOCUMENTS = 500;
export const MAX_MESSAGES_PER_CONVERSATION = 10_000;
/** When counting documents per notebook in folder UI; beyond this, show a capped value. */
export const MAX_DOCS_TO_COUNT = 10_000;
