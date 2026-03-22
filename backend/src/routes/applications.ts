import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import pool from '../db/pool';

const router = Router();

const VALID_STATUSES = ['Applied', 'Phone Screen', 'Interview', 'Offer', 'Rejected', 'Withdrawn'];

// POST /applications
router.post('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const userTier = req.user!.tier;
    const { jobDescriptionId, matchScore, coverLetterText } = req.body;

    if (!jobDescriptionId) {
      return res.status(400).json({ data: null, error: 'jobDescriptionId is required', status: 400 });
    }

    // Fetch job description (must belong to this user)
    const jdResult = await pool.query(
      'SELECT id, source_url, extracted_data FROM job_descriptions WHERE id = $1 AND user_id = $2',
      [jobDescriptionId, userId]
    );

    if (jdResult.rows.length === 0) {
      return res.status(404).json({ data: null, error: 'Job description not found', status: 404 });
    }

    const jd = jdResult.rows[0];

    // Check free-tier limit
    if (userTier === 'free') {
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM applications WHERE user_id = $1',
        [userId]
      );
      if (parseInt(countResult.rows[0].count, 10) >= 25) {
        return res.status(402).json({
          data: null,
          error: 'Free tier limit of 25 applications reached',
          status: 402,
        });
      }
    }

    // Check for duplicate
    const dupResult = await pool.query(
      'SELECT id FROM applications WHERE user_id = $1 AND job_description_id = $2',
      [userId, jobDescriptionId]
    );

    if (dupResult.rows.length > 0) {
      return res.status(409).json({
        data: { duplicate: true, existingId: dupResult.rows[0].id },
        error: 'Duplicate application',
        status: 409,
      });
    }

    // Create application
    const insertResult = await pool.query(
      `INSERT INTO applications (user_id, job_description_id, match_score, cover_letter_text, status)
       VALUES ($1, $2, $3, $4, 'Applied')
       RETURNING id, job_description_id, match_score, cover_letter_text, status, applied_at, updated_at`,
      [userId, jobDescriptionId, matchScore ?? null, coverLetterText ?? null]
    );

    const app = insertResult.rows[0];

    // Increment usage_counters.applications_stored (upsert)
    await pool.query(
      `INSERT INTO usage_counters (user_id, applications_stored)
       VALUES ($1, 1)
       ON CONFLICT (user_id) DO UPDATE
         SET applications_stored = usage_counters.applications_stored + 1,
             updated_at = now()`,
      [userId]
    );

    const extractedData = jd.extracted_data as Record<string, unknown>;

    return res.status(201).json({
      data: {
        id: app.id,
        jobDescriptionId: app.job_description_id,
        jobTitle: extractedData?.title ?? null,
        company: extractedData?.company ?? null,
        jobUrl: jd.source_url,
        matchScore: app.match_score,
        coverLetterText: app.cover_letter_text,
        status: app.status,
        appliedAt: app.applied_at,
        updatedAt: app.updated_at,
      },
      error: null,
      status: 201,
    });
  } catch (e) {
    return res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

// GET /applications
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;

    const countResult = await pool.query(
      'SELECT COUNT(*) FROM applications WHERE user_id = $1',
      [userId]
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await pool.query(
      `SELECT a.id, a.match_score, a.status, a.applied_at,
              jd.source_url, jd.extracted_data
       FROM applications a
       JOIN job_descriptions jd ON jd.id = a.job_description_id
       WHERE a.user_id = $1
       ORDER BY a.applied_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    const applications = result.rows.map((row: Record<string, unknown>) => {
      const extractedData = row.extracted_data as Record<string, unknown>;
      return {
        id: row.id,
        jobTitle: extractedData?.title ?? null,
        company: extractedData?.company ?? null,
        jobUrl: row.source_url,
        matchScore: row.match_score,
        status: row.status,
        appliedAt: row.applied_at,
      };
    });

    return res.status(200).json({
      data: { applications, total, page, limit },
      error: null,
      status: 200,
    });
  } catch (e) {
    return res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

// PATCH /applications/:id
router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        data: null,
        error: `status must be one of: ${VALID_STATUSES.join(', ')}`,
        status: 400,
      });
    }

    const result = await pool.query(
      `UPDATE applications
       SET status = $1, updated_at = now()
       WHERE id = $2 AND user_id = $3
       RETURNING id, job_description_id, match_score, cover_letter_text, status, applied_at, updated_at`,
      [status, id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ data: null, error: 'Application not found', status: 404 });
    }

    const app = result.rows[0];
    return res.status(200).json({
      data: {
        id: app.id,
        jobDescriptionId: app.job_description_id,
        matchScore: app.match_score,
        coverLetterText: app.cover_letter_text,
        status: app.status,
        appliedAt: app.applied_at,
        updatedAt: app.updated_at,
      },
      error: null,
      status: 200,
    });
  } catch (e) {
    return res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

// GET /applications/:id
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT a.id, a.match_score, a.cover_letter_text, a.status, a.applied_at, a.updated_at,
              jd.id AS jd_id, jd.source_url, jd.extracted_data, jd.platform
       FROM applications a
       JOIN job_descriptions jd ON jd.id = a.job_description_id
       WHERE a.id = $1 AND a.user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ data: null, error: 'Application not found', status: 404 });
    }

    const row = result.rows[0];
    const extractedData = row.extracted_data as Record<string, unknown>;

    return res.status(200).json({
      data: {
        id: row.id,
        matchScore: row.match_score,
        coverLetterText: row.cover_letter_text,
        status: row.status,
        appliedAt: row.applied_at,
        updatedAt: row.updated_at,
        jobDescription: {
          id: row.jd_id,
          sourceUrl: row.source_url,
          platform: row.platform,
          extractedData: row.extracted_data,
        },
      },
      error: null,
      status: 200,
    });
  } catch (e) {
    return res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

export default router;
