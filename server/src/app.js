import express from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { requireAuth, register, login } from './auth.js';
import leads from './routes/leads.js';
import work from './routes/work.js';
import billing from './routes/billing.js';
import reports from './routes/reports.js';

export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.CLIENT_URL || true }));
  app.use(express.json({ limit: '200kb' }));
  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.post('/api/auth/register', register);
  app.post('/api/auth/login', login);
  app.use('/api', requireAuth);
  app.use('/api/leads', leads);
  app.use('/api', work);
  app.use('/api', billing);
  app.use('/api/reports', reports);
  app.use((err, _req, res, _next) => {
    if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid input', details: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`) });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });
  return app;
}
