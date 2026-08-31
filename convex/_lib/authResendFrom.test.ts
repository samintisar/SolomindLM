import { describe, expect, it } from "vitest";
import { resolveAuthResendFrom } from "./authResendFrom";

describe("resolveAuthResendFrom", () => {
  it("returns the default test From when AUTH_RESEND_FROM is unset in non-prod", () => {
    const prevFrom = process.env.AUTH_RESEND_FROM;
    const prevDeployment = process.env.CONVEX_DEPLOYMENT;
    delete process.env.AUTH_RESEND_FROM;
    process.env.CONVEX_DEPLOYMENT = "dev:local";
    try {
      expect(resolveAuthResendFrom()).toBe("Solomind <onboarding@resend.dev>");
    } finally {
      if (prevFrom === undefined) delete process.env.AUTH_RESEND_FROM;
      else process.env.AUTH_RESEND_FROM = prevFrom;
      if (prevDeployment === undefined) delete process.env.CONVEX_DEPLOYMENT;
      else process.env.CONVEX_DEPLOYMENT = prevDeployment;
    }
  });

  it("fails closed in production when From is still @resend.dev", () => {
    const prevFrom = process.env.AUTH_RESEND_FROM;
    const prevDeployment = process.env.CONVEX_DEPLOYMENT;
    process.env.AUTH_RESEND_FROM = "Solomind <onboarding@resend.dev>";
    process.env.CONVEX_DEPLOYMENT = "prod:solomindlm";
    try {
      expect(resolveAuthResendFrom()).toBeNull();
    } finally {
      if (prevFrom === undefined) delete process.env.AUTH_RESEND_FROM;
      else process.env.AUTH_RESEND_FROM = prevFrom;
      if (prevDeployment === undefined) delete process.env.CONVEX_DEPLOYMENT;
      else process.env.CONVEX_DEPLOYMENT = prevDeployment;
    }
  });
});
