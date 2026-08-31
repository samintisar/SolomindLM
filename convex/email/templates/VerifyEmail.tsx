import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "./Layout";

export function verifyEmailText(token: string): string {
  return `Your verification code is: ${token}\n\nIf you did not request this, you can ignore this email.`;
}

export function VerifyEmail({ token }: { token: string }) {
  return (
    <EmailLayout preview="Your Solomind verification code">
      <Heading style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 16px" }}>
        Verify your email
      </Heading>
      <Text style={{ color: "#374151", fontSize: "14px", margin: "0 0 16px" }}>
        Use this code to verify your email for Solomind:
      </Text>
      <Text
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: "32px",
          fontWeight: 600,
          letterSpacing: "6px",
          margin: "0",
        }}
      >
        {token}
      </Text>
    </EmailLayout>
  );
}
