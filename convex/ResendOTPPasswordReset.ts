import Resend from "@auth/core/providers/resend";
import { Resend as ResendAPI } from "resend";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { throwOnResendSendError } from "./_lib/resendSendError";

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
    const resend = new ResendAPI(provider.apiKey as string);
    const from = process.env.AUTH_RESEND_FROM ?? "Solomind <onboarding@resend.dev>";
    const { error } = await resend.emails.send({
      from,
      to: [email],
      subject: "Reset your Solomind password",
      text: `Your password reset code is: ${token}\n\nIf you did not request a reset, you can ignore this email.`,
    });
    if (error) {
      throwOnResendSendError(error);
    }
  },
});
