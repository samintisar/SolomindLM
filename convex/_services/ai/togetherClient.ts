"use node";

import Together from "together-ai";
import { env } from "../../_lib/env";

export function createTogetherClient(): Together {
  const apiKey = env.TOGETHER_AI_API_KEY;
  if (!apiKey) {
    throw new Error("TOGETHER_AI_API_KEY is not set");
  }
  return new Together({ apiKey });
}
