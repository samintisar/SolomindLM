import actionCache from "@convex-dev/action-cache/convex.config";
import persistentTextStreaming from "@convex-dev/persistent-text-streaming/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import stripe from "@convex-dev/stripe/convex.config.js";
import workflow from "@convex-dev/workflow/convex.config.js";
import { defineApp } from "convex/server";

const app = defineApp();

app.use(stripe);
app.use(persistentTextStreaming);
app.use(actionCache);
app.use(rateLimiter);
app.use(workflow);

export default app;
