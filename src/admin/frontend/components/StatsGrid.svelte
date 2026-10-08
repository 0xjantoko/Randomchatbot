<script>
  import { fmtNumber } from '../lib/format.js';
  let { current = {}, history = [] } = $props();

  const items = [
    { key: 'users_online', label: 'Online', icon: '👥', color: 'text-green', desc: 'Users aktif saat ini' },
    { key: 'messages_total', label: 'Messages', icon: '💬', color: 'text-blue', desc: 'Total pesan' },
    { key: 'sessions_started', label: 'Sessions', icon: '🔗', color: 'text-purple', desc: 'Sesi dimulai' },
    { key: 'photos_total', label: 'Photos', icon: '📸', color: 'text-green', desc: 'Foto dikirim' },
    { key: 'voice_total', label: 'Voice', icon: '🎤', color: 'text-cyan', desc: 'Pesan suara' },
    { key: 'violations_total', label: 'Violations', icon: '⚠️', color: 'text-orange', desc: 'Pelanggaran' },
    { key: 'bans_total', label: 'Bans', icon: '🚫', color: 'text-red', desc: 'Akun dibanned' },
    { key: 'messages_per_sec', label: 'Msg/s', icon: '⚡', color: 'text-yellow', desc: 'Pesan per detik' },
  ];

  function getTrend(key) {
    if (history.length < 2) return 0;
    const prev = history[history.length - 2][key] || 0;
    const curr = current[key] || 0;
    if (prev === 0) return curr > 0 ? 100 : 0;
    return Math.round(((curr - prev) / prev) * 100);
  }
</script>

<div class="grid-4 mb-2">
  {#each items as { key, label, icon, color, desc }}
    {@const trend = getTrend(key)}
    <div class="stat-card">
      <div class="stat-icon {color}">{icon}</div>
      <div class="stat-body">
        <div class="stat-value {color}">{fmtNumber(current[key] ?? 0)}</div>
        <div class="stat-label">{label}</div>
        <div class="stat-desc">{desc}</div>
      </div>
      {#if trend !== 0}
        <div class="stat-trend" class:trend-up={trend > 0} class:trend-down={trend < 0}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 1.1rem 1.25rem;
    display: flex;
    align-items: flex-start;
    gap: 0.85rem;
    position: relative;
    overflow: hidden;
    transition: all 0.2s ease;
  }
  .stat-card::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, transparent, var(--accent-blue), transparent);
    opacity: 0;
    transition: opacity 0.3s ease;
  }
  .stat-card:hover::before { opacity: 1; }
  .stat-card:hover {
    border-color: var(--border-light);
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.3);
  }

  .stat-icon {
    font-size: 1.5rem;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    flex-shrink: 0;
  }
  .stat-icon.text-green { background: rgba(34,197,94,0.1); }
  .stat-icon.text-blue { background: rgba(56,189,248,0.1); }
  .stat-icon.text-purple { background: rgba(167,139,250,0.1); }
  .stat-icon.text-yellow { background: rgba(234,179,8,0.1); }
  .stat-icon.text-red { background: rgba(239,68,68,0.1); }
  .stat-icon.text-orange { background: rgba(249,115,22,0.1); }
  .stat-icon.text-cyan { background: rgba(34,211,238,0.1); }

  .stat-body { flex: 1; min-width: 0; }
  .stat-value { font-size: 1.6rem; font-weight: 800; line-height: 1.2; letter-spacing: -0.02em; }
  .stat-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600; margin-top: 0.1rem; }
  .stat-desc { font-size: 0.65rem; color: var(--text-muted); margin-top: 0.1rem; opacity: 0.6; }

  .stat-trend {
    position: absolute;
    top: 0.75rem; right: 0.75rem;
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.15rem 0.4rem;
    border-radius: 4px;
  }
  .trend-up { color: var(--accent-green); background: rgba(34,197,94,0.1); }
  .trend-down { color: var(--accent-red); background: rgba(239,68,68,0.1); }

  .text-cyan { color: var(--accent-cyan); }
  .text-orange { color: var(--accent-orange); }
</style>
