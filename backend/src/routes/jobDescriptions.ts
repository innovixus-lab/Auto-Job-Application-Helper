import { Router, Request, Response } from 'express';
import pool from '../db/pool';
import { requireAuth } from '../middleware/auth';

const router = Router();

// POST /job-descriptions — save a job description extracted by the extension
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { platform, sourceUrl, title, company, location, employmentType, body } = req.body;

  if (!sourceUrl) {
    return res.status(400).json({ data: null, error: 'sourceUrl is required', status: 400 });
  }

  try {
    const extractedData = { title, company, location, employmentType, body };

    // Upsert: if same user + sourceUrl already exists, update extracted_data
    const result = await pool.query(
      `INSERT INTO job_descriptions (user_id, source_url, platform, extracted_data)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, source_url) DO UPDATE
         SET extracted_data = EXCLUDED.extracted_data,
             platform = EXCLUDED.platform
       RETURNING id, source_url, platform, extracted_data, created_at`,
      [userId, sourceUrl, platform ?? 'unknown', JSON.stringify(extractedData)]
    );

    const row = result.rows[0];
    return res.status(201).json({
      data: {
        id: row.id,
        sourceUrl: row.source_url,
        platform: row.platform,
        extractedData: row.extracted_data,
        createdAt: row.created_at,
      },
      error: null,
      status: 201,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

// GET /job-descriptions/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const { id } = req.params;

  try {
    const result = await pool.query(
      'SELECT id, source_url, platform, extracted_data, created_at FROM job_descriptions WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ data: null, error: 'Not found', status: 404 });
    }

    const row = result.rows[0];
    return res.status(200).json({
      data: { id: row.id, sourceUrl: row.source_url, platform: row.platform, extractedData: row.extracted_data, createdAt: row.created_at },
      error: null,
      status: 200,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

export default router;
