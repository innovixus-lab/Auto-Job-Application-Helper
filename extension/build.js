const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const output = fs.createWriteStream(path.join(__dirname, 'extension-dist.zip'));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  console.log('Extension packaged: extension-dist.zip');
});

archive.on('error', (err) => {
  throw err;
});

archive.pipe(output);

archive.directory('icons/', 'icons');
archive.directory('popup/', 'popup');
archive.glob('src/**/*', {
  ignore: ['src/__tests__/**']
});
archive.file('manifest.json', { name: 'manifest.json' });

archive.finalize();
