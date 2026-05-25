# Security Policy

## Supported Versions

We release patches for security vulnerabilities in the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public issue
2. Email us at support@solomindlm.com with:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will:

- Acknowledge receipt within 48 hours
- Provide a timeline for a fix within 7 days
- Credit you in the release notes (if desired)

## Security Best Practices

### API Keys

- Never commit API keys to version control
- Use `.env` files (ignored by `.gitignore`)
- Rotate keys regularly
- Use separate keys for development and production

### Authentication

- Use strong passwords
- Enable 2FA where possible
- Keep `BETTER_AUTH_SECRET` secure and random
- Regularly rotate JWT keys

### Dependencies

- Keep dependencies updated
- Run `bun audit` regularly
- Review security advisories for your stack

### Deployment

- Use HTTPS in production
- Set secure HTTP headers (configured in `vercel.json`)
- Enable CORS appropriately
- Validate all user inputs

## Known Security Considerations

- **API Keys in Environment**: The project requires multiple third-party API keys. Ensure these are properly secured.
- **Convex Authentication**: Uses Better Auth with Google OAuth and password-based authentication.
- **File Uploads**: Documents are processed and stored in Convex storage. Implement appropriate file type and size validation.
- **AI Content**: User-generated content is processed by AI models. Be aware of prompt injection risks.

## Security Updates

Subscribe to security updates:

- Watch this repository on GitHub
- Join our security mailing list: security@solomindlm.com
