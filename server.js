// Simple static file server for the Nexbot bots showcase site.
// No dependencies - uses only Node.js built-in modules.
//
// Run:   node server.js
// Open:  http://localhost:3000
//
// The port can be changed with the PORT environment variable:
//   PORT=8080 node server.js

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// ---- Visitor counter (stored in data/visitors.json) ----
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'visitors.json');
const MAX_VISITORS = 200000;
let db = { totalVisits: 0, visitors: [] }; // visitors: [{ id, first, last, visits }]
try {
  const loaded = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  if (loaded && Array.isArray(loaded.visitors)) db = loaded;
} catch (e) { /* first run */ }
const byId = new Map(db.visitors.map((v) => [v.id, v]));
let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(db));
      fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
    } catch (e) { console.error('save failed:', e.message); }
  }, 500);
}
function stats() {
  return {
    uniqueVisitors: db.visitors.length,
    totalVisits: db.totalVisits,
    visitors: db.visitors.slice(-100).map((v, i, arr) => ({
      n: db.visitors.length - arr.length + i + 1,
      first: v.first,
      visits: v.visits,
    })).reverse(),
  };
}
function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
}
function handleApi(req, res, pathname) {
  if (pathname === '/api/stats' && req.method === 'GET') return sendJson(res, 200, stats());
  if (pathname === '/api/visit' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1024) req.destroy(); });
    req.on('end', () => {
      let id = '';
      try { id = String(JSON.parse(body).id || ''); } catch (e) { /* ignore */ }
      if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return sendJson(res, 400, { error: 'bad id' });
      const now = Date.now();
      let v = byId.get(id);
      db.totalVisits++;
      if (!v) {
        if (db.visitors.length >= MAX_VISITORS) return sendJson(res, 200, stats());
        v = { id, first: now, last: now, visits: 1 };
        db.visitors.push(v);
        byId.set(id, v);
      } else {
        v.last = now;
        v.visits++;
      }
      scheduleSave();
      sendJson(res, 200, stats());
    });
    return;
  }
  return sendJson(res, 404, { error: 'not found' });
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  if (req.url.split('?')[0].startsWith('/api/')) return handleApi(req, res, req.url.split('?')[0]);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    return send(res, 400, 'Bad Request');
  }

  if (pathname.endsWith('/')) pathname += 'index.html';

  // Resolve inside PUBLIC_DIR only (blocks "../" path traversal)
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    return send(res, 403, 'Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Unknown path -> serve the main page (single page site)
      const fallback = path.join(PUBLIC_DIR, 'index.html');
      return fs.readFile(fallback, (e, data) => {
        if (e) return send(res, 404, 'Not Found');
        send(res, 200, req.method === 'HEAD' ? undefined : data, {
          'Content-Type': MIME_TYPES['.html'],
          'Cache-Control': 'no-cache',
        });
      });
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME_TYPES[ext] || 'application/octet-stream';
    const isHtml = ext === '.html';

    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stats.size,
      'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=86400',
      'X-Content-Type-Options': 'nosniff',
    });

    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Nexbot site is running on http://localhost:${PORT}`);
});
