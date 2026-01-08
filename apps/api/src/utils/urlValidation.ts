/**
 * URL validation utilities for SSRF (Server-Side Request Forgery) prevention
 *
 * This module provides functions to validate and sanitize URLs to prevent
 * attackers from accessing internal services or cloud metadata endpoints.
 */

export interface ValidationError {
  valid: false;
  error: string;
}

export interface ValidationSuccess {
  valid: true;
  url: URL;
}

export type ValidationResult = ValidationError | ValidationSuccess;

/**
 * Domains that are explicitly allowed for content fetching
 * Add social media platforms and other trusted sources here
 */
const ALLOWED_HOSTNAMES = [
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'www.tiktok.com',
  'instagram.com',
  'www.instagram.com',
  'twitter.com',
  'x.com',
  'www.twitter.com',
  'www.x.com',
];

/**
 * Patterns that should be blocked to prevent SSRF attacks
 */
const BLOCKED_PATTERNS = [
  /localhost/i,
  /127\.0\.0\.1/,
  /0\.0\.0\.0/,
  /::1/,
  /169\.254\.169\.254/, // AWS/GCP metadata service
  /metadata\.google\.internal/, // GCP metadata
  /100\.100\.100\.200/, // GCP metadata
  /192\.0\.0\.192/, // AWS metadata
  /fd00:/i, // Private IPv6 range
  /fe80:/i, // Link-local IPv6
];

/**
 * Private IP ranges that should be blocked
 */
const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^127\./,
  /^0\./,
];

/**
 * Blocked protocols
 */
const BLOCKED_PROTOCOLS = ['file:', 'ftp:', 'mailto:', 'javascript:', 'data:'];

/**
 * Validates a URL for SSRF attacks
 *
 * @param urlString - The URL string to validate
 * @returns ValidationResult with valid flag and either URL object or error message
 */
export function validateUrl(urlString: string): ValidationResult {
  try {
    // Check for blocked protocols first (before URL parsing)
    for (const protocol of BLOCKED_PROTOCOLS) {
      if (urlString.toLowerCase().startsWith(protocol)) {
        return {
          valid: false,
          error: `Blocked protocol: ${protocol}`,
        };
      }
    }

    let url: URL;
    try {
      url = new URL(urlString);
    } catch (e) {
      return {
        valid: false,
        error: 'Invalid URL format',
      };
    }

    // Only allow http and https protocols
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return {
        valid: false,
        error: 'Only HTTP and HTTPS protocols are allowed',
      };
    }

    // Check for blocked patterns in hostname
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(url.hostname)) {
        return {
          valid: false,
          error: 'Blocked hostname pattern detected',
        };
      }
    }

    // Check for private IP ranges
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(url.hostname)) {
        return {
          valid: false,
          error: 'Private IP addresses are not allowed',
        };
      }
    }

    // If allowlist is enabled, check against it
    const isAllowlisted = ALLOWED_HOSTNAMES.some(allowed => {
      return url.hostname === allowed || url.hostname.endsWith('.' + allowed);
    });

    if (!isAllowlisted) {
      // For external URLs not on allowlist, perform additional checks
      // Block common internal service ports
      const port = url.port ? parseInt(url.port, 10) : (url.protocol === 'https:' ? 443 : 80);
      const BLOCKED_PORTS = [
        22,   // SSH
        23,   // Telnet
        25,   // SMTP
        53,   // DNS
        139,  // NetBIOS
        445,  // SMB
        3306, // MySQL
        3389, // RDP
        5432, // PostgreSQL
        5433, // PostgreSQL alt
        6379, // Redis
        8000, // Common dev server
        8001, // Common dev server alt
        8080, // Common HTTP alt
        9000, // Common dev server
        9200, // Elasticsearch
        27017, // MongoDB
      ];

      if (BLOCKED_PORTS.includes(port)) {
        return {
          valid: false,
          error: `Blocked port: ${port}`,
        };
      }
    }

    return {
      valid: true,
      url,
    };
  } catch (error) {
    return {
      valid: false,
      error: 'URL validation failed',
    };
  }
}

/**
 * Checks if a hostname is on the allowlist
 *
 * @param hostname - The hostname to check
 * @returns true if the hostname is allowed
 */
export function isHostnameAllowed(hostname: string): boolean {
  return ALLOWED_HOSTNAMES.some(allowed => {
    return hostname === allowed || hostname.endsWith('.' + allowed);
  });
}

/**
 * Sanitizes a URL for safe logging (removes sensitive query params)
 *
 * @param url - The URL to sanitize
 * @returns Sanitized URL string
 */
export function sanitizeUrlForLogging(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove sensitive query parameters
    const sensitiveParams = ['token', 'api_key', 'apikey', 'secret', 'password', 'key'];
    sensitiveParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });
    return urlObj.toString();
  } catch {
    return '<invalid URL>';
  }
}
