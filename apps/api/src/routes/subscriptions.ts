import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { subscriptionService } from '../services/SubscriptionService.js';

const router = Router();

// ============================================================
// Validation Schemas
// ============================================================

const createCheckoutSchema = z.object({
  interval: z.enum(['month', 'year']),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
  userId: z.string().uuid().optional(), // Optional in body, will be validated by middleware
});

const portalSchema = z.object({
  returnUrl: z.string().url(),
});

// ============================================================
// Middleware
// ============================================================

const validateUserId = (req: Request, res: Response, next: Function) => {
  const userId = req.body?.userId || req.query?.userId || req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    return res.status(401).json({ error: 'Unauthorized: userId is required' });
  }
  req.userId = userId;
  next();
};

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

// ============================================================
// Routes
// ============================================================

/**
 * POST /api/subscriptions/create-checkout
 * Create a Stripe Checkout session for a new subscription
 */
router.post('/create-checkout', validateUserId, async (req: Request, res: Response) => {
  try {
    const { interval, successUrl, cancelUrl } = createCheckoutSchema.parse(req.body);
    const userId = req.userId!;

    const session = await subscriptionService.createCheckoutSession(
      userId,
      interval,
      successUrl,
      cancelUrl
    );

    res.json(session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    console.error('[Subscriptions] Create checkout error:', error);
    
    // Return more detailed error message in development
    const errorMessage = error instanceof Error 
      ? error.message 
      : 'Failed to create checkout session';
    
    const statusCode = errorMessage.includes('not configured') || errorMessage.includes('not found')
      ? 500
      : 500;
    
    res.status(statusCode).json({ 
      error: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { 
        stack: error instanceof Error ? error.stack : undefined 
      })
    });
  }
});

/**
 * GET /api/subscriptions/status
 * Get subscription status for current user
 */
router.get('/status', validateUserId, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const status = await subscriptionService.getSubscriptionStatus(userId);
    res.json(status);
  } catch (error) {
    console.error('[Subscriptions] Get status error:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

/**
 * POST /api/subscriptions/cancel
 * Cancel subscription at period end
 */
router.post('/cancel', validateUserId, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    await subscriptionService.cancelSubscription(userId);
    res.json({ message: 'Subscription will be canceled at period end' });
  } catch (error) {
    if (error instanceof Error && error.message === 'No active subscription found') {
      return res.status(404).json({ error: error.message });
    }
    console.error('[Subscriptions] Cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

/**
 * POST /api/subscriptions/portal
 * Create a customer portal session
 */
router.post('/portal', validateUserId, async (req: Request, res: Response) => {
  try {
    const { returnUrl } = portalSchema.parse(req.body);
    const userId = req.userId!;

    const session = await subscriptionService.createPortalSession(userId, returnUrl);
    res.json(session);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0].message });
    }
    if (error instanceof Error && error.message === 'No Stripe customer found') {
      return res.status(404).json({ error: error.message });
    }
    console.error('[Subscriptions] Portal error:', error);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

export default router;
