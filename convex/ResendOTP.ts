import Resend from "@auth/core/providers/resend";
import { generateRandomString, RandomReader } from "@oslojs/crypto/random";
import { render } from "@react-email/components";
import { Resend as ResendAPI } from "resend";
import { resolveAuthResendFrom } from "./_lib/authResendFrom";
import { throwOnResendSendError } from "./_lib/resendSendError";
import { VerifyEmail, verifyEmailText } from "./email/templates/VerifyEmail";

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
    const from = resolveAuthResendFrom();
    if (!from) return;
    const resend = new ResendAPI(provider.apiKey as string);
    const html = await render(VerifyEmail({ token }));
    const { error } = await resend.emails.send(
      {
        from,
        to: [email],
        subject: "Verify your email for Solomind",
        html,
        text: verifyEmailText(token),
      },
      { idempotencyKey: `otp-verify:${email}:${token}` }
    );
    if (error) {
      throwOnResendSendError(error);
    }
  },
});
