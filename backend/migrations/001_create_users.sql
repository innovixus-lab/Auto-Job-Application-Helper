CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT UNIQUE NOT NULL,
  password_hash     TEXT,
  oauth_provider    TEXT,
  oauth_sub         TEXT,
  subscription_tier TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
