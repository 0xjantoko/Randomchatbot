/**
 * Admin API Server - Lightweight, serves dashboard + metrics
 * Runs alongside main bot, ~20MB RAM extra
 */

import express from 'express';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { getQuarantinedUsers, clearQuarantine, clearBracketLock } from '../database/db.js';
import { listEvidenceMeta, readEvidence, evidenceCount } from '../services/evidence.js';
import { anonymizeUserId } from '../utils/privacy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import metrics (will be connected to main bot later)
let metrics;
try {
  metrics = (await import('./metrics.js')).default;
} catch (e) {
  // Placeholder if not loaded yet
  metrics = {
    getCurrent: () => ({ users_online: 0, messages_total: 0, photos_total: 0, violations_total: 0, bans_total: 0, sessions_started: 0, warnings_issued: 0, voice_total: 0 }),
    getHistory: () => [],
    getSummary: () => ({ uptime_hours: 0 })
  };
}

// Import logger
let logger;
try {
  logger = (await import('./logger.js')).default;
} catch (e) {
  logger = { info: () => {}, warn: () => {}, error: () => {}, readLogs: () => [] };
}

const ADMIN_PORT = process.env.ADMIN_PORT || 3001;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY;

if (!ADMIN_API_KEY) {
  console.error('❌ FATAL: ADMIN_API_KEY environment variable is required.');
  console.error('   Set it via: export ADMIN_API_KEY="your-secure-random-key"');
  process.exit(1);
}

const app = express();

// Middleware
app.use(express.json());

// Auth middleware
function requireAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== ADMIN_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Auth middleware for SSE (query param or header)
function requireAuthSSE(req, res, next) {
  const apiKey = req.query.apiKey || req.headers['x-api-key'];
  if (apiKey !== ADMIN_API_KEY) {
    res.writeHead(401);
    res.end();
    return;
  }
  next();
}

// Serve static dashboard (Svelte build preferred, fallback to vanilla HTML)
const distPath = path.join(__dirname, '../../dist/admin');
const hasSvelteBuild = existsSync(path.join(distPath, 'index.html'));

app.use('/admin', express.static(distPath));

app.get('/admin', (req, res) => {
  // Redirect /admin → /admin/ so static middleware serves index.html
  if (hasSvelteBuild) {
    res.redirect(301, '/admin/');
  } else {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
  }
});

// ============ SSE Traffic Stream ============

let poolService = null;
let sessionService = null;

export function setTrafficServices(pool, session) {
  poolService = pool;
  sessionService = session;
}

function getTrafficSnapshot() {
  const poolSize = poolService ? poolService.getPoolSize() : 0;
  const activeSessions = sessionService ? sessionService.getActiveSessions() : 0;
  const current = metrics.getCurrent();

  return {
    timestamp: Date.now(),
    pool_waiting: poolSize,
    active_sessions: activeSessions,
    users_online: activeSessions * 2,
    messages_total: current.messages_total,
    messages_per_sec: current.messages_per_sec,
    photos_total: current.photos_total,
    sessions_started: current.sessions_started,
    violations_total: current.violations_total,
    bans_total: current.bans_total,
    voice_total: current.voice_total
  };
}

// SSE endpoint — pushes traffic snapshot every 2 seconds
app.get('/admin/api/traffic/stream', requireAuthSSE, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  // Send initial snapshot
  res.write(`data: ${JSON.stringify(getTrafficSnapshot())}\n\n`);

  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify(getTrafficSnapshot())}\n\n`);
  }, 2000);

  req.on('close', () => {
    clearInterval(interval);
  });
});

// REST: Get traffic snapshot (for initial load)
app.get('/admin/api/traffic', requireAuth, (req, res) => {
  res.json(getTrafficSnapshot());
});

// REST: Get active users list (anonymized)
app.get('/admin/api/active-users', requireAuth, (req, res) => {
  if (!sessionService) {
    return res.json({ users: [] });
  }
  const users = sessionService.getAllSessions();
  res.json({ users });
});

// API: Get all metrics
app.get('/admin/api/metrics', requireAuth, (req, res) => {
  const summary = metrics.getSummary();
  const history = metrics.getHistory();
  
  res.json({
    current: summary.current,
    history,
    uptime_hours: summary.uptime_hours
  });
});

// API: Get specific metric
app.get('/admin/api/metrics/:type', requireAuth, (req, res) => {
  const { type } = req.params;
  const current = metrics.getCurrent();
  
  if (type in current) {
    res.json({ [type]: current[type] });
  } else {
    res.status(404).json({ error: 'Metric not found' });
  }
});

// API: Get encrypted logs
app.get('/admin/api/logs', requireAuth, (req, res) => {
  const lines = parseInt(req.query.lines) || 100;
  const logs = logger.readLogs(lines);
  res.json({ logs });
});

// API: Get encryption info
app.get('/admin/api/encryption', requireAuth, (req, res) => {
  res.json(logger.getKeyInfo());
});

// API: Get system info
app.get('/admin/api/system', requireAuth, (req, res) => {
  res.json({
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    platform: process.platform,
    nodeVersion: process.version
  });
});

// API: Quarantine queue (bracket-breach review) — user tetap anonim (Anon-XXXX)
app.get('/admin/api/quarantine', requireAuth, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const users = getQuarantinedUsers(limit).map(u => ({
    anon_id: anonymizeUserId(u.user_id),
    user_id: u.user_id,
    quarantined_at: u.quarantined_at,
    reason: u.quarantine_reason,
    bracket_locked: u.bracket_locked,
    trust_level: u.trust_level
  }));
  res.json({ count: users.length, users });
});

// API: Release a user from quarantine (admin review lulus)
app.post('/admin/api/quarantine/:userId/release', requireAuth, (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: 'Invalid userId' });
  }
  clearQuarantine(userId);
  if (req.body?.unlock_bracket === true) clearBracketLock(userId);
  logger.warn('quarantine_release', { userId, by: 'admin_api' });
  res.json({ ok: true, userId, bracket_unlocked: req.body?.unlock_bracket === true });
});

// API: Bukti (transcript terenkripsi, admin only) — metadata
app.get('/admin/api/evidence', requireAuth, (req, res) => {
  const userId = req.query.userId ? Number(req.query.userId) : null;
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const items = listEvidenceMeta({ userId: Number.isInteger(userId) ? userId : null, limit });
  res.json({ count: items.length, total: evidenceCount(), items });
});

// API: Bukti — isi transcript (didekripsi)
app.get('/admin/api/evidence/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });
  const row = readEvidence(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ evidence: row });
});

// Health check (no auth)
app.get('/admin/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Start server
export function startAdminServer(poolSvc, sessionSvc) {
  if (poolSvc) poolService = poolSvc;
  if (sessionSvc) sessionService = sessionSvc;

  const server = app.listen(ADMIN_PORT, () => {
    console.log(`✅ Admin Panel: http://localhost:${ADMIN_PORT}/admin`);
    console.log(`   API Key configured (env: ADMIN_API_KEY)`);
    logger.info('admin', { message: 'Admin server started', port: ADMIN_PORT });
  });
  
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.log(`⚠️ Admin server already running on port ${ADMIN_PORT}`);
    } else {
      console.error('Admin server error:', e);
    }
  });
  
  return server;
}

export default app;
