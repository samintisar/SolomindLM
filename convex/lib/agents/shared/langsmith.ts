"use node"
import { LangChainTracer } from '@langchain/core/tracers/tracer_langchain';
import { Client } from 'langsmith';
import { env } from '../../helpers/env';

export interface LangSmithRunConfig {
  runName?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

let tracerInstance: LangChainTracer | null = null;

function isTracingEnabled(): boolean {
  // Check LANGCHAIN_TRACING_V2 first (the new standard), then fallback to LANGSMITH_TRACING
  return env.LANGCHAIN_TRACING_V2 === 'true' || env.LANGSMITH_TRACING === 'true';
}

function getLangSmithApiKey(): string | undefined {
  // Check LANGCHAIN_API_KEY first (the new standard), then fallback to LANGSMITH_API_KEY
  return env.LANGCHAIN_API_KEY || env.LANGSMITH_API_KEY;
}

function getProjectName(): string {
  // Check LANGCHAIN_PROJECT first (the new standard), then fallback to LANGSMITH_PROJECT
  return env.LANGCHAIN_PROJECT || env.LANGSMITH_PROJECT || 'default';
}

function getTracer(): LangChainTracer | null {
  if (!isTracingEnabled()) {
    console.log('[LangSmith] Tracing is disabled (LANGCHAIN_TRACING_V2 and LANGSMITH_TRACING are not set to "true")');
    return null;
  }

  const apiKey = getLangSmithApiKey();
  if (!apiKey) {
    console.warn('[LangSmith] API key not found (LANGCHAIN_API_KEY and LANGSMITH_API_KEY are both unset)');
    return null;
  }

  if (!tracerInstance) {
    const client = new Client({
      apiKey,
      apiUrl: env.LANGSMITH_ENDPOINT || undefined,
    });

    const projectName = getProjectName();
    console.log(`[LangSmith] Initializing tracer with project: ${projectName}`);

    tracerInstance = new LangChainTracer({
      client,
      projectName,
    });
  }

  return tracerInstance;
}

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
