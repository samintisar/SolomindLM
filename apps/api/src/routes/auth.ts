import { Router, Response } from 'express';
import { supabase } from '../config/database.js';
import { env } from '../config/env.js';
import { z } from 'zod';
import { promisify } from 'util';
import { createHash, randomBytes } from 'crypto';
import { generateCsrfToken as setCsrfCookie } from '../middleware/csrf.js';

// Simple in-memory rate limiter for auth endpoints
const authRateLimiter = new Map<string, { count: number; resetTime: number }>();

/**
 * PKCE (Proof Key for Code Exchange) utilities for OAuth security
 * Prevents authorization code interception attacks
 */
const PKCE_STORE = new Map<string, { codeVerifier: string; expiresAt: number }>();
const PKCE_CODE_EXPIRY = 10 * 60 * 1000; // 10 minutes

/**
 * Generate a random code verifier for PKCE
 * Uses a cryptographically secure random string
 */
function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Generate code challenge from verifier using SHA-256
 * The challenge is sent to the OAuth server, verifier is kept secret
 */
function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Store PKCE code verifier with expiration
 */
function storeCodeVerifier(state: string, codeVerifier: string): void {
  PKCE_STORE.set(state, {
    codeVerifier,
    expiresAt: Date.now() + PKCE_CODE_EXPIRY,
  });
}

/**
 * Retrieve and consume PKCE code verifier
 * Returns null if not found or expired
 */
function getCodeVerifier(state: string): string | null {
  const entry = PKCE_STORE.get(state);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    PKCE_STORE.delete(state);
    return null;
  }
  // Consume the verifier (one-time use)
  PKCE_STORE.delete(state);
  return entry.codeVerifier;
}

/**
 * Clean up expired PKCE entries (run periodically)
 */
function cleanupExpiredPKCEEntries(): void {
  const now = Date.now();
  for (const [state, entry] of PKCE_STORE.entries()) {
    if (now > entry.expiresAt) {
      PKCE_STORE.delete(state);
    }
  }
}

// Clean up expired entries every 5 minutes
setInterval(cleanupExpiredPKCEEntries, 5 * 60 * 1000);

const RATE_LIMIT = {
  MAX_REQUESTS: 5,        // 5 requests per window
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  BLOCK_DURATION_MS: 60 * 60 * 1000, // 1 hour block
};

// Constant-time delay to prevent timing attacks
// Use a consistent delay for both success and failure cases
const AUTH_DELAY_MS = 200; // 200ms minimum delay
const setTimeoutPromise = promisify(setTimeout);

async function consistentDelay() {
  // Add a random jitter of 0-100ms to make timing analysis harder
  const jitter = Math.random() * 100;
  await setTimeoutPromise(AUTH_DELAY_MS + jitter);
}

function checkAuthRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = authRateLimiter.get(ip);

  if (!record) {
    authRateLimiter.set(ip, { count: 1, resetTime: now + RATE_LIMIT.WINDOW_MS });
    return { allowed: true };
  }

  // Check if window has expired
  if (now > record.resetTime) {
    authRateLimiter.set(ip, { count: 1, resetTime: now + RATE_LIMIT.WINDOW_MS });
    return { allowed: true };
  }

  // Check if rate limit exceeded
  if (record.count >= RATE_LIMIT.MAX_REQUESTS) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  record.count++;
  return { allowed: true };
}

const router = Router();

// Cookie configuration for httpOnly cookies
// For development: Use 'lax' to allow cookies to work across localhost:5173 and localhost:3001
// 'lax' works for cross-origin top-level navigations and same-origin requests
// For production: Use 'none' with secure:true for cross-origin cookie sharing
// 'strict' does NOT work for cross-origin requests (frontend and API on different domains)
// 'none' requires secure:true (HTTPS) which production should have
//
// Safari ITP compatibility:
// - 'partitioned' attribute enables CHIPS (Cookies Having Independent Partitioned State)
// - This helps Safari accept cookies in cross-origin scenarios
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production' ? true : false,
  sameSite: (env.NODE_ENV === 'production' ? 'none' : 'lax') as 'strict' | 'lax' | 'none',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
  // domain: undefined, // Don't set domain - let browser use current origin
  // Note: 'partitioned' attribute is only supported in newer browsers (Safari 16.4+)
  // Omitting for broader compatibility while maintaining sameSite: 'none' + secure
};

/**
 * Set security-focused response headers for auth endpoints
 * Prevents caching of auth responses which could contain sensitive data
 */
function setAuthSecurityHeaders(res: Response): void {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

/**
 * POST /api/auth/register
 * Register a new user using Supabase Auth
 */
router.post('/register', async (req, res) => {
  const startTime = Date.now();
  try {
    // Rate limiting based on IP
    const ip = (req.ip || req.connection.remoteAddress || 'unknown').replace(/^::ffff:/, '');
    const rateLimitCheck = checkAuthRateLimit(ip);

    if (!rateLimitCheck.allowed) {
      res.setHeader('Retry-After', rateLimitCheck.retryAfter!.toString());
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfter: rateLimitCheck.retryAfter,
      });
    }
    const { email, password } = registerSchema.parse(req.body);

    // Sign up user with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    // Apply consistent timing to prevent account enumeration via timing attacks
    const elapsed = Date.now() - startTime;
    if (elapsed < AUTH_DELAY_MS) {
      await consistentDelay();
    }

    // Set security headers for all auth responses
    setAuthSecurityHeaders(res);

    if (error) {
      // Use generic error message to prevent account enumeration
      // Return the same message regardless of whether the user exists or not
      return res.status(200).json({
        message: 'If an account with this email exists, a confirmation email has been sent.',
      });
    }

    // Check if user was created (sometimes Supabase returns success without creating user if email confirmation is required)
    if (!data.user) {
      return res.status(200).json({
        message: 'If an account with this email exists, a confirmation email has been sent.',
      });
    }

    // Get the session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      return res.status(200).json({
        message: 'If an account with this email exists, a confirmation email has been sent.',
        needsConfirmation: true,
      });
    }

    // Set httpOnly cookies with tokens
    res.cookie('access_token', sessionData.session.access_token, COOKIE_OPTIONS);
    res.cookie('refresh_token', sessionData.session.refresh_token, COOKIE_OPTIONS);

    // Set CSRF token for subsequent requests
    setCsrfCookie(req, res, () => {});

    res.status(201).json({
      message: 'User registered successfully',
      userId: data.user.id,
      email: data.user.email,
    });
  } catch (error) {
    // Apply consistent timing even on error
    const elapsed = Date.now() - startTime;
    if (elapsed < AUTH_DELAY_MS) {
      await consistentDelay();
    }

    setAuthSecurityHeaders(res);

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Register error:', error);
    // Use generic error message
    res.status(200).json({
      message: 'If an account with this email exists, a confirmation email has been sent.',
    });
  }
});

/**
 * POST /api/auth/login
 * Sign in a user using Supabase Auth
 */
router.post('/login', async (req, res) => {
  const startTime = Date.now();
  try {
    // Rate limiting based on IP
    const ip = (req.ip || req.connection.remoteAddress || 'unknown').replace(/^::ffff:/, '');
    const rateLimitCheck = checkAuthRateLimit(ip);

    if (!rateLimitCheck.allowed) {
      res.setHeader('Retry-After', rateLimitCheck.retryAfter!.toString());
      return res.status(429).json({
        error: 'Too many login attempts. Please try again later.',
        retryAfter: rateLimitCheck.retryAfter,
      });
    }
    const { email, password } = loginSchema.parse(req.body);

    // Sign in user with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    // Apply consistent timing to prevent account enumeration via timing attacks
    const elapsed = Date.now() - startTime;
    if (elapsed < AUTH_DELAY_MS) {
      await consistentDelay();
    }

    // Set security headers for all auth responses
    setAuthSecurityHeaders(res);

    if (error) {
      // Use generic error message to prevent account enumeration
      return res.status(401).json({
        error: 'Invalid email or password',
      });
    }

    if (!data.session) {
      return res.status(401).json({
        error: 'Invalid email or password',
      });
    }

    // Set httpOnly cookies with tokens
    res.cookie('access_token', data.session.access_token, COOKIE_OPTIONS);
    res.cookie('refresh_token', data.session.refresh_token, COOKIE_OPTIONS);

    // Set CSRF token for subsequent requests
    setCsrfCookie(req, res, () => {});

    res.json({
      message: 'Signed in successfully',
      userId: data.user.id,
      email: data.user.email,
    });
  } catch (error) {
    // Apply consistent timing even on error
    const elapsed = Date.now() - startTime;
    if (elapsed < AUTH_DELAY_MS) {
      await consistentDelay();
    }

    setAuthSecurityHeaders(res);

    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Login error:', error);
    // Use generic error message to prevent information disclosure
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

/**
 * POST /api/auth/logout
 * Sign out the current user
 */
router.post('/logout', async (req, res) => {
  try {
    // Set security headers for all auth responses
    setAuthSecurityHeaders(res);

    const { error } = await supabase.auth.signOut();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    // Clear cookies with matching sameSite/secure attributes
    const clearOptions = {
      path: '/',
      secure: COOKIE_OPTIONS.secure,
      sameSite: COOKIE_OPTIONS.sameSite,
    };
    res.clearCookie('access_token', clearOptions);
    res.clearCookie('refresh_token', clearOptions);

    res.json({ message: 'Signed out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    setAuthSecurityHeaders(res);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Get the current user's session
 *
 * Automatically refreshes the session if the access token is expired.
 * Implements refresh token rotation - each refresh issues a new refresh token.
 */
router.get('/me', async (req, res) => {
  try {
    const accessToken = req.cookies.access_token;
    const refreshToken = req.cookies.refresh_token;

    if (!accessToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Set security headers for all auth responses
    setAuthSecurityHeaders(res);

    let { data: { user }, error } = await supabase.auth.getUser(accessToken);

    // If token is expired but we have a refresh token, try to refresh it
    if ((error || !user) && refreshToken) {
      const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (!sessionError && sessionData.session) {
        // Update cookies with new tokens (refresh token rotation)
        res.cookie('access_token', sessionData.session.access_token, COOKIE_OPTIONS);
        res.cookie('refresh_token', sessionData.session.refresh_token, COOKIE_OPTIONS);

        // Get user with new access token
        const { data: { user: refreshedUser }, error: getUserError } = await supabase.auth.getUser(sessionData.session.access_token);

        if (!getUserError && refreshedUser) {
          // Set CSRF token for subsequent requests
          setCsrfCookie(req, res, () => {});
          return res.json({
            userId: refreshedUser.id,
            email: refreshedUser.email,
          });
        }
      }
    }

    if (error || !user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Set CSRF token for subsequent requests
    setCsrfCookie(req, res, () => {});

    res.json({
      userId: user.id,
      email: user.email,
    });
  } catch (error) {
    console.error('Get session error:', error);
    setAuthSecurityHeaders(res);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh an access token using a refresh token
 *
 * Implements refresh token rotation:
 * - Each refresh token can only be used once
 * - A new refresh token is issued with each refresh
 * - Reusing an old refresh token indicates a potential security breach
 */
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refresh_token || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    // Set security headers for all auth responses
    setAuthSecurityHeaders(res);

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      // Clear invalid cookies with matching sameSite/secure attributes
      const clearOptions = {
        path: '/',
        secure: COOKIE_OPTIONS.secure,
        sameSite: COOKIE_OPTIONS.sameSite,
      };
      res.clearCookie('access_token', clearOptions);
      res.clearCookie('refresh_token', clearOptions);

      // Log potential security issue - this could indicate token theft
      if (error?.message?.includes('refresh token')) {
        console.warn('[Auth] Failed refresh attempt - possible token reuse or theft:', {
          error: error.message,
          ip: req.ip,
        });
      }

      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Update cookies with new tokens (refresh token rotation)
    // The new refresh token replaces the old one, which is now invalidated
    res.cookie('access_token', data.session.access_token, COOKIE_OPTIONS);
    res.cookie('refresh_token', data.session.refresh_token, COOKIE_OPTIONS);

    // Set CSRF token for subsequent requests
    setCsrfCookie(req, res, () => {});

    res.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    setAuthSecurityHeaders(res);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/google
 * @deprecated This endpoint is deprecated.
 *
 * OAuth initiation should now happen on the frontend using the Supabase client
 * directly. This ensures Supabase can set the necessary state cookies in the
 * browser for CSRF protection.
 *
 * New flow:
 * 1. Frontend calls supabase.auth.signInWithOAuth() with redirectTo pointing to /auth/callback
 * 2. Supabase sets state cookies in browser
 * 3. User is redirected to Google, then back to frontend with authorization code
 * 4. Frontend sends code to POST /api/auth/google/callback
 * 5. Backend exchanges code for session and sets HttpOnly cookies
 */
router.get('/google', async (req, res) => {
  res.status(410).json({
    error: 'This endpoint is deprecated.',
    message: 'OAuth initiation now happens on the frontend. Please update your integration.',
  });
});


/**
 * POST /api/auth/google/callback
 * Handle Google OAuth callback - Exchange code or tokens for session
 *
 * This endpoint handles two OAuth flows:
 *
 * 1. Authorization Code Flow (PKCE) - preferred, more secure:
 *    - Frontend initiates OAuth with Supabase
 *    - Frontend sends { code } to this endpoint
 *    - Backend exchanges code for session with Supabase
 *
 * 2. Implicit Flow - fallback for backward compatibility:
 *    - Frontend initiates OAuth with Supabase
 *    - Supabase returns tokens in URL hash
 *    - Frontend sends { accessToken, refreshToken } to this endpoint
 *    - Backend verifies tokens and sets HttpOnly cookies
 *
 * Request body:
 * - code: Authorization code (PKCE flow)
 * - accessToken: Access token from implicit flow
 * - refreshToken: Refresh token from implicit flow
 */
router.post('/google/callback', async (req, res) => {
  try {
    const { code, accessToken, refreshToken } = req.body;

    // Set security headers for all auth responses
    setAuthSecurityHeaders(res);

    // Handle Authorization Code Flow (preferred - PKCE)
    if (code) {
      // Exchange authorization code for session using Supabase
      // Supabase handles PKCE verification internally using the code_verifier
      // that was stored in a cookie when OAuth was initiated from the frontend
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);

      if (error || !data.session) {
        console.error('[Auth] Code exchange error:', error);
        return res.status(401).json({ error: 'Failed to exchange authorization code for session' });
      }

      // Set httpOnly cookies with tokens (tokens never exposed to frontend)
      res.cookie('access_token', data.session.access_token, COOKIE_OPTIONS);
      res.cookie('refresh_token', data.session.refresh_token, COOKIE_OPTIONS);

      // Set CSRF token for subsequent requests
      setCsrfCookie(req, res, () => {});

      return res.json({
        message: 'Signed in with Google successfully',
        userId: data.user?.id,
        email: data.user?.email,
      });
    }

    // Handle Implicit Flow (fallback for backward compatibility)
    if (accessToken) {
      // Verify the access token with Supabase
      const { data: { user }, error: getUserError } = await supabase.auth.getUser(accessToken);

      if (getUserError || !user) {
        console.error('[Auth] Token verification error:', getUserError);
        return res.status(401).json({ error: 'Invalid or expired access token' });
      }

      // Get a fresh session using the refresh token if available
      let sessionAccessToken = accessToken;
      let sessionRefreshToken = refreshToken;

      if (refreshToken) {
        const { data: sessionData, error: sessionError } = await supabase.auth.refreshSession({
          refresh_token: refreshToken,
        });

        if (!sessionError && sessionData.session) {
          sessionAccessToken = sessionData.session.access_token;
          sessionRefreshToken = sessionData.session.refresh_token;
        }
      }

      // Set httpOnly cookies with tokens
      res.cookie('access_token', sessionAccessToken, COOKIE_OPTIONS);
      res.cookie('refresh_token', sessionRefreshToken || refreshToken, COOKIE_OPTIONS);

      // Set CSRF token for subsequent requests
      setCsrfCookie(req, res, () => {});

      return res.json({
        message: 'Signed in with Google successfully',
        userId: user.id,
        email: user.email,
      });
    }

    // Neither code nor tokens provided
    return res.status(400).json({ error: 'Authorization code or access token is required' });
  } catch (error) {
    console.error('[Auth] Google callback error:', error);
    setAuthSecurityHeaders(res);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
