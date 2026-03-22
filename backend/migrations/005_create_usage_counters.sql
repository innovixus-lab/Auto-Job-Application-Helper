CREATE TABLE usage_counters (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month                   CHAR(7) NOT NULL,
  cover_letters_generated INT NOT NULL DEFAULT 0,
  answers_generated       INT NOT NULL DEFAULT 0,
  applications_stored     INT NOT NULL DEFAULT 0,
  UNIQUE (user_id, month)
);
