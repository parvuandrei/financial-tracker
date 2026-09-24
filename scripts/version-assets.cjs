// Run after changing browser assets so cached files cannot mix releases.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'index.html');
const original = fs.readFileSync(file, 'utf8');
const versioned = original.replace(/(src|href)="([\w./-]+\.(?:js|css))(?:\?v=[\w-]+)?"/g, (_, attr, asset) => {
  const text = fs.readFileSync(path.join(root, asset), 'utf8').replace(/\r\n/g, '\n');
  const version = crypto.createHash('sha256').update(text).digest('hex').slice(0, 12);
  return `${attr}="${asset}?v=${version}"`;
});
if (process.argv.includes('--check')) {
  if (original !== versioned) {
    console.error('Browser assets changed. Run node scripts/version-assets.cjs before publishing.');
    process.exitCode = 1;
  } else console.log('Browser asset versions are current.');
} else {
  fs.writeFileSync(file, versioned);
  console.log('Updated browser asset versions.');
}
