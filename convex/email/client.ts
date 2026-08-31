import { Resend } from "@convex-dev/resend";
import { components, internal } from "../_generated/api";

export const resend = new Resend(components.resend, {
  testMode: process.env.RESEND_TEST_MODE !== "false",
  apiKey: process.env.RESEND_API_KEY,
  webhookSecret: process.env.RESEND_WEBHOOK_SECRET,
  onEmailEvent: internal.email.handleEmailEvent.handleEmailEvent,
});
