import type { IncomingMessage, ServerResponse } from 'http';

// Validate required env vars before importing the app
// (missing vars cause pg pool to crash with an unhelpful error)
const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missing = REQUIRED.filter(k => !process.env[k]);

if (missing.length > 0) {
  // Export a simple handler that explains the problem
  module.exports = (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      data: null,
      error: `Missing environment variables: ${missing.join(', ')}. Set them in Vercel dashboard → Settings → Environment Variables.`,
      status: 500,
    }));
  };
} else {
  // All env vars present — load the full Express app
  const { default: app } = require('../backend/src/app');
  module.exports = app;
}
