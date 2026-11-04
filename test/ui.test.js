'use strict';
// Ejecuta test/ui.html en Chrome sin interfaz y comprueba sus resultados.
// Necesita Google Chrome; se omite si no está (o definir CHROME_PATH).
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const CHROME = CANDIDATES.find((p) => fs.existsSync(p));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function runChrome(url) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-test-'));
  const args = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=' + profile, '--virtual-time-budget=30000', '--dump-dom', url];
  return new Promise((resolve, reject) => {
    execFile(CHROME, args, { timeout: 90000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      fs.rmSync(profile, { recursive: true, force: true });
      if (err && !stdout) reject(err); else resolve(stdout);
    });
  });
}

test('interfaz en Chrome sin interfaz', { skip: CHROME ? false : 'Chrome no encontrado (definir CHROME_PATH)', timeout: 120000 }, async (t) => {
  let server;
  try {
    server = await serve();
  } catch (err) {
    // Entornos aislados pueden prohibir abrir puertos locales.
    if (err && (err.code === 'EPERM' || err.code === 'EACCES')) {
      t.skip('no se puede abrir un servidor local (' + err.code + ')');
      return;
    }
    throw err;
  }
  try {
    const dom = await runChrome('http://127.0.0.1:' + server.address().port + '/test/ui.html');
    const m = dom.match(/<pre id="results">([\s\S]*?)<\/pre>/);
    assert.ok(m, 'sin resultados en el DOM');
    const raw = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    assert.notEqual(raw, 'PENDING', 'las pruebas no terminaron');
    const results = JSON.parse(raw);
    for (const r of results) {
      await t.test(r.name, () => assert.ok(r.ok, r.error));
    }
  } finally {
    server.close();
  }
});
