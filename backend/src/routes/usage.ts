import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { requireAuth } from '../middleware/auth';

const router = Router();

// GET /usage/me
router.get('/me', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id;

  try {
    const currentMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-03"

    const [usageResult, userResult] = await Promise.all([
      pool.query(
        `SELECT cover_letters_generated, answers_generated, applications_stored
         FROM usage_counters WHERE user_id = $1 AND month = $2`,
        [userId, currentMonth]
      ),
      pool.query('SELECT subscription_tier FROM users WHERE id = $1', [userId]),
    ]);

    const usage = usageResult.rows[0];
    const tier = userResult.rows[0]?.subscription_tier ?? 'free';

    res.json({
      data: {
        coverLettersUsed: usage ? Number(usage.cover_letters_generated) : 0,
        answersUsed: usage ? Number(usage.answers_generated) : 0,
        applicationsStored: usage ? Number(usage.applications_stored) : 0,
        tier,
      },
      error: null,
      status: 200,
    });
  } catch (err) {
    console.error('Usage endpoint error:', err);
    res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

export default router;
