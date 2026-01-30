/**
 * Email templates for Better Auth automation.
 * Content matches email-templates/ for consistency; placeholders use
 * {{ .ConfirmationURL }} and {{ .SiteURL }} (filled at send time).
 */

export const CONFIRM_SIGNUP_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Signup - SolomindLM</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Georgia, serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f5f3f0; font-family: 'Georgia', 'Times New Roman', serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f3f0;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; border-bottom: 1px solid #e8e5e0;">
              <img src="https://i.ibb.co/QvRjnJf4/Solomind-LM-logo.png" alt="SolomindLM" style="max-width: 150px; height: auto; margin: 0 auto 15px; display: block;">
              <p style="margin: 8px 0 0; font-size: 14px; color: #6b5d47; font-style: italic;">AI-Powered Learning Materials</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 40px 30px;">
              <h2 style="margin: 0 0 20px; font-size: 24px; font-weight: bold; color: #4a3e2e; line-height: 1.3;">Welcome to SolomindLM!</h2>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #4a3e2e;">Thank you for signing up! We're excited to help you transform your study materials into powerful learning tools.</p>
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.6; color: #4a3e2e;">Activate your account using the button below:</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 0 0 30px;">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 16px 40px; background-color: #8b7355; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(139, 115, 85, 0.3);">Confirm Your Email</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 30px; font-size: 14px; line-height: 1.6; color: #6b5d47;">Or copy and paste this link into your browser:<br><a href="{{ .ConfirmationURL }}" style="color: #8b7355; text-decoration: underline; word-break: break-all;">{{ .ConfirmationURL }}</a></p>
              <p style="margin: 30px 0 0; font-size: 13px; line-height: 1.6; color: #6b5d47; font-style: italic;">This confirmation link is valid for 24 hours. If you didn't create an account with SolomindLM, you can safely ignore this email.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 40px; background-color: #f9f7f4; border-top: 1px solid #e8e5e0; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #4a3e2e; text-align: center;">Need help? Contact us at <a href="mailto:support@solomindlm.com" style="color: #8b7355; text-decoration: underline;">support@solomindlm.com</a></p>
              <p style="margin: 0; font-size: 12px; color: #6b5d47; text-align: center;">© {{ .SiteURL }} - SolomindLM. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export const RESET_PASSWORD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password - SolomindLM</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {font-family: Georgia, serif !important;}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f5f3f0; font-family: 'Georgia', 'Times New Roman', serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f3f0;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 30px; text-align: center; border-bottom: 1px solid #e8e5e0;">
              <img src="https://i.ibb.co/QvRjnJf4/Solomind-LM-logo.png" alt="SolomindLM" style="max-width: 150px; height: auto; margin: 0 auto 15px; display: block;">
              <p style="margin: 8px 0 0; font-size: 14px; color: #6b5d47; font-style: italic;">AI-Powered Learning Materials</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 40px 30px;">
              <h2 style="margin: 0 0 20px; font-size: 24px; font-weight: bold; color: #4a3e2e; line-height: 1.3;">Reset Your Password</h2>
              <p style="margin: 0 0 20px; font-size: 16px; line-height: 1.6; color: #4a3e2e;">We received a notification to reset the sign-in credentials for your SolomindLM account. No worries—we've got you covered!</p>
              <p style="margin: 0 0 30px; font-size: 16px; line-height: 1.6; color: #4a3e2e;">Use the button below to create updated sign-in credentials. This secure link will take you directly to the reset page.</p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                <tr>
                  <td align="center" style="padding: 0 0 30px;">
                    <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 16px 40px; background-color: #8b7355; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600; letter-spacing: 0.5px; box-shadow: 0 2px 4px rgba(139, 115, 85, 0.3);">Reset Sign-In Credentials</a>
                  </td>
                </tr>
              </table>
              <p style="margin: 0 0 30px; font-size: 14px; line-height: 1.6; color: #6b5d47;">Or copy and paste this link into your browser:<br><a href="{{ .ConfirmationURL }}" style="color: #8b7355; text-decoration: underline; word-break: break-all;">{{ .ConfirmationURL }}</a></p>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #fff8f0; border-left: 3px solid #d4a574; border-radius: 4px; padding: 15px 20px; margin: 30px 0;">
                <tr>
                  <td>
                    <p style="margin: 0 0 10px; font-size: 13px; line-height: 1.6; color: #4a3e2e;"><strong>Security Tips:</strong></p>
                    <ul style="margin: 0; padding-left: 20px; font-size: 13px; line-height: 1.6; color: #4a3e2e;">
                      <li>This link is valid for 1 hour for your security</li>
                      <li>Choose a strong, unique sign-in credential</li>
                      <li>If you didn't initiate this, ignore this email</li>
                    </ul>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f9f7f4; border-radius: 6px; padding: 20px; margin: 30px 0;">
                <tr>
                  <td>
                    <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #4a3e2e;"><strong>Once you reset your sign-in credentials,</strong> you'll regain full use of your study materials, notebooks, and AI-generated content.</p>
                  </td>
                </tr>
              </table>
              <p style="margin: 30px 0 0; font-size: 13px; line-height: 1.6; color: #6b5d47; font-style: italic;">If you continue to have trouble with your account, contact our support team.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 40px; background-color: #f9f7f4; border-top: 1px solid #e8e5e0; border-radius: 0 0 8px 8px;">
              <p style="margin: 0 0 10px; font-size: 14px; color: #4a3e2e; text-align: center;">Need help? Contact us at <a href="mailto:support@solomindlm.com" style="color: #8b7355; text-decoration: underline;">support@solomindlm.com</a></p>
              <p style="margin: 0; font-size: 12px; color: #6b5d47; text-align: center;">© {{ .SiteURL }} - SolomindLM. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

/** Fill template placeholders: {{ .ConfirmationURL }}, {{ .SiteURL }} */
export function fillTemplate(
  html: string,
  opts: { confirmationUrl: string; siteUrl: string }
): string {
  return html
    .replace(/\{\{\s*\.ConfirmationURL\s*\}\}/g, opts.confirmationUrl)
    .replace(/\{\{\s*\.SiteURL\s*\}\}/g, opts.siteUrl);
}
