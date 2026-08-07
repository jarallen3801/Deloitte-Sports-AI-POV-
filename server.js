const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Simple JSON-based log (no native compilation required) ───────────────────
const LOG_PATH = process.env.LOG_PATH || path.join(__dirname, 'access_log.json');

function readLog() {
  try {
    if (!fs.existsSync(LOG_PATH)) return [];
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  } catch { return []; }
}

function writeLog(entries) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(entries, null, 2), 'utf8');
}

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(express.json());

// ── Serve the microsite HTML ─────────────────────────────────────────────────
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'HC_Sports_AI_POV_vFinal.html');
  if (!fs.existsSync(htmlPath)) {
    return res.status(404).send('Microsite file not found.');
  }
  res.sendFile(htmlPath);
});

// ── Log email on successful password entry ───────────────────────────────────
app.post('/api/access', (req, res) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email.' });
  }

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown';

  const userAgent = req.headers['user-agent'] || 'unknown';

  const entries = readLog();
  entries.unshift({
    id: entries.length + 1,
    email,
    ip,
    user_agent: userAgent,
    accessed_at: new Date().toISOString()
  });
  writeLog(entries);

  res.json({ ok: true });
});

// ── View access log (password-protected) ────────────────────────────────────
// Access via: GET /api/logs?key=YOUR_ADMIN_KEY&format=html
app.get('/api/logs', (req, res) => {
  const adminKey = process.env.ADMIN_KEY || 'deloitte-admin-2026';
  if (req.query.key !== adminKey) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const entries = readLog();
  const format = req.query.format || 'json';

  if (format === 'html') {
    const rows_html = entries.map(r =>
      `<tr>
        <td>${r.id}</td>
        <td>${r.email}</td>
        <td>${r.ip}</td>
        <td>${r.accessed_at}</td>
        <td style="font-size:11px;max-width:300px;overflow:hidden">${r.user_agent}</td>
      </tr>`
    ).join('');

    return res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Access Log — Deloitte Sports AI POV</title>
        <style>
          body { font-family: sans-serif; padding: 32px; background: #f5f5f5; }
          h1 { font-size: 18px; margin-bottom: 16px; }
          table { border-collapse: collapse; width: 100%; background: #fff; }
          th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 13px; }
          th { background: #86BC25; color: #000; font-weight: 700; }
          tr:nth-child(even) { background: #f9f9f9; }
        </style>
      </head>
      <body>
        <h1>Access Log — ${entries.length} visitor${entries.length !== 1 ? 's' : ''}</h1>
        <table>
          <thead>
            <tr><th>#</th><th>Email</th><th>IP</th><th>Accessed At (UTC)</th><th>User Agent</th></tr>
          </thead>
          <tbody>${rows_html}</tbody>
        </table>
      </body>
      </html>
    `);
  }

  res.json({ count: entries.length, logs: entries });
});

// ── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Deloitte Sports AI POV running on port ${PORT}`);
});