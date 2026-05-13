/**
 * Metrics Collector - Lightweight, in-memory
 * Low RAM usage (<10MB), no external deps
 */

import crypto from 'crypto';

const METRICS_RESET_INTERVAL = 60 * 1000; // 1 minute

class MetricsCollector {
  constructor() {
    // In-memory metrics (reset every minute)
    this.current = {
      users_online: 0,
      messages_total: 0,
      messages_per_sec: 0,
      photos_total: 0,
      voice_total: 0,
      violations_total: 0,
      warnings_issued: 0,
      bans_total: 0,
      sessions_started: 0,
      sessions_ended: 0,
      revenue_stars: 0
    };
    
    // History for graphs (keep last 60 minutes)
    this.history = [];
    
    // Previous minute for rate calculation
    this.previous = { ...this.current };
    
    // Start reset timer
    this.startResetTimer();
  }
  
  startResetTimer() {
    setInterval(() => {
      // Push current to history before reset
      this.history.push({
        timestamp: Date.now(),
        ...this.current
      });
      
      // Keep only last 60 minutes
      if (this.history.length > 60) {
        this.history.shift();
      }
      
      // Calculate messages per second
      this.current.messages_per_sec = Math.round(
        (this.current.messages_total - this.previous.messages_total) / 60
      );
      
      // Reset counters
      this.previous = { ...this.current };
      this.current = {
        users_online: this.current.users_online, // Keep online count
        messages_total: this.current.messages_total,
        messages_per_sec: 0,
        photos_total: this.current.photos_total,
        voice_total: this.current.voice_total,
        violations_total: this.current.violations_total,
        warnings_issued: this.current.warnings_issued,
        bans_total: this.current.bans_total,
        sessions_started: this.current.sessions_started,
        sessions_ended: this.current.sessions_ended,
        revenue_stars: this.current.revenue_stars
      };
    }, METRICS_RESET_INTERVAL);
  }
  
  // Increment methods
  incOnline() { this.current.users_online++; }
  decOnline() { this.current.users_online = Math.max(0, this.current.users_online - 1); }
  
  incMessage() { this.current.messages_total++; }
  incPhoto() { this.current.photos_total++; }
  incVoice() { this.current.voice_total++; }
  incViolation() { this.current.violations_total++; }
  incWarning() { this.current.warnings_issued++; }
  incBan() { this.current.bans_total++; }
  incSessionStart() { this.current.sessions_started++; }
  incSessionEnd() { this.current.sessions_ended++; }
  incRevenue(stars) { this.current.revenue_stars += stars; }
  
  // Get current metrics
  getCurrent() {
    return { ...this.current };
  }
  
  // Get history for graphs
  getHistory(minutes = 60) {
    return this.history.slice(-minutes);
  }
  
  // Get summary for admin
  getSummary() {
    const history = this.history;
    const totalMsgs = history.reduce((sum, m) => sum + m.messages_total, 0);
    const totalPhotos = history.reduce((sum, m) => sum + m.photos_total, 0);
    
    return {
      current: this.current,
      avg_messages_per_min: history.length > 0 
        ? Math.round(totalMsgs / history.length) 
        : 0,
      avg_photos_per_min: history.length > 0 
        ? Math.round(totalPhotos / history.length) 
        : 0,
      uptime_hours: process.uptime() / 3600
    };
  }
}

export const metrics = new MetricsCollector();
export default metrics;