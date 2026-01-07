import { Router, Request, Response } from 'express';
import { ChatAgent } from '../services/agents/ChatAgent.js';
import { ChatHistoryService } from '../services/storage/ChatHistoryService.js';
import { rateLimiter } from '../middleware/rateLimiter.js';

const router = Router();
const chatAgent = new ChatAgent();
const chatHistoryService = new ChatHistoryService();

// ============================================================
// Configuration
// ============================================================

const CONFIG = {
  MESSAGE: {
    MAX_LENGTH: 10000,
    MIN_LENGTH: 1,
  },
  HISTORY: {
    DEFAULT_LIMIT: 50,
    MAX_LIMIT: 100,
  },
} as const;

// ============================================================
// Middleware
// ============================================================

/**
 * Validate userId from request
 */
const validateUserId = (req: Request, res: Response, next: Function) => {
  const userId = req.body?.userId || req.query?.userId || req.headers['x-user-id'];

  if (!userId || typeof userId !== 'string') {
    return res.status(401).json({ error: 'Unauthorized: userId is required' });
  }

  req.userId = userId;
  next();
};

// Extend Express Request type
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
 * POST /api/chat/message
 * Send a message and stream the response via SSE
 */
router.post('/message', rateLimiter('chat'), validateUserId, async (req: Request, res: Response) => {
  const { notebookId, message, documentIds } = req.body;
  const userId = req.userId!;

  // Validation
  if (!notebookId) {
    return res.status(400).json({ error: 'notebookId is required' });
  }

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  if (typeof message !== 'string') {
    return res.status(400).json({ error: 'message must be a string' });
  }

  if (message.length < CONFIG.MESSAGE.MIN_LENGTH || message.length > CONFIG.MESSAGE.MAX_LENGTH) {
    return res.status(400).json({
      error: `message must be between ${CONFIG.MESSAGE.MIN_LENGTH} and ${CONFIG.MESSAGE.MAX_LENGTH} characters`,
    });
  }

  // Validate documentIds if provided
  if (documentIds !== undefined && !Array.isArray(documentIds)) {
    return res.status(400).json({ error: 'documentIds must be an array' });
  }

  console.log(`[Chat /message] ========== NEW MESSAGE ==========`);
  console.log(`[Chat /message] userId=${userId}, notebookId=${notebookId}`);
  console.log(`[Chat /message] message="${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
  if (documentIds && documentIds.length > 0) {
    console.log(`[Chat /message] documentIds=${documentIds.length} selected documents`);
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial keep-alive
  res.write(': keep-alive\n\n');
  console.log('[Chat /message] SSE connection established, sent keep-alive');

  try {
    // Get or create conversation
    console.log('[Chat /message] Getting or creating conversation...');
    const conversation = await chatHistoryService.getOrCreateConversation(userId, notebookId);
    console.log(`[Chat /message] Conversation ID: ${conversation.id}`);

    // Add user message to database
    console.log('[Chat /message] Saving user message to database...');
    await chatHistoryService.addUserMessage(conversation.id, userId, message);
    console.log('[Chat /message] User message saved');

    // Get conversation history
    console.log('[Chat /message] Loading conversation history...');
    const history = await chatHistoryService.getMessages(conversation.id, CONFIG.HISTORY.DEFAULT_LIMIT);

    // Format history for agent (exclude the just-added user message)
    // Strip citations like [1], [2] from AI responses to prevent LLM from mimicking citation format
    // without actually searching for sources
    const conversationHistory = history
      .filter(m => m.content !== message)
      .map(m => ({
        role: m.role,
        content: m.role === 'assistant'
          ? m.content.replace(/\[\d+\]/g, '') // Remove citations from AI responses
          : m.content
      }));

    console.log(`[Chat /message] Loaded ${conversationHistory.length} historical messages`);
    console.log(`[Chat /message] Historical messages:`, conversationHistory.map((m, i) => ({
      idx: i,
      role: m.role,
      content_length: m.content.length,
    })));

    // Stream response
    let fullResponse = '';
    let collectedReferences: any[] = [];
    let hasError = false;
    let chunksReceived = 0;

    console.log('[Chat /message] Starting agent stream...');
    const startTime = Date.now();

    for await (const chunk of chatAgent.streamResponse(
      { userId, noteId: notebookId, conversationHistory, documentIds },
      message
    )) {
      chunksReceived++;
      console.log(`[Chat /message] Chunk ${chunksReceived}: type=${chunk.type}, has_data=${!!chunk.data}`);

      if (chunk.type === 'token') {
        fullResponse += chunk.data;
        const sseData = `data: ${JSON.stringify({ type: 'token', content: chunk.data })}\n\n`;
        res.write(sseData);
        console.log(`[Chat /message] Sent token (${chunk.data.length} chars): "${chunk.data.substring(0, 50)}..."`);
      } else if (chunk.type === 'references') {
        collectedReferences = chunk.data;
        const sseData = `data: ${JSON.stringify({ type: 'references', data: chunk.data })}\n\n`;
        res.write(sseData);
        console.log(`[Chat /message] Sent ${chunk.data.length} references`);
      } else if (chunk.type === 'done') {
        const sseData = `data: ${JSON.stringify({ type: 'done' })}\n\n`;
        res.write(sseData);
        console.log(`[Chat /message] Sent done signal`);
      } else if (chunk.type === 'error') {
        hasError = true;
        const sseData = `data: ${JSON.stringify({ type: 'error', error: chunk.data })}\n\n`;
        res.write(sseData);
        console.error(`[Chat /message] Sent error: ${chunk.data}`);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[Chat /message] ========== STREAM COMPLETE ==========`);
    console.log(`[Chat /message] Total chunks: ${chunksReceived}`);
    console.log(`[Chat /message] Response length: ${fullResponse.length} chars`);
    console.log(`[Chat /message] References collected: ${collectedReferences.length}`);
    console.log(`[Chat /message] Time elapsed: ${elapsed}ms`);
    console.log(`[Chat /message] Has error: ${hasError}`);

    // Save assistant message if no error
    if (!hasError && fullResponse.length > 0) {
      console.log('[Chat /message] Saving assistant message to database...');
      await chatHistoryService.addAssistantMessage(
        conversation.id,
        userId,
        fullResponse,
        collectedReferences,
        {
          model: process.env.FAST_LLM || 'meta-llama/Llama-3.2-3B-Instruct-Turbo',
          timestamp: new Date().toISOString(),
        }
      );
      console.log(`[Chat /message] Saved assistant response (${fullResponse.length} chars, ${collectedReferences.length} refs)`);
    } else if (hasError) {
      console.error('[Chat /message] Error occurred during streaming, message not saved');
    } else if (fullResponse.length === 0) {
      console.warn('[Chat /message] WARNING: Stream completed but no response generated!');
    }

    console.log('[Chat /message] Closing SSE connection');
    res.end();
  } catch (error) {
    console.error('[Chat /message] ========== UNHANDLED ERROR ==========');
    console.error('[Chat /message] Error:', error);
    if (error instanceof Error) {
      console.error('[Chat /message] Error name:', error.name);
      console.error('[Chat /message] Error message:', error.message);
      console.error('[Chat /message] Error stack:', error.stack);
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
    res.end();
  }
});

/**
 * GET /api/chat/history/:notebookId
 * Get conversation history for a notebook
 */
router.get('/history/:notebookId', validateUserId, async (req: Request, res: Response) => {
  const { notebookId } = req.params;
  const userId = req.userId!;
  const limit = parseInt(req.query.limit as string) || CONFIG.HISTORY.DEFAULT_LIMIT;

  console.log(`[Chat /history] userId=${userId}, notebookId=${notebookId}`);

  try {
    const limitClamped = Math.min(limit, CONFIG.HISTORY.MAX_LIMIT);

    const conversation = await chatHistoryService.getOrCreateConversation(userId, notebookId);
    const messages = await chatHistoryService.getMessages(conversation.id, limitClamped);

    res.json({
      conversationId: conversation.id,
      title: conversation.title,
      messages,
    });
  } catch (error) {
    console.error('[Chat /history] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch conversation history';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * DELETE /api/chat/history/:notebookId
 * Clear all messages in a conversation
 */
router.delete('/history/:notebookId', validateUserId, async (req: Request, res: Response) => {
  const { notebookId } = req.params;
  const userId = req.userId!;

  console.log(`[Chat /history DELETE] userId=${userId}, notebookId=${notebookId}`);

  try {
    const conversation = await chatHistoryService.getOrCreateConversation(userId, notebookId);
    await chatHistoryService.clearConversation(conversation.id, userId);

    res.json({ success: true, message: 'Conversation history cleared' });
  } catch (error) {
    console.error('[Chat /history DELETE] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to clear conversation history';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * PATCH /api/chat/rename/:notebookId
 * Rename a conversation
 */
router.patch('/rename/:notebookId', validateUserId, async (req: Request, res: Response) => {
  const { notebookId } = req.params;
  const userId = req.userId!;
  const { title } = req.body;

  console.log(`[Chat /rename] userId=${userId}, notebookId=${notebookId}, title="${title}"`);

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  if (typeof title !== 'string' || title.length > 255) {
    return res.status(400).json({ error: 'title must be a string with max 255 characters' });
  }

  try {
    const conversation = await chatHistoryService.getOrCreateConversation(userId, notebookId);
    await chatHistoryService.renameConversation(conversation.id, userId, title);

    res.json({ success: true, title });
  } catch (error) {
    console.error('[Chat /rename] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to rename conversation';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * DELETE /api/chat/conversation/:notebookId
 * Delete a conversation and all its messages
 */
router.delete('/conversation/:notebookId', validateUserId, async (req: Request, res: Response) => {
  const { notebookId } = req.params;
  const userId = req.userId!;

  console.log(`[Chat /conversation DELETE] userId=${userId}, notebookId=${notebookId}`);

  try {
    const conversation = await chatHistoryService.getOrCreateConversation(userId, notebookId);
    await chatHistoryService.deleteConversation(conversation.id, userId);

    res.json({ success: true, message: 'Conversation deleted' });
  } catch (error) {
    console.error('[Chat /conversation DELETE] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to delete conversation';
    res.status(500).json({ error: errorMessage });
  }
});

export default router;
