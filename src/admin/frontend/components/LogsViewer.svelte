<script>
  import { fetchLogs } from '../lib/api.js';

  let logs = $state([]);
  let loading = $state(false);
  let interval;

  async function load() {
    loading = true;
    try {
      const res = await fetchLogs(50);
      logs = res.logs || [];
    } catch (e) {
      logs = [{ level: 'error', type: 'fetch', data: { message: e.message }, timestamp: new Date().toISOString() }];
    }
    loading = false;
  }

  $effect(() => {
    load();
    interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  });

  function levelClass(lv) {
    if (lv === 'error') return 'lv-error';
    if (lv === 'warn') return 'lv-warn';
    if (lv === 'metric') return 'lv-metric';
    return 'lv-info';
  }

  function levelBadge(lv) {
    if (lv === 'error') return { text: 'ERROR', cls: 'badge-error' };
    if (lv === 'warn') return { text: 'WARN', cls: 'badge-warn' };
    if (lv === 'metric') return { text: 'METRIC', cls: 'badge-metric' };
    return { text: 'INFO', cls: 'badge-info' };
  }

  function fmtLogTime(ts) {
    return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function fmtLogMsg(data) {
    if (typeof data === 'string') return data;
    if (data?.message) return data.message;
    const str = JSON.stringify(data);
    return str.length > 80 ? str.slice(0, 80) + '…' : str;
  }
</script>

<div class="card mb-2">
  <div class="logs-header">
    <div class="logs-title">
      <span>📋 Live Logs</span>
      <span class="log-count">{logs.length}</span>
    </div>
    <button class="btn-sm" onclick={load} disabled={loading}>
      {loading ? '↻ Memuat…' : '↻ Refresh'}
    </button>
  </div>

  <div class="logs-body">
    {#if logs.length === 0}
      <div class="logs-empty">
        <span>🔇</span> Belum ada log
      </div>
    {:else}
      {#each logs as log, i}
        <div class="log-row {levelClass(log.level)}" style="animation-delay: '{i * 0.02}s'">
          <span class="log-time">{fmtLogTime(log.timestamp)}</span>
          <span class="log-badge {levelBadge(log.level).cls}">{levelBadge(log.level).text}</span>
          <span class="log-type">{log.type}</span>
          <span class="log-msg">{fmtLogMsg(log.data)}</span>
        </div>
      {/each}
    {/if}
  </div>
</div>

<style>
  .logs-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }
  .logs-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 700;
    font-size: 0.85rem;
  }
  .log-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--border);
    color: var(--text-muted);
    font-size: 0.6rem;
    font-weight: 700;
    min-width: 18px;
    height: 18px;
    padding: 0 0.35rem;
    border-radius: 20px;
  }

  .logs-body {
    max-height: 320px;
    overflow-y: auto;
  }

  .logs-empty {
    text-align: center;
    padding: 1.5rem;
    color: var(--text-muted);
    font-size: 0.85rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .log-row {
    display: flex;
    gap: 0.5rem;
    padding: 0.4rem 0.5rem;
    border-radius: var(--radius-sm);
    border-bottom: 1px solid rgba(30,58,95,0.2);
    align-items: center;
    font-size: 0.78rem;
    animation: slideUp 0.2s ease both;
    transition: background 0.12s ease;
  }
  .log-row:hover { background: rgba(56,189,248,0.04); }
  .log-row:last-child { border-bottom: none; }

  .log-time {
    color: var(--text-muted);
    font-family: monospace;
    font-size: 0.7rem;
    flex-shrink: 0;
    min-width: 65px;
  }
  .log-badge {
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    padding: 0.08rem 0.4rem;
    border-radius: 3px;
    flex-shrink: 0;
    min-width: 42px;
    text-align: center;
  }
  .badge-info { background: rgba(56,189,248,0.15); color: var(--accent-blue); }
  .badge-warn { background: rgba(234,179,8,0.15); color: var(--accent-yellow); }
  .badge-error { background: rgba(239,68,68,0.15); color: var(--accent-red); }
  .badge-metric { background: rgba(34,197,94,0.15); color: var(--accent-green); }

  .log-type {
    color: var(--text-muted);
    font-size: 0.7rem;
    flex-shrink: 0;
    min-width: 60px;
  }
  .log-msg {
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
