const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Config — every secret comes from the environment, never from this file ───
const GATE_PASSWORD = process.env.GATE_PASSWORD || '';
const ADMIN_KEY = process.env.ADMIN_KEY || '';

// ── Simple JSON-based log (no native compilation required) ───────────────────
// Set LOG_PATH to a path inside the persistent volume (/data) or every deploy
// wipes the file along with the rest of the container filesystem.
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

// Local requests are never gated and never counted as real traffic.
function isLocal(req) {
  return ['localhost', '127.0.0.1', '::1'].includes(req.hostname);
}

// Every event goes to stdout (visible in the Coolify Logs tab) AND to the JSON
// file (queryable at /api/logs). Either sink can fail without losing the other.
function recordEvent(kind, email, req) {
  const at = new Date().toISOString();
  console.log(`[${kind}] ${email} at ${at}`);

  const ip =
    req.headers['x-forwarded-for']?.split(',')[0].trim() ||
    req.socket.remoteAddress ||
    'unknown';

  try {
    const entries = readLog();
    entries.unshift({
      id: entries.length + 1,
      kind,
      email,
      ip,
      user_agent: req.headers['user-agent'] || 'unknown',
      accessed_at: at
    });
    writeLog(entries);
  } catch (err) {
    // Never fail a request over an unwritable log file — but say so loudly,
    // because a silent failure here is exactly what hid the log last time.
    console.error(`[LOG-ERROR] could not write ${LOG_PATH}: ${err.message}`);
  }
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

// ── Does the client need to show the gate at all? ────────────────────────────
app.get('/api/gate-status', (req, res) => {
  res.json({ gateEnabled: !!GATE_PASSWORD && !isLocal(req) });
});

// ── Verify the gate password and log the visitor ─────────────────────────────
// The password itself lives only in the GATE_PASSWORD env var. The browser
// never receives it — it can only submit a guess and be told yes or no.
app.post('/api/verify', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email.' });
  }
  if (!GATE_PASSWORD) {
    return res.status(503).json({ error: 'Gate not configured.' });
  }
  if (password !== GATE_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  if (!isLocal(req)) recordEvent('ACCESS', email, req);
  res.json({ ok: true });
});

// ── Return visit inside the 10-day remembered-session window ─────────────────
app.post('/api/view', (req, res) => {
  const { email } = req.body || {};
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !isLocal(req)) {
    recordEvent('VIEW', email, req);
  }
  res.json({ ok: true });
});

// ── View access log (password-protected) ────────────────────────────────────
// Access via: GET /api/logs?key=YOUR_ADMIN_KEY&format=html
app.get('/api/logs', (req, res) => {
  if (!ADMIN_KEY) {
    return res.status(503).json({ error: 'ADMIN_KEY not configured.' });
  }
  if (req.query.key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const entries = readLog();
  const format = req.query.format || 'json';

  if (format === 'html') {
    const rows_html = entries.map(r =>
      `<tr>
        <td>${r.id}</td>
        <td>${r.kind || 'ACCESS'}</td>
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
            <tr><th>#</th><th>Event</th><th>Email</th><th>IP</th><th>Accessed At (UTC)</th><th>User Agent</th></tr>
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
  console.log(`[CONFIG] log path: ${LOG_PATH}`);
  if (!GATE_PASSWORD) console.warn('[CONFIG] GATE_PASSWORD is not set — the gate is OPEN.');
  if (!ADMIN_KEY) console.warn('[CONFIG] ADMIN_KEY is not set — /api/logs is disabled.');
  if (!LOG_PATH.startsWith('/data')) {
    console.warn('[CONFIG] LOG_PATH is outside /data — the log will be wiped on redeploy.');
  }
});
