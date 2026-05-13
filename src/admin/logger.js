/**
 * Encrypted Logger - Secure logging with AES-256-GCM
 * Low storage, rotatable logs
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Encryption config
const ENCRYPTION_KEY = process.env.LOG_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const KEY_BUFFER = Buffer.from(ENCRYPTION_KEY, 'hex');
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '../../logs');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB per file
const MAX_LOG_FILES = 10;

class EncryptedLogger {
  constructor(serviceName = 'randomchat') {
    this.serviceName = serviceName;
    this.logFile = path.join(LOG_DIR, `${serviceName}-encrypted.log.enc`);
    this.ensureLogDir();
  }
  
  ensureLogDir() {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
  }
  
  /**
   * Encrypt data using AES-256-GCM
   */
  encrypt(plaintext) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY_BUFFER, iv);
    
    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final()
    ]);
    
    const authTag = cipher.getAuthTag();
    
    // Format: iv + authTag + encrypted
    return Buffer.concat([iv, authTag, encrypted]).toString('base64');
  }
  
  /**
   * Decrypt data (for admin read)
   */
  decrypt(encryptedBase64) {
    try {
      const buffer = Buffer.from(encryptedBase64, 'base64');
      
      const iv = buffer.subarray(0, 12);
      const authTag = buffer.subarray(12, 28);
      const encrypted = buffer.subarray(28);
      
      const decipher = crypto.createDecipheriv('aes-256-gcm', KEY_BUFFER, iv);
      decipher.setAuthTag(authTag);
      
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);
      
      return decrypted.toString('utf8');
    } catch (e) {
      return null;
    }
  }
  
  /**
   * Write encrypted log entry
   */
  log(level, type, data) {
    const entry = {
      timestamp: new Date().toISOString(),
      level, // info, warn, error, metric
      type,  // user_action, violation, admin, etc.
      data
    };
    
    const plaintext = JSON.stringify(entry);
    const encrypted = this.encrypt(plaintext);
    
    // Append to file
    fs.appendFileSync(this.logFile, encrypted + '\n');
    
    // Check size and rotate if needed
    this.rotateIfNeeded();
  }
  
  rotateIfNeeded() {
    try {
      const stats = fs.statSync(this.logFile);
      if (stats.size > MAX_LOG_SIZE) {
        const timestamp = Date.now();
        const rotatedFile = `${this.logFile}.${timestamp}`;
        fs.renameSync(this.logFile, rotatedFile);
        
        // Clean old files
        this.cleanOldLogs();
      }
    } catch (e) {
      // File doesn't exist yet, ignore
    }
  }
  
  cleanOldLogs() {
    try {
      const files = fs.readdirSync(LOG_DIR)
        .filter(f => f.startsWith(this.serviceName) && f.endsWith('.enc'))
        .sort()
        .reverse();
      
      // Keep only MAX_LOG_FILES
      files.slice(MAX_LOG_FILES).forEach(file => {
        fs.unlinkSync(path.join(LOG_DIR, file));
      });
    } catch (e) {}
  }
  
  // Convenience methods
  info(type, data) { this.log('info', type, data); }
  warn(type, data) { this.log('warn', type, data); }
  error(type, data) { this.log('error', type, data); }
  metric(type, data) { this.log('metric', type, data); }
  
  /**
   * Read and decrypt logs (admin only)
   */
  readLogs(lines = 100) {
    if (!fs.existsSync(this.logFile)) return [];
    
    const content = fs.readFileSync(this.logFile, 'utf8');
    const encryptedEntries = content.trim().split('\n').filter(Boolean).slice(-lines);
    
    return encryptedEntries
      .map(encrypted => this.decrypt(encrypted))
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  }
  
  /**
   * Get encryption key (for admin export - show warning!)
   */
  getKeyInfo() {
    return {
      keySet: !!process.env.LOG_ENCRYPTION_KEY,
      keyLength: KEY_BUFFER.length * 8,
      algorithm: 'AES-256-GCM'
    };
  }
}

// Export logger instance
export const logger = new EncryptedLogger('randomchat');
export default logger;