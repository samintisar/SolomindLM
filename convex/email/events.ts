export const EMAIL_EVENTS = {
  userCreated: "user.created",
  notebookCreated: "notebook.created",
  sourceAdded: "source.added",
  artifactGenerated: "artifact.generated",
  onboardingCompleted: "onboarding.completed",
  subscriptionStarted: "subscription.started",
  subscriptionCanceled: "subscription.canceled",
  invoicePaid: "invoice.paid",
  invoicePaymentFailed: "invoice.payment_failed",
} as const;

export type EmailEventName = (typeof EMAIL_EVENTS)[keyof typeof EMAIL_EVENTS];

export const EMAIL_EVENT_NAMES = [
  EMAIL_EVENTS.userCreated,
  EMAIL_EVENTS.notebookCreated,
  EMAIL_EVENTS.sourceAdded,
  EMAIL_EVENTS.artifactGenerated,
  EMAIL_EVENTS.onboardingCompleted,
  EMAIL_EVENTS.subscriptionStarted,
  EMAIL_EVENTS.subscriptionCanceled,
  EMAIL_EVENTS.invoicePaid,
  EMAIL_EVENTS.invoicePaymentFailed,
] as const;
