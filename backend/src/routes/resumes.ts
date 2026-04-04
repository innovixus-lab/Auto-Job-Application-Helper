import { Router, Request, Response } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { requireAuth } from '../middleware/auth';
import { parsePDF, parseDOCX } from '../services/resumeParser';
import pool from '../db/pool';

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage();

const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('INVALID_FILE_TYPE'));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter,
});

const router = Router();

router.post(
  '/',
  requireAuth,
  (req: Request, res: Response) => {
    upload.single('file')(req, res, async (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ data: null, error: 'File size must not exceed 5 MB.', status: 400 });
        }
        if (err instanceof Error && err.message === 'INVALID_FILE_TYPE') {
          return res.status(400).json({ data: null, error: 'Only PDF and DOCX files are supported.', status: 400 });
        }
        return res.status(500).json({ data: null, error: 'Internal error', status: 500 });
      }

      if (!req.file) {
        return res.status(400).json({ data: null, error: 'No file uploaded.', status: 400 });
      }

      try {
        const userId = req.user!.id;
        const parsedResume =
          req.file.mimetype === 'application/pdf'
            ? await parsePDF(req.file.buffer)
            : await parseDOCX(req.file.buffer);

        // Use a memory reference instead of a disk path (Vercel has no writable FS)
        const fileRef = `memory:${userId}_${Date.now()}_${req.file.originalname}`;

        const result = await pool.query(
          `INSERT INTO resumes (user_id, file_ref, parsed_data)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id) DO UPDATE
             SET file_ref = EXCLUDED.file_ref,
                 parsed_data = EXCLUDED.parsed_data,
                 updated_at = now()
           RETURNING id`,
          [userId, fileRef, JSON.stringify(parsedResume)]
        );

        const { id } = result.rows[0];

        return res.status(201).json({
          data: {
            id,
            name: parsedResume.name,
            email: parsedResume.email,
            phone: parsedResume.phone,
            skills: parsedResume.skills,
            degree: parsedResume.degree,
            noOfPages: parsedResume.noOfPages,
            experienceLevel: parsedResume.experienceLevel,
            resumeScore: parsedResume.resumeScore,
            predictedField: parsedResume.predictedField,
            recommendedSkills: parsedResume.recommendedSkills,
            sectionFlags: parsedResume.sectionFlags,
            workExperienceCount: parsedResume.workExperience.length,
          },
          error: null,
          status: 201,
        });
      } catch (e) {
        return res.status(500).json({ data: null, error: 'Internal error', status: 500 });
      }
    });
  }
);

router.get('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await pool.query(
      'SELECT id, parsed_data, updated_at FROM resumes WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ data: null, error: 'No resume found.', status: 404 });
    }

    const row = result.rows[0];
    return res.status(200).json({
      data: {
        id: row.id,
        parsedData: row.parsed_data,
        updatedAt: row.updated_at,
      },
      error: null,
      status: 200,
    });
  } catch (e) {
    return res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

router.patch('/me', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const {
      name, email, phone, address,
      skills, workExperience, education, certifications, projects,
    } = req.body as Record<string, unknown>;

    const result = await pool.query(
      `UPDATE resumes
       SET parsed_data = parsed_data || $1::jsonb,
           updated_at  = now()
       WHERE user_id = $2
       RETURNING id`,
      [
        JSON.stringify({
          ...(name           !== undefined && { name }),
          ...(email          !== undefined && { email }),
          ...(phone          !== undefined && { phone }),
          ...(address        !== undefined && { address }),
          ...(skills         !== undefined && { skills }),
          ...(workExperience !== undefined && { workExperience }),
          ...(education      !== undefined && { education }),
          ...(certifications !== undefined && { certifications }),
          ...(projects       !== undefined && { projects }),
        }),
        userId,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ data: null, error: 'No resume found. Upload a resume first.', status: 404 });
    }

    return res.status(200).json({ data: { ok: true }, error: null, status: 200 });
  } catch (err) {
    console.error('[PATCH /resumes/me]', err);
    return res.status(500).json({ data: null, error: 'Internal error', status: 500 });
  }
});

export default router;
