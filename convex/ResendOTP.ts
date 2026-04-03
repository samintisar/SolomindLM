import Resend from "@auth/core/providers/resend";
import { Resend as ResendAPI } from "resend";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { throwOnResendSendError } from "./_lib/resendSendError";

/**
 * Email verification OTP for Password provider `verify:` (sign-up / unverified sign-in).
 * Uses @auth/core Resend adapter — omit maxAge (not on this provider's TS surface; library default applies).
 */
export const ResendOTP = Resend({
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
    const from =
      process.env.AUTH_RESEND_FROM ?? "Solomind <onboarding@resend.dev>";
    const { error } = await resend.emails.send({
      from,
      to: [email],
      subject: "Verify your email for Solomind",
      text: `Your verification code is: ${token}\n\nIf you did not request this, you can ignore this email.`,
    });
    if (error) {
      throwOnResendSendError(error);
    }
  },
});
