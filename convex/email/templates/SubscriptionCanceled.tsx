import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "./Layout";

export function subscriptionCanceledText(): string {
  return "Your SolomindLM subscription has been canceled. You can resubscribe anytime from billing settings.";
}

export function SubscriptionCanceled() {
  return (
    <EmailLayout preview="Your SolomindLM subscription was canceled">
      <Heading style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 16px" }}>
        Subscription canceled
      </Heading>
      <Text style={{ color: "#374151", fontSize: "14px", margin: "0" }}>
        Your SolomindLM subscription has been canceled. You can resubscribe anytime from billing
        settings.
      </Text>
    </EmailLayout>
  );
}
