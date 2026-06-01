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
 * Sanitizes a filename/path to prevent directory traversal.
 *
 * @param filename - Filename to sanitize
 * @returns Sanitized filename safe for filesystem operations
 *
 * @example
 * ```typescript
 * const safeFilename = sanitizeFilename('../../etc/passwd');
 * // Returns: 'etc_passwd'
 * ```
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return "";

  return filename
    .replace(/[/\\]/g, "_") // Replace path separators
    .replace(/\.\./g, "") // Remove parent directory references
    .replace(/[<>:"|?*]/g, "_") // Remove invalid Windows characters
    .replace(/[\x00-\x1f\x80-\x9f]/g, "") // Remove control characters
    .replace(/^\.+/, "") // Remove leading dots
    .substring(0, 255); // Limit length
}

/**
 * Sanitizes markdown content while preserving formatting.
 *
 * @param markdown - Markdown content to sanitize
 * @param config - Optional sanitization configuration
 * @returns Sanitized markdown
 *
 * @example
 * ```typescript
 * const safeMarkdown = sanitizeMarkdown(userContent);
 * ```
 */
export function sanitizeMarkdown(markdown: string, config: SanitizeConfig = {}): string {
  const baseConfig = {
    ...config,
    escapeHtml: false, // Don't escape HTML in markdown (might be intentional)
  };

  return sanitizeUserInput(markdown, baseConfig);
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
export function detectThreats(input: string): string[] {
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
 * Masks sensitive information in logs.
 *
 * @param input - Input that may contain sensitive info
 * @param patterns - Array of regex patterns to mask (default: common patterns)
 * @returns Input with sensitive info masked
 *
 * @example
 * ```typescript
 * const masked = maskSensitiveInfo('API key: sk-1234567890');
 * // Returns: 'API key: sk-************'
 * ```
 */
export function maskSensitiveInfo(input: string, patterns?: RegExp[]): string {
  let result = input;

  const defaultPatterns = [
    // API keys
    /sk-[a-zA-Z0-9]{20,}/g,
    /Bearer\s+[a-zA-Z0-9]{20,}/gi,
    // Email addresses
    /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    // Phone numbers
    /\b\d{3}-\d{3}-\d{4}\b/g,
    /\b\d{10,}\b/g,
    // Credit cards (basic pattern)
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
    // URLs with potential sensitive data
    /https?:\/\/[^\s<>"]+?token=[^\s<>"]+/gi,
  ];

  const maskPatterns = patterns || defaultPatterns;

  for (const pattern of maskPatterns) {
    result = result.replace(pattern, (match) => {
      // Keep first 4 and last 4 characters, mask the rest
      if (match.length <= 8) {
        return "*".repeat(match.length);
      }
      return (
        match.substring(0, 4) + "*".repeat(match.length - 8) + match.substring(match.length - 4)
      );
    });
  }

  return result;
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
