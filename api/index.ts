// Vercel serverless entry point
// Validates env vars and exports the Express app as the default handler

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missing = REQUIRED.filter((k) => !process.env[k]);

if (missing.length > 0) {
  const handler = (_req: any, res: any) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      data: null,
      error: `Missing environment variables: ${missing.join(', ')}. Add them in Vercel → Settings → Environment Variables.`,
      status: 500,
    }));
  };
  module.exports = handler;
} else {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const app = require('../backend/src/app').default;
    module.exports = app;
  } catch (err: any) {
    console.error('[Vercel] Failed to load app:', err);
    const handler = (_req: any, res: any) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: null,
        error: `Server failed to start: ${err?.message ?? 'Unknown error'}`,
        status: 500,
      }));
    };
    module.exports = handler;
  }
}
