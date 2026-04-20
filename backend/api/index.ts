import type { IncomingMessage, ServerResponse } from 'http';

let handler: (req: IncomingMessage, res: ServerResponse) => void;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const app = require('../src/app').default;
  handler = app;
} catch (err: any) {
  // If the app fails to load, return the error as JSON so we can diagnose it
  handler = (_req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      data: null,
      error: `App failed to load: ${err?.message ?? String(err)}`,
      stack: err?.stack?.split('\n').slice(0, 5),
      status: 500,
    }));
  };
}

export default handler;
