import { Router } from 'express';
import documentsRouter from './documents.js';
import authRouter from './auth.js';
import notebooksRouter from './notebooks.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/documents', documentsRouter);
router.use('/notebooks', notebooksRouter);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
