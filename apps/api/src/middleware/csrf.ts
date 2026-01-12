/**
 * CSRF (Cross-Site Request Forgery) protection middleware
 *
 * For state-changing operations, this provides protection against CSRF attacks
 * by validating tokens sent with requests.
 *
 * Note: Since this application uses Supabase Auth with JWT tokens stored in
 * Authorization headers, the primary CSRF protection comes from:
 * 1. SameSite cookie attribute
 * 2. Authorization header requirement (cookies can't set Authorization headers)
 * 3. CORS configuration
 *
 * This middleware provides additional protection for state-changing operations.
 */

import { Request, Response, NextFunction } from 'express';
import { AppError } from './error.js';
import crypto from 'crypto';

declare global {
  namespace Express {
    interface Request {
      csrfToken?: () => string;
    }
  }
}

/**
 * CSRF secret - should be stored securely (env var in production)
 * In development, we use a fixed secret for simplicity
 */
const CSRF_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');

/**
 * Token expiration time (1 hour)
 */
const TOKEN_EXPIRY = 60 * 60 * 1000;

/**
 * Methods that don't require CSRF protection (safe/idempotent)
 */
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Routes that require CSRF protection
 */
const PROTECTED_ROUTES = [
  '/api/notebooks',
  '/api/documents',
  '/api/flashcards',
  '/api/quizzes',
];

/**
 * Generates a CSRF token
 */
function generateToken(sessionId: string): string {
  const timestamp = Date.now();
  const data = `${sessionId}:${timestamp}`;
  const hmac = crypto.createHmac('sha256', CSRF_SECRET);
  hmac.update(data);
  const signature = hmac.digest('hex');
  return Buffer.from(`${data}:${signature}`).toString('base64');
}

/**
 * Validates a CSRF token
 */
function validateToken(token: string, sessionId: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [tokenSessionId, timestamp, signature] = decoded.split(':');

    // Check session matches
    if (tokenSessionId !== sessionId) {
      return false;
    }

    // Check token expiration
    const tokenTime = parseInt(timestamp, 10);
    if (isNaN(tokenTime) || Date.now() - tokenTime > TOKEN_EXPIRY) {
      return false;
    }

    // Verify signature
    const data = `${tokenSessionId}:${timestamp}`;
    const hmac = crypto.createHmac('sha256', CSRF_SECRET);
    hmac.update(data);
    const expectedSignature = hmac.digest('hex');

    return signature === expectedSignature;
  } catch {
    return false;
  }
}

/**
 * Gets session ID from request
 * Uses user ID as session identifier for authenticated requests
 */
function getSessionId(req: Request): string {
  return req.user?.id || req.ip || 'anonymous';
}

/**
 * CSRF token generation middleware
 *
 * Generates and provides a CSRF token for the current session
 */
export function generateCsrfToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const sessionId = getSessionId(req);
  const token = generateToken(sessionId);

  // Provide token as a function
  req.csrfToken = () => token;

  // Set token in cookie for client-side access
  // Match sameSite settings with auth cookies for cross-origin compatibility
  res.cookie('XSRF-TOKEN', token, {
    httpOnly: false, // Client needs to read this to include in requests
    secure: process.env.NODE_ENV === 'production' ? true : false,
    sameSite: process.env.NODE_ENV === 'production' ? ('strict' as const) : ('none' as const),
    maxAge: TOKEN_EXPIRY,
    path: '/',
  });

  next();
}

/**
 * CSRF validation middleware
 *
 * Validates CSRF token for state-changing operations
 */
export function validateCsrfToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip validation for safe methods
  if (SAFE_METHODS.includes(req.method)) {
    next();
    return;
  }

  // Skip validation for webhooks (they have their own signature verification)
  if (req.path.includes('/webhook')) {
    next();
    return;
  }

  // Check if route requires CSRF protection
  const isProtectedRoute = PROTECTED_ROUTES.some(route =>
    req.path.startsWith(route)
  );

  if (!isProtectedRoute) {
    next();
    return;
  }

  // For authenticated requests using JWT tokens in Authorization header,
  // we have inherent CSRF protection since browsers can't set custom headers
  // in cross-origin requests
  if (req.headers.authorization) {
    next();
    return;
  }

  // Otherwise, validate CSRF token
  const token =
    req.headers['x-csrf-token'] as string ||
    req.headers['x-xsrf-token'] as string ||
    req.body?._csrf;

  const sessionId = getSessionId(req);

  if (!token || !validateToken(token, sessionId)) {
    throw new AppError(
      'Invalid CSRF token. Please refresh the page and try again.',
      403,
      true,
      'INVALID_CSRF_TOKEN'
    );
  }

  next();
}

/**
 * Combined CSRF middleware that generates and validates tokens
 *
 * Usage:
 * - For protected routes: app.use(csrfProtection)
 * - To get token: Call req.csrfToken() in your route handler
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Always generate a token
  generateCsrfToken(req, res, () => {
    // Validate for state-changing operations
    validateCsrfToken(req, res, next);
  });
}

/**
 * CSRF token endpoint
 *
 * Returns a fresh CSRF token for the current session
 */
export function getCsrfToken(
  req: Request,
  res: Response
): void {
  const token = req.csrfToken?.();

  if (!token) {
    throw new AppError(
      'Unable to generate CSRF token',
      500,
      true,
      'CSRF_GENERATION_FAILED'
    );
  }

  res.json({ token });
}
