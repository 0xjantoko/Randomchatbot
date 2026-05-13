/**
 * Admin Module - Lightweight monitoring & logging
 * Low RAM, encrypted logs, real-time dashboard
 */

export { metrics } from './metrics.js';
export { logger } from './logger.js';
export { startAdminServer } from './server.js';
export { default as app } from './server.js';