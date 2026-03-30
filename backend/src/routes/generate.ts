import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import pool from '../db/pool';
import { generateCoverLetter, generateAnswers, generateResumeLatex, AIServiceError } from '../services/aiGenerator';
import { extractMissingKeywords } from '../services/matchEngine';
import type { ParsedResume, JobDescription } from '../services/matchEngine';

const router = Router();

/**
 * POST /generate/cover-letter
 * Body: { jobDescriptionId: string, resumeId: string }
 * Returns: { data: { coverLetterText: string }, error: null, status: 200 }
 */
router.post('/cover-letter', requireAuth, async (req: Request, res: Response) => {
  const { jobDescriptionId, resumeId } = req.body as {
    jobDescriptionId?: string;
    resumeId?: string;
  };

  if (!jobDescriptionId || !resumeId) {
    return res.status(400).json({
      data: null,
      error: 'jobDescriptionId and resumeId are required',
      status: 400,
    });
  }

  const userId = req.user!.id;
  const userTier = req.user!.tier;

  // Enforce free-tier limit: 5 cover letters per calendar month
  const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  try {
    if (userTier === 'free') {
      const usageResult = await pool.query(
        'SELECT cover_letters_generated FROM usage_counters WHERE user_id = $1 AND month = $2',
        [userId, currentMonth]
      );
      const used = usageResult.rows[0]?.cover_letters_generated ?? 0;
      if (used >= 5) {
        return res.status(402).json({ data: null, error: 'Limit exceeded', status: 402 });
      }
    }

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

    const { coverLetterText } = await generateCoverLetter(parsedResume, jobDescription);

    // Increment usage counter after successful generation
    await pool.query(
      `INSERT INTO usage_counters (user_id, month, cover_letters_generated)
       VALUES ($1, $2, 1)
       ON CONFLICT (user_id, month)
       DO UPDATE SET cover_letters_generated = usage_counters.cover_letters_generated + 1`,
      [userId, currentMonth]
    );

    return res.status(200).json({
      data: { coverLetterText },
      error: null,
      status: 200,
    });
  } catch (err: unknown) {
    if (err instanceof AIServiceError) {
      return res.status(502).json({
        data: null,
        error: 'AI service unavailable',
        status: 502,
      });
    }

    return res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

/**
 * POST /generate/answers
 * Body: { jobDescriptionId: string, resumeId: string, questions: string[] }
 * Returns: { data: { answers: Array<{ question: string, answer: string }> }, error: null, status: 200 }
 */
router.post('/answers', requireAuth, async (req: Request, res: Response) => {
  const { jobDescriptionId, resumeId, questions } = req.body as {
    jobDescriptionId?: string;
    resumeId?: string;
    questions?: unknown;
  };

  if (!jobDescriptionId || !resumeId) {
    return res.status(400).json({
      data: null,
      error: 'jobDescriptionId and resumeId are required',
      status: 400,
    });
  }

  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({
      data: null,
      error: 'questions must be a non-empty array',
      status: 400,
    });
  }

  const userId = req.user!.id;
  const userTier = req.user!.tier;

  // Get current month as 'YYYY-MM'
  const currentMonth = new Date().toISOString().slice(0, 7);

  try {
    // Enforce free-tier limit: 10 answers per calendar month
    if (userTier === 'free') {
      const usageResult = await pool.query(
        'SELECT answers_generated FROM usage_counters WHERE user_id = $1 AND month = $2',
        [userId, currentMonth]
      );
      const used = usageResult.rows[0]?.answers_generated ?? 0;
      if (used >= 10) {
        return res.status(402).json({ data: null, error: 'Limit exceeded', status: 402 });
      }
    }

    // Fetch resume and verify ownership
    const resumeResult = await pool.query(
      'SELECT parsed_data FROM resumes WHERE id = $1 AND user_id = $2',
      [resumeId, userId]
    );

    if (resumeResult.rows.length === 0) {
      return res.status(404).json({ data: null, error: 'Resume not found', status: 404 });
    }

    // Fetch job description and verify ownership
    const jdResult = await pool.query(
      'SELECT extracted_data FROM job_descriptions WHERE id = $1 AND user_id = $2',
      [jobDescriptionId, userId]
    );

    if (jdResult.rows.length === 0) {
      return res.status(404).json({ data: null, error: 'Job description not found', status: 404 });
    }

    const parsedResume = resumeResult.rows[0].parsed_data as ParsedResume;
    const jobDescription = jdResult.rows[0].extracted_data as JobDescription;

    const { answers } = await generateAnswers(parsedResume, jobDescription, questions as string[]);

    // Increment usage counter after successful generation
    await pool.query(
      `INSERT INTO usage_counters (user_id, month, answers_generated)
       VALUES ($1, $2, 1)
       ON CONFLICT (user_id, month)
       DO UPDATE SET answers_generated = usage_counters.answers_generated + 1`,
      [userId, currentMonth]
    );

    return res.status(200).json({ data: { answers }, error: null, status: 200 });
  } catch (err: unknown) {
    if (err instanceof AIServiceError) {
      return res.status(502).json({ data: null, error: 'AI service unavailable', status: 502 });
    }
    return res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

/**
 * POST /generate/resume-latex
 * Body: { jobDescriptionId: string, resumeId: string }
 * Returns: { data: { latexCode: string, missingKeywords: string[] }, error: null, status: 200 }
 *
 * Compares the uploaded resume against the job description, identifies missing
 * ATS keywords, then generates a fully tailored one-page LaTeX resume.
 */
router.post('/resume-latex', requireAuth, async (req: Request, res: Response) => {
  const { jobDescriptionId, resumeId } = req.body as {
    jobDescriptionId?: string;
    resumeId?: string;
  };

  if (!jobDescriptionId || !resumeId) {
    return res.status(400).json({
      data: null,
      error: 'jobDescriptionId and resumeId are required',
      status: 400,
    });
  }

  const userId = req.user!.id;

  try {
    const [resumeResult, jdResult] = await Promise.all([
      pool.query('SELECT parsed_data FROM resumes WHERE id = $1 AND user_id = $2', [resumeId, userId]),
      pool.query('SELECT extracted_data FROM job_descriptions WHERE id = $1 AND user_id = $2', [jobDescriptionId, userId]),
    ]);

    if (resumeResult.rows.length === 0) {
      return res.status(404).json({ data: null, error: 'Resume not found', status: 404 });
    }
    if (jdResult.rows.length === 0) {
      return res.status(404).json({ data: null, error: 'Job description not found', status: 404 });
    }

    const parsedResume  = resumeResult.rows[0].parsed_data  as ParsedResume;
    const jobDescription = jdResult.rows[0].extracted_data as JobDescription;

    // Identify missing keywords before generation so the AI can weave them in
    const missingKeywords = extractMissingKeywords(parsedResume, jobDescription, 15);

    const { latexCode } = await generateResumeLatex(parsedResume, jobDescription, missingKeywords);

    return res.status(200).json({
      data: { latexCode, missingKeywords },
      error: null,
      status: 200,
    });
  } catch (err: unknown) {
    if (err instanceof AIServiceError) {
      return res.status(502).json({ data: null, error: 'AI service unavailable', status: 502 });
    }
    return res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

export default router;
