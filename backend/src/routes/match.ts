import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import pool from '../db/pool';
import { computeMatch } from '../services/matchEngine';
import type { ParsedResume, JobDescription } from '../services/matchEngine';

const router = Router();

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { resumeId, jobDescriptionId } = req.body as {
    resumeId?: string;
    jobDescriptionId?: string;
  };

  if (!resumeId || !jobDescriptionId) {
    return res.status(400).json({
      data: null,
      error: 'resumeId and jobDescriptionId are required',
      status: 400,
    });
  }

  const userId = req.user!.id;

  try {
    // Fetch resume and verify ownership
    const resumeResult = await pool.query(
      'SELECT parsed_data FROM resumes WHERE id = $1 AND user_id = $2',
      [resumeId, userId]
    );

    if (resumeResult.rows.length === 0) {
      return res.status(404).json({
        data: null,
        error: 'Resume not found',
        status: 404,
      });
    }

    // Fetch job description and verify ownership
    const jdResult = await pool.query(
      'SELECT extracted_data FROM job_descriptions WHERE id = $1 AND user_id = $2',
      [jobDescriptionId, userId]
    );

    if (jdResult.rows.length === 0) {
      return res.status(404).json({
        data: null,
        error: 'Job description not found',
        status: 404,
      });
    }

    const parsedResume = resumeResult.rows[0].parsed_data as ParsedResume;
    const jobDescription = jdResult.rows[0].extracted_data as JobDescription;

    const { score, missingKeywords } = computeMatch(parsedResume, jobDescription);

    return res.status(200).json({
      data: { score, missingKeywords },
      error: null,
      status: 200,
    });
  } catch (e) {
    return res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

export default router;
