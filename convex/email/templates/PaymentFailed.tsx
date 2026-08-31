import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "./Layout";

export function paymentFailedText(amountFormatted: string): string {
  return `We could not process your payment of ${amountFormatted}. Please update your payment method to keep your SolomindLM subscription active.`;
}

export function PaymentFailed({ amountFormatted }: { amountFormatted: string }) {
  return (
    <EmailLayout preview={`Payment failed: ${amountFormatted}`}>
      <Heading style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 16px" }}>
        Payment failed
      </Heading>
      <Text style={{ color: "#374151", fontSize: "14px", margin: "0" }}>
        We could not process your payment of {amountFormatted}. Please update your payment method to
        keep your SolomindLM subscription active.
      </Text>
    </EmailLayout>
  );
}
