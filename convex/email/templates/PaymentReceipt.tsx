import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "./Layout";

export function paymentReceiptText(amountFormatted: string): string {
  return `We received your payment of ${amountFormatted}.\n\nThank you for supporting SolomindLM.`;
}

export function PaymentReceipt({ amountFormatted }: { amountFormatted: string }) {
  return (
    <EmailLayout preview={`Payment received: ${amountFormatted}`}>
      <Heading style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 16px" }}>
        Payment received
      </Heading>
      <Text style={{ color: "#374151", fontSize: "14px", margin: "0" }}>
        We received your payment of {amountFormatted}. Thank you for supporting SolomindLM.
      </Text>
    </EmailLayout>
  );
}
