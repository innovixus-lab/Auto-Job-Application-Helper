# Code Review Graph — Auto Job Application Helper

## Dependency Graph

```
Extension (Chrome MV3)
├── background.js (Service Worker)
│   ├── JobDetector (inlined)
│   ├── → POST /auth/register
│   ├── → POST /auth/login
│   ├── → POST /auth/logout
│   ├── → POST /resumes (multipart)
│   ├── → POST /generate/cover-letter
│   ├── → POST /generate/answers
│   └── → POST /applications
├── content.js
│   ├── jobDetector.js
│   ├── jdExtractor.js
│   │   ├── linkedinExtractor.js
│   │   ├── indeedExtractor.js
│   │   ├── greenhouseExtractor.js
│   │   ├── leverExtractor.js
│   │   ├── workdayExtractor.js
│   │   └── icimsExtractor.js
│   └── formFiller.js
└── popup/popup.js → background.js (messages)

Backend (Express/TypeScript)
├── index.ts → app.ts
├── app.ts
│   ├── middleware/requestLogger.ts
│   ├── middleware/rateLimiter.ts
│   ├── middleware/envelope.ts
│   ├── middleware/auth.ts → lib/tokens.ts
│   ├── middleware/validate.ts
│   ├── routes/auth.ts → db/pool.ts, lib/tokens.ts
│   ├── routes/resumes.ts → services/resumeParser.ts, db/pool.ts
│   ├── routes/match.ts → services/matchEngine.ts, db/pool.ts
│   ├── routes/generate.ts → services/aiGenerator.ts, db/pool.ts
│   ├── routes/applications.ts → db/pool.ts
│   ├── routes/stripe.ts → db/pool.ts
│   └── routes/usage.ts → db/pool.ts
├── services/
│   ├── aiGenerator.ts → OpenAI SDK (Groq baseURL)
│   ├── matchEngine.ts (pure, no DB)
│   └── resumeParser.ts → pdf-parse, mammoth
└── db/
    ├── pool.ts → PostgreSQL (DATABASE_URL)
    └── migrate.ts → pool.ts + migrations/*.sql
```

## Key Data Flows

| Flow | Path |
|------|------|
| Auth | popup → background → `/auth/*` → bcrypt/JWT → PostgreSQL |
| Resume upload | popup → background → `/resumes` → resumeParser → PostgreSQL |
| AI generation | overlay → background → `/generate/*` → aiGenerator → Groq API |
| Match score | overlay → background → `/match` → matchEngine → PostgreSQL |
| Application tracking | overlay → background → `/applications` → PostgreSQL |
| Stripe webhooks | Stripe → `/webhooks/stripe` → PostgreSQL (tier update) |

## External Dependencies

| Service | Purpose | Config Key |
|---------|---------|------------|
| PostgreSQL (Railway) | Primary database | `DATABASE_URL` |
| Groq API | AI cover letter & answer generation | `GROQ_API_KEY` |
| Stripe | Payment processing & tier management | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Google OAuth | Social login | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| SMTP | Password reset emails | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` |
