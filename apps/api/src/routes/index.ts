import { Router } from 'express';
import documentsRouter from './documents.js';
import authRouter from './auth.js';
import notebooksRouter from './notebooks.js';
import sourcesRouter from './sources.js';
import reportsRouter from './reports.js';
import notesRouter from './notes.js';
import mindmapsRouter from './mindmaps.js';
import flashcardsRouter from './flashcards.js';
import quizzesRouter from './quizzes.js';
import writtenQuestionsRouter from './writtenQuestions.js';
import chatRouter from './chat.js';
import audioOverviewsRouter from './audio-overviews.js';
import foldersRouter from './folders.js';
import subscriptionsRouter from './subscriptions.js';
import webhookRouter from './webhook.js';
import slidesRouter from './slides.js';

const router = Router();

router.use('/auth', authRouter);
router.use('/documents', documentsRouter);
router.use('/notebooks', notebooksRouter);
router.use('/sources', sourcesRouter);
router.use('/reports', reportsRouter);
router.use('/notes', notesRouter);
router.use('/mindmaps', mindmapsRouter);
router.use('/flashcards', flashcardsRouter);
router.use('/quizzes', quizzesRouter);
router.use('/written-questions', writtenQuestionsRouter);
router.use('/chat', chatRouter);
router.use('/audio-overviews', audioOverviewsRouter);
router.use('/folders', foldersRouter);
router.use('/subscriptions', subscriptionsRouter);
router.use('/webhook', webhookRouter);
router.use('/slides', slidesRouter);

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
