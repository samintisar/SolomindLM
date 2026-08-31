import { Body, Container, Head, Html, Preview, Text } from "@react-email/components";
import type { ReactNode } from "react";

export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{ backgroundColor: "#f6f7f9", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}
      >
        <Container style={{ backgroundColor: "#ffffff", padding: "24px", maxWidth: "560px" }}>
          {children}
          <Text style={{ color: "#6b7280", fontSize: "12px", marginTop: "24px" }}>
            SolomindLM · If you did not request this, you can ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
