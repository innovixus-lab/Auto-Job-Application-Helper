CREATE TABLE applications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_description_id UUID NOT NULL REFERENCES job_descriptions(id),
  match_score        SMALLINT CHECK (match_score BETWEEN 0 AND 100),
  cover_letter_text  TEXT,
  status             TEXT NOT NULL DEFAULT 'Applied',
  applied_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
