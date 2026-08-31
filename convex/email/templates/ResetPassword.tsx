import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "./Layout";

export function resetPasswordText(token: string): string {
  return `Your password reset code is: ${token}\n\nIf you did not request a reset, you can ignore this email.`;
}

export function ResetPassword({ token }: { token: string }) {
  return (
    <EmailLayout preview="Your Solomind password reset code">
      <Heading style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 16px" }}>
        Reset your password
      </Heading>
      <Text style={{ color: "#374151", fontSize: "14px", margin: "0 0 16px" }}>
        Use this code to reset your Solomind password:
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
