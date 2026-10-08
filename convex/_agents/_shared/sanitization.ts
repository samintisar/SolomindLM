"use node";
/**
 * Content sanitization utility for LLM agent operations.
 *
 * Provides input sanitization to prevent prompt injection and
 * ensure user-generated content is safe for LLM processing.
 */

/**
 * Configuration for sanitization behavior.
 */
export interface SanitizeConfig {
  /** Maximum length in characters (default: 5000) */
  maxLength?: number;
  /** Maximum consecutive newlines allowed (default: 2) */
  maxNewlines?: number;
  /** Whether to remove role markers like 'system:', 'assistant:', 'user:' (default: true) */
  removeRoleMarkers?: boolean;
  /** Whether to remove special tokens like <|...|> (default: true) */
  removeSpecialTokens?: boolean;
  /** Whether to trim whitespace (default: true) */
  trimWhitespace?: boolean;
  /** Whether to remove or escape HTML/XML tags (default: false) */
  escapeHtml?: boolean;
}

/**
 * Default sanitization configuration.
 */
const DEFAULT_SANITIZE_CONFIG: Required<Omit<SanitizeConfig, "maxLength" | "escapeHtml">> = {
  maxNewlines: 2,
  removeRoleMarkers: true,
  removeSpecialTokens: true,
  trimWhitespace: true,
};

/**
 * Sanitizes user input to prevent prompt injection and other security issues.
 *
 * @param input - User input string to sanitize
 * @param config - Optional sanitization configuration
 * @returns Sanitized string safe for LLM processing
 *
 * @example
 * ```typescript
 * const safe = sanitizeUserInput(topic);
 * const safeLimited = sanitizeUserInput(customPrompt, { maxLength: 1000 });
 * ```
 */
export function sanitizeUserInput(input: string, config: SanitizeConfig = {}): string {
  if (!input) return "";

  const fullConfig = {
    ...DEFAULT_SANITIZE_CONFIG,
    ...config,
    maxLength: config.maxLength ?? 5000,
  };

  let result = input;

  // Truncate to max length
  if (fullConfig.maxLength > 0) {
    result = result.substring(0, fullConfig.maxLength);
  }

  // Limit consecutive newlines
  if (fullConfig.maxNewlines > 0) {
    result = result.replace(
      new RegExp(`\\n{${fullConfig.maxNewlines + 1},}`, "g"),
      "\n".repeat(fullConfig.maxNewlines)
    );
  }

  // Remove role markers that could be used for prompt injection
  if (fullConfig.removeRoleMarkers) {
    result = result
      .replace(/system:\s*/gi, "")
      .replace(/assistant:\s*/gi, "")
      .replace(/user:\s*/gi, "")
      .replace(/\\system:\s*/gi, "")
      .replace(/\\assistant:\s*/gi, "")
      .replace(/\\user:\s*/gi, "");
  }

  // Remove special tokens that could affect model behavior
  if (fullConfig.removeSpecialTokens) {
    result = result.replace(/<\|.*?\|>/g, "");
    result = result.replace(/<\|endoftext\|>/gi, "");
    result = result.replace(/<\|im_(start|end)\|>/gi, "");
  }

  // Escape HTML/XML tags if requested
  if (fullConfig.escapeHtml) {
    result = result
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;");
  }

  // Trim whitespace
  if (fullConfig.trimWhitespace) {
    result = result.trim();
  }

  return result;
}

/**
 * Detects potentially malicious input patterns.
 *
 * @param input - Input to check
 * @returns Array of detected threat patterns (empty if safe)
 *
 * @example
 * ```typescript
 * const threats = detectThreats(userInput);
 * if (threats.length > 0) {
 *   console.warn('Potential threats detected:', threats);
 * }
 * ```
 */
function detectThreats(input: string): string[] {
  const threats: string[] = [];

  if (!input) return threats;

  // Check for prompt injection patterns
  const injectionPatterns = [
    /ignore\s+(all\s+)?(previous|above)/i,
    /disregard\s+(all\s+)?(previous|above)/i,
    /forget\s+(all\s+)?(previous|above)/i,
    /new\s+(role|persona|instructions)/i,
    /you\s+are\s+now/i,
    /act\s+as\s+a/i,
    /pretend\s+to\s+be/i,
    /override\s+protocol/i,
    /bypass\s+security/i,
  ];

  for (const pattern of injectionPatterns) {
    if (pattern.test(input)) {
      threats.push(`Prompt injection pattern: ${pattern.source}`);
    }
  }

  // Check for role markers
  if (/system:\s*|assistant:\s*|user:\s*/i.test(input)) {
    threats.push("Role marker detected (possible injection)");
  }

  // Check for path traversal
  if (/\.\.[/\\]/.test(input)) {
    threats.push("Path traversal pattern detected");
  }

  // Check for special tokens
  if (/<\|.*?\|>/.test(input)) {
    threats.push("Special tokens detected");
  }

  return threats;
}

/**
 * Validates if input passes sanitization checks.
 *
 * @param input - Input to validate
 * @param config - Optional sanitization configuration
 * @returns Object with isValid flag and issues array
 *
 * @example
 * ```typescript
 * const validation = validateInput(userInput);
 * if (!validation.isValid) {
 *   console.error('Invalid input:', validation.issues);
 * }
 * ```
 */
export function validateInput(
  input: string,
  config: SanitizeConfig = {}
): { isValid: boolean; issues: string[]; sanitized: string } {
  const issues: string[] = [];

  if (!input || typeof input !== "string") {
    return {
      isValid: false,
      issues: ["Input is not a valid string"],
      sanitized: "",
    };
  }

  // Check for threats
  const threats = detectThreats(input);
  if (threats.length > 0) {
    issues.push(...threats);
  }

  // Check length
  const maxLength = config.maxLength ?? 5000;
  if (input.length > maxLength) {
    issues.push(`Input exceeds maximum length of ${maxLength} characters`);
  }

  return {
    isValid: issues.length === 0,
    issues,
    sanitized: sanitizeUserInput(input, config),
  };
}
