"use node";
import { LangChainTracer } from "@langchain/core/tracers/tracer_langchain";
import { Client } from "langsmith";
import { env } from "../../_lib/env";
import type { JobType } from "./logging";

export interface LangSmithRunConfig {
  runName?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Configuration for creating agent traces with consistent naming and tags.
 */
export interface AgentTraceConfig {
  projectName: string;
  tags: string[];
  metadata: Record<string, unknown>;
  runName: string;
}

let tracerInstance: LangChainTracer | null = null;

/**
 * Check if LangSmith tracing is enabled.
 */
function isTracingEnabled(): boolean {
  // Check LANGCHAIN_TRACING_V2 first (the new standard), then fallback to LANGSMITH_TRACING
  return env.LANGCHAIN_TRACING_V2 === "true" || env.LANGSMITH_TRACING === "true";
}

/**
 * Get the LangSmith API key from environment.
 */
function getLangSmithApiKey(): string | undefined {
  // Check LANGCHAIN_API_KEY first (the new standard), then fallback to LANGSMITH_API_KEY
  return env.LANGCHAIN_API_KEY || env.LANGSMITH_API_KEY;
}

/**
 * Get the project name from environment, with environment-aware defaults.
 */
function getProjectName(): string {
  // Check LANGCHAIN_PROJECT first (the new standard), then fallback to LANGSMITH_PROJECT
  const configuredProject = env.LANGCHAIN_PROJECT || env.LANGSMITH_PROJECT;
  if (configuredProject) {
    return configuredProject;
  }

  // Auto-detect environment from Convex URL
  const convexUrl = env.CONVEX_CLOUD_URL || "";
  const isProd = convexUrl.includes("prod") || convexUrl.includes("production");

  return isProd ? "prod-solomind-agents" : "dev-solomind-agents";
}

/**
 * Get or create the singleton LangSmith tracer instance.
 */
function getTracer(): LangChainTracer | null {
  if (!isTracingEnabled()) {
    return null;
  }

  const apiKey = getLangSmithApiKey();
  if (!apiKey) {
    return null;
  }

  if (!tracerInstance) {
    const client = new Client({
      apiKey,
      apiUrl: env.LANGSMITH_ENDPOINT || undefined,
    });

    const projectName = getProjectName();

    tracerInstance = new LangChainTracer({
      client,
      projectName,
    });
  }

  return tracerInstance;
}

/**
 * Create a LangSmith run configuration for use with LangChain callbacks.
 *
 * @param config - Optional configuration overrides
 * @returns LangSmith callbacks configuration or empty object if disabled
 */
export function createLangSmithRunConfig(config: LangSmithRunConfig = {}) {
  const tracer = getTracer();

  if (!tracer) {
    return {};
  }

  return {
    callbacks: [tracer],
    tags: config.tags,
    metadata: config.metadata,
    runName: config.runName,
  };
}

/**
 * Create an agent trace configuration for a specific job.
 *
 * This provides consistent naming, tagging, and metadata for all agent
 * operations within a job. Use this to create trace configurations that
 * will appear properly organized in LangSmith.
 *
 * @param jobType - The type of job being executed
 * @param jobId - The unique identifier for the job
 * @param options - Additional options for the trace
 * @returns AgentTraceConfig for use with traceable wrappers
 *
 * @example
 * ```typescript
 * const traceConfig = createAgentTraceConfig('report', reportId, {
 *   notebookId,
 *   additionalTags: ['priority:high'],
 * });
 *
 * // Use with traceable wrapper
 * const tracedGenerate = traceable(generateContent, {
 *   name: traceConfig.runName,
 *   tags: traceConfig.tags,
 *   metadata: traceConfig.metadata,
 * });
 * ```
 */
export function createAgentTraceConfig(
  jobType: JobType,
  jobId: string,
  options?: {
    notebookId?: string;
    userId?: string;
    additionalTags?: string[];
    additionalMetadata?: Record<string, unknown>;
    runNameOverride?: string;
  }
): AgentTraceConfig {
  const projectName = getProjectName();
  const timestamp = Date.now();

  // Build tags array with consistent format
  const tags = [`job:${jobType}`, `jobId:${jobId}`, ...(options?.additionalTags || [])];

  // Add notebook tag if available
  if (options?.notebookId) {
    tags.push(`notebook:${options.notebookId}`);
  }

  // Build metadata object
  const metadata: Record<string, unknown> = {
    jobType,
    jobId,
    timestamp,
    ...(options?.notebookId && { notebookId: options.notebookId }),
    ...(options?.userId && { userId: options.userId }),
    ...options?.additionalMetadata,
  };

  // Create run name
  const runName = options?.runNameOverride || `${jobType}_job_${jobId.substring(0, 8)}`;

  return {
    projectName,
    tags,
    metadata,
    runName,
  };
}

/**
 * Create a LangSmith run config for a specific job.
 *
 * This combines createAgentTraceConfig with createLangSmithRunConfig
 * for convenience when setting up LangChain callbacks.
 *
 * @param jobType - The type of job being executed
 * @param jobId - The unique identifier for the job
 * @param options - Additional options for the trace
 * @returns LangSmith callbacks configuration
 *
 * @example
 * ```typescript
 * const langSmithConfig = createJobLangSmithConfig('report', reportId, {
 *   notebookId,
 *   userId,
 * });
 *
 * const result = await model.invoke(prompt, langSmithConfig);
 * ```
 */
export function createJobLangSmithConfig(
  jobType: JobType,
  jobId: string,
  options?: {
    notebookId?: string;
    userId?: string;
    additionalTags?: string[];
    additionalMetadata?: Record<string, unknown>;
    runNameOverride?: string;
  }
): ReturnType<typeof createLangSmithRunConfig> {
  const traceConfig = createAgentTraceConfig(jobType, jobId, options);

  return createLangSmithRunConfig({
    runName: traceConfig.runName,
    tags: traceConfig.tags,
    metadata: traceConfig.metadata,
  });
}

/**
 * Get the current project name being used for LangSmith traces.
 * Useful for debugging and logging.
 */
export function getCurrentProjectName(): string {
  return getProjectName();
}

/**
 * Check if LangSmith is currently configured and enabled.
 * Useful for conditional logic in agents.
 */
export function isLangSmithEnabled(): boolean {
  return isTracingEnabled() && !!getLangSmithApiKey();
}

/**
 * Reset the tracer instance.
 * Mainly useful for testing or when configuration changes.
 */
export function resetTracer(): void {
  tracerInstance = null;
}
