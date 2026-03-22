import express, { Request, Response, NextFunction } from 'express';
import authRouter from './routes/auth';
import resumeRouter from './routes/resumes';
import matchRouter from './routes/match';
import generateRouter from './routes/generate';
import applicationsRouter from './routes/applications';
import stripeRouter from './routes/stripe';
import usageRouter from './routes/usage';
import { requestLogger } from './middleware/requestLogger';
import { rateLimiter } from './middleware/rateLimiter';
import { envelope } from './middleware/envelope';

const app = express();

// Stripe webhook must be mounted BEFORE express.json() to receive raw body
app.use('/webhooks/stripe', express.raw({ type: 'application/json' }), stripeRouter);

// Request logging — early, before routes (but after stripe webhook)
app.use(requestLogger);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting — after body parsing
app.use(rateLimiter);

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.json({ data: { status: 'ok' }, error: null, status: 200 });
});

// Routes
app.use('/auth', authRouter);
app.use('/resumes', resumeRouter);
app.use('/match', matchRouter);
app.use('/generate', generateRouter);

app.use('/applications', applicationsRouter);
app.use('/usage', usageRouter);

// Placeholder route stubs — implemented in later tasks
// app.use('/job-descriptions', jobDescriptionsRouter); // TODO (task 4.x): implement job descriptions CRUD

// Envelope middleware — safety net to ensure all JSON responses have { data, error, status } shape
app.use(envelope);

// 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({ data: null, error: 'Not found', status: 404 });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ data: null, error: 'Internal error', status: 500 });
});

export default app;
