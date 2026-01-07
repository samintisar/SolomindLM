import Stripe from 'stripe';
import { env } from './env.js';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Price IDs for subscription tiers
export const STRIPE_PRICES = {
  PRO_MONTHLY: env.STRIPE_PRO_MONTHLY_PRICE_ID,
  PRO_YEARLY: env.STRIPE_PRO_YEARLY_PRICE_ID,
} as const;
