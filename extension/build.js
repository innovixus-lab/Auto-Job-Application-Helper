const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const esbuild = require('esbuild');

async function build() {
  // Bundle content.js (uses ES module imports) into a single IIFE file
  await esbuild.build({
    entryPoints: ['src/content.js'],
    bundle: true,
    outfile: 'src/content.bundle.js',
    format: 'iife',
    target: 'chrome100',
    platform: 'browser',
  });

  console.log('Bundled content.js → src/content.bundle.js');

  // Package extension
  const output = fs.createWriteStream(path.join(__dirname, 'extension-dist.zip'));
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    console.log('Extension packaged: extension-dist.zip');
  });

  archive.on('error', (err) => { throw err; });
  archive.pipe(output);

  archive.directory('icons/', 'icons');
  archive.directory('popup/', 'popup');

  // Include all src files EXCEPT the unbundled content.js source
  archive.glob('src/**/*', {
    ignore: ['src/__tests__/**', 'src/content.js'],
  });

  // The bundled content script is already at src/content.bundle.js
  archive.file('manifest.json', { name: 'manifest.json' });

  await archive.finalize();
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
