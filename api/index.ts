// Vercel serverless entry point - minimal version for debugging
import type { IncomingMessage, ServerResponse } from 'http';

// Step 1: Test if basic handler works
const handler = async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
    const missing = REQUIRED.filter((k) => !process.env[k]);

    if (missing.length > 0) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        data: null,
        error: `Missing env vars: ${missing.join(', ')}`,
        status: 500,
      }));
      return;
    }

    // Try loading the app
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const appModule = require('../backend/src/app');
    const app = appModule.default || appModule;
    app(req, res);

  } catch (err: any) {
    console.error('[Vercel Handler Error]', err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      data: null,
      error: `Crash: ${err?.message ?? String(err)}`,
      stack: err?.stack ?? null,
      status: 500,
    }));
  }
};

export default handler;
