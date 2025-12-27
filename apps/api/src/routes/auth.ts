import { Router } from 'express';
import { supabase } from '../config/database.js';
import { z } from 'zod';

const router = Router();

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
  try {
    const { email, password } = registerSchema.parse(req.body);

    // Sign up user with Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      // Check if user already exists
      if (error.message.includes('already been registered')) {
        return res.status(400).json({
          error: 'An account with this email already exists. Please sign in instead.',
        });
      }
      return res.status(400).json({ error: error.message });
    }

    // Check if user was created (sometimes Supabase returns success without creating user if email confirmation is required)
    if (!data.user) {
      return res.status(400).json({
        error: 'Failed to create user. Please try again.',
      });
    }

    // Get the session
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData.session) {
      return res.status(201).json({
        message: 'User registered successfully. Please check your email to confirm your account.',
        userId: data.user.id,
        needsConfirmation: true,
      });
    }

    res.status(201).json({
      message: 'User registered successfully',
      userId: data.user.id,
      email: data.user.email,
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/login
 * Sign in a user using Supabase Auth
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Sign in user with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Handle specific error messages
      if (error.message.includes('Invalid login credentials')) {
        return res.status(401).json({
          error: 'Invalid email or password',
        });
      }
      if (error.message.includes('Email not confirmed')) {
        return res.status(401).json({
          error: 'Please confirm your email before signing in',
        });
      }
      return res.status(400).json({ error: error.message });
    }

    if (!data.session) {
      return res.status(401).json({
        error: 'Failed to create session. Please try again.',
      });
    }

    res.json({
      message: 'Signed in successfully',
      userId: data.user.id,
      email: data.user.email,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
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
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    res.json({
      userId: session.user.id,
      email: session.user.email,
      accessToken: session.access_token,
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
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token is required' });
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refreshToken,
    });

    if (error || !data.session) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    res.json({
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
