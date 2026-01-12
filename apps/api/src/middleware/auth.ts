/**
 * Centralized authentication middleware for SolomindLM API
 *
 * Provides consistent authentication and authorization across all routes
 */

import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/database.js';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
      };
    }
  }
}

/**
 * Extract token from Authorization header or cookies
 * Priority: Authorization header > cookies
 */
function extractToken(req: Request): string | null {
  // First try Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Fallback to cookies (for httpOnly cookie-based auth)
  const accessToken = (req as any).cookies?.access_token;
  if (accessToken) {
    return accessToken;
  }

  return null;
}

/**
 * Authentication middleware - validates JWT token and attaches user to request
 *
 * Usage: router.get('/protected', authenticate, (req, res) => {...})
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);

    if (!token) {
      res.status(401).json({ error: 'Unauthorized: No token provided' });
      return;
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      res.status(401).json({ error: 'Unauthorized: Invalid token' });
      return;
    }

    // Attach user to request for use in route handlers
    req.user = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch (error) {
    console.error('[Auth] Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
}

/**
 * Optional authentication - attaches user if token is valid, but doesn't require it
 *
 * Usage: router.get('/public', optionalAuth, (req, res) => {...})
 */
export async function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);

    if (!token) {
      next();
      return;
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (!error && user) {
      req.user = {
        id: user.id,
        email: user.email,
      };
    }

    next();
  } catch (error) {
    console.error('[Auth] Optional auth error:', error);
    next();
  }
}

/**
 * Helper to get userId from request (for backward compatibility)
 * @deprecated Use req.user.id directly instead
 */
export function getUserIdFromRequest(req: Request): string | null {
  return req.user?.id || null;
}
