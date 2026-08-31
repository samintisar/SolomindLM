import Resend from "@auth/core/providers/resend";
import { generateRandomString, RandomReader } from "@oslojs/crypto/random";
import { render } from "@react-email/components";
import { Resend as ResendAPI } from "resend";
import { resolveAuthResendFrom } from "./_lib/authResendFrom";
import { throwOnResendSendError } from "./_lib/resendSendError";
import { ResetPassword, resetPasswordText } from "./email/templates/ResetPassword";

/**
 * Password reset OTP for Password provider `reset:`.
 * Nested under Password({ reset }) — same `id` as verify config is OK (not top-level providers).
 */
export const ResendOTPPasswordReset = Resend({
  id: "resend-otp",
  apiKey: process.env.RESEND_API_KEY,
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes) {
        const tmp = new Uint8Array(bytes.length);
        crypto.getRandomValues(tmp);
        bytes.set(tmp);
      },
    };
    const alphabet = "0123456789";
    const length = 8;
    return generateRandomString(random, alphabet, length);
  },
  async sendVerificationRequest({ identifier: email, provider, token }) {
    const from = resolveAuthResendFrom();
    if (!from) return;
    const resend = new ResendAPI(provider.apiKey as string);
    const html = await render(ResetPassword({ token }));
    const { error } = await resend.emails.send(
      {
        from,
        to: [email],
        subject: "Reset your Solomind password",
        html,
        text: resetPasswordText(token),
      },
      { idempotencyKey: `otp-reset:${email}:${token}` }
    );
    if (error) {
      throwOnResendSendError(error);
    }
  },
});
