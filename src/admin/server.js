/**
 * Admin API Server - Lightweight, serves dashboard + metrics
 * Runs alongside main bot, ~20MB RAM extra
 */

import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

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
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'change-this-secret-key';

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

// Serve static dashboard
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
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

// Health check (no auth)
app.get('/admin/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Start server
export function startAdminServer() {
  // Don't start if already running (for hot reload)
  try {
    app.listen(ADMIN_PORT, () => {
      console.log(`✅ Admin Panel: http://localhost:${ADMIN_PORT}/admin`);
      console.log(`   API Key: ${ADMIN_API_KEY}`);
      logger.info('admin', { message: 'Admin server started', port: ADMIN_PORT });
    });
  } catch (e) {
    if (e.code === 'EADDRINUSE') {
      console.log(`⚠️ Admin server already running on port ${ADMIN_PORT}`);
    } else {
      console.error('Admin server error:', e);
    }
  }
}

export default app;