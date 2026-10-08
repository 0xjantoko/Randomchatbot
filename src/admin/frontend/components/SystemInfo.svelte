<script>
  import { fmtBytes, fmtDuration } from '../lib/format.js';
  let { info = null, summary = null } = $props();
</script>

<div class="card">
  <div class="text-muted mb-1">🖥️ System</div>
  {#if info}
    <div class="sys-grid">
      <div class="sys-item">
        <div class="sys-icon">⏱️</div>
        <div class="sys-body">
          <div class="sys-val">{fmtDuration(info.uptime)}</div>
          <div class="sys-label">Uptime</div>
        </div>
      </div>
      <div class="sys-item">
        <div class="sys-icon">🟢</div>
        <div class="sys-body">
          <div class="sys-val">{info.nodeVersion}</div>
          <div class="sys-label">Node.js</div>
        </div>
      </div>
      <div class="sys-item">
        <div class="sys-icon">💿</div>
        <div class="sys-body">
          <div class="sys-val">{info.platform}</div>
          <div class="sys-label">Platform</div>
        </div>
      </div>
      <div class="sys-item">
        <div class="sys-icon">🧠</div>
        <div class="sys-body">
          <div class="sys-val">{fmtBytes(info.memory?.heapUsed || 0)}</div>
          <div class="sys-label">Heap Used</div>
        </div>
      </div>
      <div class="sys-item">
        <div class="sys-icon">📊</div>
        <div class="sys-body">
          <div class="sys-val">{fmtBytes(info.memory?.rss || 0)}</div>
          <div class="sys-label">RSS</div>
        </div>
      </div>
      {#if summary?.avg_messages_per_min != null}
        <div class="sys-item">
          <div class="sys-icon">📨</div>
          <div class="sys-body">
            <div class="sys-val">{summary.avg_messages_per_min}</div>
            <div class="sys-label">Avg msg/min</div>
          </div>
        </div>
      {/if}
    </div>
  {:else}
    <div class="text-muted" style="padding: 1rem; text-align: center;">Loading...</div>
  {/if}
</div>

<style>
  .sys-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .sys-item {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    background: var(--bg-secondary);
    border-radius: var(--radius-sm);
    padding: 0.6rem 0.75rem;
    transition: background 0.15s ease;
  }
  .sys-item:hover { background: var(--bg-card-hover); }
  .sys-icon { font-size: 1rem; flex-shrink: 0; }
  .sys-body { min-width: 0; }
  .sys-val { font-weight: 700; font-size: 0.85rem; }
  .sys-label { font-size: 0.6rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
</style>
