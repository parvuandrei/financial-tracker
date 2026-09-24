const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep) || relative.split('/').some(p => p.startsWith('.')) || !types[path.extname(file)]) {
    res.writeHead(404); res.end(); return;
  }
  fs.readFile(file, (error, data) => {
    res.writeHead(error ? 404 : 200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'no-store' });
    res.end(error ? 'Not found' : data);
  });
}).listen(4173, '127.0.0.1', () => console.log('FinTrack preview: http://127.0.0.1:4173'));
