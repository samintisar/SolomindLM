import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { TavilySearchService } from '../services/discovery/TavilySearchService.js';

const router = Router();
const tavilyService = new TavilySearchService();

/**
 * POST /api/sources/discover
 * Search for web sources using Tavily Search API
 */
router.post(
  '/discover',
  [
    // Validation middleware
    body('query')
      .trim()
      .isLength({ min: 2, max: 500 })
      .withMessage('Query must be between 2 and 500 characters'),
    body('scoreThreshold')
      .optional()
      .isFloat({ min: 0, max: 1 })
      .withMessage('Score threshold must be between 0 and 1'),
    body('excludeDomains')
      .optional()
      .isArray()
      .withMessage('Exclude domains must be an array'),
    body('maxResults')
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage('Max results must be between 1 and 20'),
  ],
  async (req: Request, res: Response) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array(),
      });
    }

    try {
      const { query, scoreThreshold, excludeDomains, maxResults } = req.body;

      console.log(`[Sources] Discovery request: query="${query}", threshold=${scoreThreshold || 0.5}`);

      // Call Tavily service
      const sources = await tavilyService.discoverSources({
        query,
        scoreThreshold: scoreThreshold || 0.5,
        excludeDomains: excludeDomains || [],
        maxResults: maxResults || 10,
      });

      // Return successful response
      res.json({
        query,
        count: sources.length,
        sources,
      });

    } catch (error) {
      console.error('[Sources] Discovery error:', error);

      // Return appropriate error response
      const statusCode = error instanceof Error && error.message.includes('API key')
        ? 500
        : 503; // Service Unavailable for external API failures

      res.status(statusCode).json({
        error: error instanceof Error ? error.message : 'Source discovery failed',
      });
    }
  }
);

export default router;
