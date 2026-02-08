"use node"
/**
 * Output validation utility for LLM agent operations.
 *
 * Provides validation for different output types to ensure
 * completeness and quality of generated content.
 */

/**
 * Validation result with details about any issues found.
 */
export interface ValidationResult {
  /** Whether the output passed validation */
  isValid: boolean;
  /** List of missing required items */
  missing: string[];
  /** List of warnings (non-critical issues) */
  warnings: string[];
  /** Quality score from 0-100 */
  score: number;
}

/**
 * Configuration for validation behavior.
 */
export interface ValidationConfig {
  /** Type of content being validated (e.g., 'report', 'flashcards', 'quiz') */
  reportType: string;
  /** List of required section headers */
  requiredSections?: string[];
  /** Minimum number of items expected (for lists, questions, cards, etc.) */
  minItems?: number;
  /** Maximum number of items expected */
  maxItems?: number;
  /** Whether to check for abrupt endings (truncation) */
  checkTruncation?: boolean;
  /** Custom validation rules */
  customRules?: Array<(output: string) => { valid: boolean; message: string }>;
}

/**
 * Validates that required sections exist in the output.
 * Uses flexible matching to handle different markdown formats.
 *
 * @param output - Content to validate
 * @param requiredSections - List of required section names
 * @returns Validation result for sections
 */
function validateRequiredSections(
  output: string,
  requiredSections: string[]
): { missing: string[]; found: string[] } {
  const missing: string[] = [];
  const found: string[] = [];

  for (const section of requiredSections) {
    // Multiple matching patterns for flexibility
    const patterns = [
      new RegExp(`##\\s*${section}`, 'i'),      // ## Section Name
      new RegExp(`###\\s*${section}`, 'i'),     // ### Section Name
      new RegExp(`\\*\\*${section}\\*\\*`, 'i'), // **Section Name**
      new RegExp(`${section}`, 'i'),            // Anywhere (case-insensitive)
    ];

    const sectionFound = patterns.some(pattern => pattern.test(output));

    if (sectionFound) {
      found.push(section);
    } else {
      missing.push(`Missing section: ${section}`);
    }
  }

  return { missing, found };
}

/**
 * Validates that the output doesn't end abruptly (truncation detection).
 *
 * @param output - Content to validate
 * @returns Whether ending appears complete
 */
function validateEnding(output: string): { isComplete: boolean; warnings: string[] } {
  const warnings: string[] = [];

  if (!output || output.trim().length === 0) {
    return { isComplete: false, warnings: ['Empty output'] };
  }

  const lastLine = output.trim().split('\n').pop() || '';

  // Check if ends with sentence terminator
  if (
    lastLine.length > 10 &&
    !lastLine.match(/[.!?。！？]$/) &&
    !lastLine.match(/^#+\s/) && // Not a heading
    !lastLine.match(/^\*\*/) && // Not bold text start
    !lastLine.match(/```/) // Not code block
  ) {
    warnings.push('Abrupt ending detected (likely truncated)');
  }

  return {
    isComplete: warnings.length === 0,
    warnings,
  };
}

/**
 * Validates output meets expected item count range.
 *
 * @param output - Content to validate
 * @param minItems - Minimum expected items
 * @param maxItems - Maximum expected items
 * @param itemPattern - Regex pattern to count items (default: numbered list)
 * @returns Validation result for item count
 */
function validateItemCount(
  output: string,
  minItems: number,
  maxItems: number,
  itemPattern: RegExp = /^\d+\.\s+.+$/gm
): { isValid: boolean; issues: string[] } {
  const matches = output.match(itemPattern) || [];
  const count = matches.length;

  const issues: string[] = [];

  if (count < minItems) {
    issues.push(`Too few items (${count}/${minItems} minimum)`);
  }

  if (maxItems > 0 && count > maxItems) {
    issues.push(`Too many items (${count}/${maxItems} maximum)`);
  }

  return {
    isValid: issues.length === 0,
    issues,
  };
}

/**
 * Validates report-type output for completeness and quality.
 *
 * @param output - Report content to validate
 * @param config - Validation configuration
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const validation = validateReport(reportOutput, {
 *   reportType: 'study_guide',
 *   requiredSections: ['Learning Objectives', 'Quiz Questions', 'Answer Key', 'Glossary'],
 *   minItems: 10 // For quiz questions
 * });
 * ```
 */
export function validateOutput(
  output: string,
  config: ValidationConfig
): ValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Validate required sections if specified
  if (config.requiredSections && config.requiredSections.length > 0) {
    const sectionValidation = validateRequiredSections(output, config.requiredSections);
    missing.push(...sectionValidation.missing);
  }

  // Validate item count if specified
  if (config.minItems !== undefined || config.maxItems !== undefined) {
    const minItems = config.minItems ?? 0;
    const maxItems = config.maxItems ?? 0;
    const itemCountValidation = validateItemCount(output, minItems, maxItems);
    warnings.push(...itemCountValidation.issues);
  }

  // Check for truncation if enabled
  if (config.checkTruncation !== false) {
    const endingValidation = validateEnding(output);
    warnings.push(...endingValidation.warnings);
  }

  // Run custom validation rules if provided
  if (config.customRules) {
    for (const rule of config.customRules) {
      const result = rule(output);
      if (!result.valid) {
        warnings.push(result.message);
      }
    }
  }

  // Calculate score based on issues found
  const score = calculateScore(output, missing, warnings);

  return {
    isValid: missing.length === 0 && warnings.length === 0,
    missing,
    warnings,
    score,
  };
}

/**
 * Calculates a quality score (0-100) based on validation results.
 */
function calculateScore(output: string, missing: string[], warnings: string[]): number {
  if (!output || output.trim().length === 0) {
    return 0;
  }

  let score = 100;

  // Deduct points for missing sections
  score -= missing.length * 20;

  // Deduct points for warnings
  score -= warnings.length * 5;

  // Bonus for substantial content
  if (output.length > 1000) {
    score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Type-specific validation presets for common output types.
 */
export const ValidationPresets = {
  /**
   * Study guide validation
   */
  study_guide: {
    requiredSections: [
      'Learning Objectives',
      'Study Notes',
      'Quiz Questions',
      'Answer Key',
      'Essay Questions',
      'Glossary',
    ],
    minItems: 10, // 10 quiz questions
    checkTruncation: true,
  } as ValidationConfig,

  /**
   * Briefing document validation
   */
  briefing: {
    requiredSections: ['Executive Summary', 'Main Themes', 'Key Findings', 'Recommendations'],
    checkTruncation: true,
  } as ValidationConfig,

  /**
   * Blog post validation
   */
  blog_post: {
    requiredSections: ['Introduction', 'Conclusion'],
    minItems: 3, // At least 3 key takeaways
    checkTruncation: true,
  } as ValidationConfig,

  /**
   * Flashcard validation
   */
  flashcards: {
    minItems: 1,
    checkTruncation: true,
    customRules: [
      (output: string) => {
        // Check for Q&A format
        const hasQA = /q:\s*/i.test(output) && /a:\s*/i.test(output);
        return {
          valid: hasQA,
          message: hasQA ? '' : 'Missing Q&A format',
        };
      },
    ],
  } as ValidationConfig,

  /**
   * Quiz validation
   */
  quiz: {
    minItems: 1,
    checkTruncation: true,
    customRules: [
      (output: string) => {
        // Check for multiple choice format
        const hasOptions = /^[a-d][\.)]\s*/im.test(output);
        const hasAnswer = /answer:\s*[a-d]/i.test(output);
        return {
          valid: hasOptions && hasAnswer,
          message: !hasOptions ? 'Missing multiple choice options' : 'Missing answer key',
        };
      },
    ],
  } as ValidationConfig,

  /**
   * Summary validation
   */
  summary: {
    requiredSections: ['Overview', 'Main Arguments', 'Conclusions'],
    checkTruncation: true,
  } as ValidationConfig,

  /**
   * Technical report validation
   */
  technical_report: {
    requiredSections: [
      'Executive Summary',
      'Technical Specifications',
      'Methodologies',
      'Findings',
    ],
    checkTruncation: true,
  } as ValidationConfig,

  /**
   * Concept explainer validation
   */
  concept_explainer: {
    requiredSections: ['Introduction', 'Core Concepts', 'Examples'],
    checkTruncation: true,
  } as ValidationConfig,

  /**
   * Mind map validation
   */
  mindmap: {
    checkTruncation: true,
    customRules: [
      (output: string) => {
        // Check for hierarchical structure (indentation)
        const hasHierarchy = /^  /m.test(output);
        // Check for root topic
        const hasRoot = /^#\s+.+/m.test(output);
        return {
          valid: hasHierarchy && hasRoot,
          message: !hasRoot ? 'Missing root topic (#)' : !hasHierarchy ? 'Missing hierarchical structure' : '',
        };
      },
    ],
  } as ValidationConfig,
};

/**
 * Validates output using a preset configuration.
 *
 * @param output - Content to validate
 * @param presetName - Name of the validation preset
 * @returns Validation result
 *
 * @example
 * ```typescript
 * const validation = validateWithPreset(output, 'study_guide');
 * ```
 */
export function validateWithPreset(
  output: string,
  presetName: keyof typeof ValidationPresets
): ValidationResult {
  const preset = ValidationPresets[presetName];
  if (!preset) {
    return {
      isValid: false,
      missing: [],
      warnings: [`Unknown validation preset: ${presetName}`],
      score: 0,
    };
  }

  return validateOutput(output, { ...preset, reportType: presetName });
}

/**
 * Validates flashcard output specifically.
 *
 * @param output - Flashcard content to validate
 * @param targetCount - Target number of flashcards
 * @returns Validation result
 */
export function validateFlashcards(output: string, targetCount: number): ValidationResult {
  const issues: string[] = [];

  // Count Q&A pairs
  const questions = output.match(/q:\s*/gi) || [];
  const answers = output.match(/a:\s*/gi) || [];

  if (questions.length !== answers.length) {
    issues.push('Mismatch between questions and answers');
  }

  if (questions.length < targetCount * 0.8) {
    // Allow 20% tolerance
    issues.push(`Generated ${questions.length} cards, target was ${targetCount}`);
  }

  return {
    isValid: issues.length === 0,
    missing: [],
    warnings: issues,
    score: issues.length === 0 ? 100 : 70,
  };
}

/**
 * Validates quiz output specifically.
 *
 * @param output - Quiz content to validate
 * @param targetCount - Target number of questions
 * @returns Validation result
 */
export function validateQuiz(output: string, targetCount: number): ValidationResult {
  const issues: string[] = [];

  // Count questions
  const questionMatches = output.match(/^\d+\.\s+/gm) || [];

  if (questionMatches.length < targetCount * 0.8) {
    issues.push(`Generated ${questionMatches.length} questions, target was ${targetCount}`);
  }

  // Check for answer keys
  const hasAnswers = /answer:\s*[a-d]/i.test(output);
  if (!hasAnswers) {
    issues.push('Missing answer key');
  }

  return {
    isValid: issues.length === 0,
    missing: [],
    warnings: issues,
    score: issues.length === 0 ? 100 : 70,
  };
}
