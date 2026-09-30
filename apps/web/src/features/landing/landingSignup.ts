const SIGNUP_INTENT_KEY = "solomindlm_signup_intent";

export function setSignupIntent(intentKey: string): void {
  try {
    sessionStorage.setItem(SIGNUP_INTENT_KEY, intentKey);
  } catch {
    // Private browsing or storage disabled
  }
}
