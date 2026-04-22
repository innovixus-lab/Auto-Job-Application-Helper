// Vercel serverless entry point
// Loads the pre-compiled backend from backend/dist/

const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missing = REQUIRED.filter((k) => !process.env[k]);

if (missing.length > 0) {
  module.exports = (_req: any, res: any) => {
    res.status(500).json({
      data: null,
      error: `Missing environment variables: ${missing.join(', ')}`,
      status: 500,
    });
  };
} else {
  // Load the compiled JS (built by: cd backend && npm run build)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const app = require('../backend/dist/app').default;
  module.exports = app;
}
