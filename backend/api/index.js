// Register ts-node to handle TypeScript files
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'commonjs',
    esModuleInterop: true,
    skipLibCheck: true
  }
});

let handler;
try {
  const app = require('../src/app').default;
  handler = app;
} catch (err) {
  handler = (req, res) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ data: null, error: err.message, stack: err.stack?.split('\n').slice(0,8), status: 500 }));
  };
}

module.exports = handler;
