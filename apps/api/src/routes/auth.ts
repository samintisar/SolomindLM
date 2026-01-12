import { Router } from 'express';
import { supabase } from '../config/database.js';
import { z } from 'zod';
import { promisify } from 'util';

// Simple in-memory rate limiter for auth endpoints
const authRateLimiter = new Map<string, { count: number; resetTime: number }>();

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
// For production: Use 'strict' for better security
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production' ? true : false,
  sameSite: (process.env.NODE_ENV === 'production' ? 'strict' : 'lax') as 'strict' | 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Get the current user's session
 */
router.get('/me', async (req, res) => {
  try {
    const accessToken = req.cookies.access_token;
    if (!accessToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(accessToken);

    if (error || !user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    res.json({
      userId: user.id,
      email: user.email,
    });
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh an access token using a refresh token
 */
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refresh_token || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

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
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Update cookies with new tokens
    res.cookie('access_token', data.session.access_token, COOKIE_OPTIONS);
    res.cookie('refresh_token', data.session.refresh_token, COOKIE_OPTIONS);

    res.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/google
 * Initiate Google OAuth flow
 */
router.get('/google', async (req, res) => {
  try {
    const redirectUrl = req.query.redirect as string || `${req.protocol}://${req.get('host')}/auth/callback`;

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
      },
    });

    if (error) {
      console.error('Google OAuth initiation error:', error);
      return res.status(400).json({ error: error.message });
    }

    // Redirect user to Google OAuth consent screen
    res.redirect(data.url);
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/google/callback
 * Handle Google OAuth callback and verify tokens
 */
router.post('/google/callback', async (req, res) => {
  try {
    const { accessToken, refreshToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({ error: 'Access token is required' });
    }

    // Verify the access token with Supabase
    const { data: { user }, error: getUserError } = await supabase.auth.getUser(accessToken);

    if (getUserError || !user) {
      console.error('Token verification error:', getUserError);
      return res.status(401).json({ error: 'Invalid or expired token' });
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

    res.json({
      message: 'Signed in with Google successfully',
      userId: user.id,
      email: user.email,
    });
  } catch (error) {
    console.error('Google callback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
