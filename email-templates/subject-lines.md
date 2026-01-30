# Email Template Subject Lines

Optimized subject lines for each authentication email template to maximize open rates and conversions.

## Confirm Signup

**Recommended:**

- `Welcome to SolomindLM - Confirm Your Email`
- `🎓 Confirm your email to start learning with SolomindLM`
- `Almost there! Confirm your SolomindLM account`
- `Your AI study companion awaits - Confirm now`

**Alternative options:**

- `Confirm Your Signup - SolomindLM`
- `One click to unlock your study materials`
- `Verify your email to access SolomindLM`

---

## Invite User

**Recommended:**

- `You've been invited to SolomindLM! 🎉`
- `Join SolomindLM - Transform your study workflow`
- `Your invitation to AI-powered study materials`
- `Someone wants you to join SolomindLM`

**Alternative options:**

- `You Have Been Invited`
- `Welcome to SolomindLM - Accept your invitation`
- `Start creating study materials with SolomindLM`

---

## Magic Link

**Recommended:**

- `Your SolomindLM sign-in link ✨`
- `Quick sign-in to your account`
- `Your magic link is ready - Sign in now`
- `One-click access to SolomindLM`

**Alternative options:**

- `Your Magic Link`
- `Sign in to SolomindLM (no password needed)`
- `Secure sign-in link for SolomindLM`

---

## Change Email Address

**Recommended:**

- `Confirm your new email address - SolomindLM`
- `Verify your email change request`
- `Complete your email update - SolomindLM`
- `Security: Confirm your email change`

**Alternative options:**

- `Confirm Email Change`
- `Verify your new SolomindLM email address`
- `Action required: Confirm email change`

---

## Reset Password

**Recommended:**

- `Reset your SolomindLM password 🔐`
- `Password reset request - SolomindLM`
- `Create a new password for your account`
- `Secure your account - Reset password now`

**Alternative options:**

- `Reset Your Password`
- `Password reset link for SolomindLM`
- `Reset your password (expires in 1 hour)`

---

## Reauthentication

**Recommended:**

- `Security verification code for SolomindLM`
- `Your verification code - Complete your action`
- `Reauthentication required - SolomindLM`
- `Enter this code to continue - SolomindLM`

**Alternative options:**

- `Confirm Reauthentication`
- `Security code for your SolomindLM account`
- `Verification code (expires in 10 minutes)`

---

## Best Practices

1. **Keep it concise**: Subject lines should be 50 characters or less for optimal display
2. **Include brand name**: "SolomindLM" helps with recognition and trust
3. **Use emojis sparingly**: They can increase open rates but use them strategically
4. **Create urgency when appropriate**: Time-sensitive actions (magic links, codes) benefit from urgency
5. **Test variations**: A/B test different subject lines to find what works best for your audience
6. **Match the email content**: The subject line should accurately reflect what's inside

---

## Configuration

To set these subject lines:

1. Go to your auth dashboard → **Email Templates** (or equivalent)
2. Select the template you want to configure
3. Paste the subject line into the **Subject** field
4. Save changes

You can also use dynamic variables in subject lines:

- `{{ .SiteURL }}` - Your site URL
- `{{ .Email }}` - User's email address
- `{{ .Token }}` - Token (for reauthentication)

Example: `Welcome to {{ .SiteURL }} - Confirm Your Email`
