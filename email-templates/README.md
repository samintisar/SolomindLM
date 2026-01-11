# SolomindLM Email Templates

Professional, conversion-optimized email templates for Supabase authentication flows, designed to match SolomindLM's warm, vintage aesthetic and drive user engagement.

## 📧 Templates Included

This directory contains HTML email templates for all six Supabase authentication email types:

1. **confirm-signup.html** - Welcome email for new user signups
2. **invite-user.html** - Invitation email for team/user invites
3. **magic-link.html** - Passwordless sign-in link
4. **change-email.html** - Email address change verification
5. **reset-password.html** - Password reset request
6. **reauthentication.html** - Security verification code

## 🎨 Design Features

- **Brand-aligned**: Matches SolomindLM's warm, vintage color scheme
- **Mobile-responsive**: Optimized for all email clients and devices
- **Conversion-focused**: Clear CTAs, benefit-driven copy, and trust signals
- **Email-client compatible**: Works across Gmail, Outlook, Apple Mail, and more
- **Accessible**: Proper semantic HTML and readable typography

## 🚀 Setup Instructions

### 1. Access Supabase Email Templates

1. Log in to your [Supabase Dashboard](https://app.supabase.com)
2. Navigate to **Authentication** → **Email Templates**
3. Select the template you want to configure

### 2. Copy Template Content

1. Open the corresponding HTML file from this directory
2. Copy the entire HTML content
3. In Supabase, go to the **Body** section
4. Click the **Source** tab
5. Paste the HTML content, replacing the default template

### 3. Configure Subject Lines

1. In the **Subject** field, enter the subject line from `subject-lines.md`
2. Or customize it to match your preferences

### 4. Save Changes

1. Click **Save changes** (green button in bottom right)
2. Test the template by triggering the corresponding action (e.g., sign up, reset password)

## 📝 Template Variables

Each template uses Supabase's built-in variables. Here's what's available for each:

### Common Variables (Most Templates)
- `{{ .ConfirmationURL }}` - The confirmation/action URL
- `{{ .Token }}` - Authentication token
- `{{ .TokenHash }}` - Hashed token
- `{{ .SiteURL }}` - Your site's base URL
- `{{ .Email }}` - User's email address
- `{{ .Data }}` - Custom metadata
- `{{ .RedirectTo }}` - Redirect URL after action

### Template-Specific Variables

**Change Email:**
- `{{ .NewEmail }}` - The new email address being verified

**Reauthentication:**
- Only uses: `{{ .Token }}`, `{{ .SiteURL }}`, `{{ .Email }}`, `{{ .Data }}`

## 🎯 Conversion Optimization Features

### 1. Clear Call-to-Actions
- Prominent, styled buttons with hover states
- Alternative text links for accessibility
- Action-oriented button text

### 2. Trust & Security Signals
- Security notes where appropriate
- Expiration timeframes clearly stated
- Professional branding throughout

### 3. Value Proposition
- Benefits highlighted in dedicated sections
- Feature lists for signup/invite templates
- Reassurance messaging for security actions

### 4. User Experience
- Scannable content with proper hierarchy
- Mobile-friendly layout
- Fallback text links for all buttons

## 🎨 Brand Colors

The templates use SolomindLM's color palette:

- **Primary**: `#8b7355` (Warm brown/gold)
- **Text**: `#4a3e2e` (Dark brown)
- **Muted Text**: `#6b5d47` (Medium brown)
- **Background**: `#ffffff` (White)
- **Light Background**: `#f9f7f4` (Warm off-white)
- **Borders**: `#e8e5e0` (Light beige)

## 📱 Email Client Compatibility

These templates are tested and optimized for:

- ✅ Gmail (Web, iOS, Android)
- ✅ Outlook (Desktop, Web, Mobile)
- ✅ Apple Mail (macOS, iOS)
- ✅ Yahoo Mail
- ✅ ProtonMail
- ✅ Other major email clients

## 🔧 Customization

### Changing Colors

Search and replace these color values in the HTML:
- `#8b7355` - Primary/button color
- `#4a3e2e` - Main text color
- `#6b5d47` - Secondary text color
- `#f9f7f4` - Light background
- `#e8e5e0` - Border color

### Modifying Content

1. Edit the HTML files directly
2. Maintain the table structure for email client compatibility
3. Keep inline styles (required for email)
4. Test after making changes

### Adding Images

To add the SolomindLM logo or other images:

1. Host images on a CDN or your website
2. Replace the text logo with:
   ```html
   <img src="https://yourdomain.com/logo.png" alt="SolomindLM" style="max-width: 200px;">
   ```

## 🧪 Testing

### Before Going Live

1. **Send test emails** to yourself using Supabase's test feature
2. **Check on mobile devices** - Test on iOS and Android
3. **Test in multiple email clients** - Gmail, Outlook, Apple Mail
4. **Verify all links** - Ensure `{{ .ConfirmationURL }}` works correctly
5. **Check variable rendering** - Make sure Supabase variables are replaced

### Testing Checklist

- [ ] All buttons are clickable
- [ ] Links work correctly
- [ ] Text is readable on mobile
- [ ] Brand colors display correctly
- [ ] Variables are replaced with actual values
- [ ] Subject lines are appropriate
- [ ] Email renders correctly in major clients

## 📊 Performance Tips

1. **Subject Lines**: Use the optimized subject lines from `subject-lines.md`
2. **A/B Testing**: Test different subject lines and CTAs
3. **Timing**: Consider when emails are sent (timezone-aware)
4. **Personalization**: Use `{{ .Email }}` and `{{ .SiteURL }}` for personalization
5. **Mobile First**: Most users read emails on mobile - optimize accordingly

## 🆘 Troubleshooting

### Variables Not Replacing

- Ensure you're using the correct variable syntax: `{{ .VariableName }}`
- Check that variables are available for the template type
- Verify in Supabase docs for template-specific variables

### Styling Issues

- Email clients strip some CSS - use inline styles
- Test in multiple clients - they render differently
- Use table-based layouts for better compatibility

### Links Not Working

- Verify `{{ .ConfirmationURL }}` is correct
- Check Supabase redirect URL settings
- Ensure HTTPS is used for security

## 📚 Resources

- [Supabase Email Templates Documentation](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Supabase Auth Variables Reference](https://supabase.com/docs/guides/auth/auth-email-templates#variables)
- [Email Client Compatibility Guide](https://www.caniemail.com/)

## 📄 License

These templates are part of the SolomindLM project and follow the same license as the main repository.

---

**Need Help?** Contact support@solomindlm.com or open an issue in the repository.
