<script>
  import { connectTrafficStream, fetchTraffic, fetchActiveUsers } from '../lib/api.js';
  import { fmtNumber } from '../lib/format.js';

  let traffic = $state(null);
  let activeUsers = $state([]);
  let loading = $state(true);
  let error = $state('');
  let source;

  $effect(() => {
    loadInitial();
    source = connectTrafficStream(
      (data) => { traffic = data; loading = false; error = ''; },
      (e) => { error = 'SSE disconnected — polling fallback'; loadInitial(); }
    );
    return () => { if (source) source.close(); };
  });

  async function loadInitial() {
    try {
      const [t, u] = await Promise.all([fetchTraffic(), fetchActiveUsers()]);
      traffic = t;
      activeUsers = u.users || [];
      loading = false;
      error = '';
    } catch (e) {
      error = e.message;
      loading = false;
    }
  }

  function fmtDuration(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
</script>

<div class="traffic-panel mb-2">
  <div class="panel-header">
    <div class="panel-title">
      <span>🚦 Live Traffic</span>
      <span class="live-badge">
        <span class="live-dot"></span>
        LIVE
      </span>
    </div>
    <span class="text-xs text-muted">Update tiap 2 detik</span>
  </div>

  {#if loading}
    <div class="loading-skeleton">
      <div class="skeleton-row">
        {#each [1,2,3,4] as _}
          <div class="skeleton-card"></div>
        {/each}
      </div>
    </div>
  {:else if error}
    <div class="error-state">
      <span>⚠️</span> {error}
    </div>
  {:else if traffic}
    <div class="traffic-grid">
      <div class="traffic-stat traffic-stat-users">
        <div class="traffic-value text-green">{traffic.users_online}</div>
        <div class="traffic-label">Users Online</div>
        <div class="traffic-bar"><div class="bar-fill bar-green" style="width: {Math.min(traffic.users_online / 20 * 100, 100)}%"></div></div>
      </div>
      <div class="traffic-stat traffic-stat-sessions">
        <div class="traffic-value text-purple">{traffic.active_sessions}</div>
        <div class="traffic-label">Active Sessions</div>
        <div class="traffic-bar"><div class="bar-fill bar-purple" style="width: {Math.min(traffic.active_sessions / 10 * 100, 100)}%"></div></div>
      </div>
      <div class="traffic-stat traffic-stat-pool">
        <div class="traffic-value text-blue">{traffic.pool_waiting}</div>
        <div class="traffic-label">Waiting in Pool</div>
        <div class="traffic-bar"><div class="bar-fill bar-blue" style="width: {Math.min(traffic.pool_waiting / 10 * 100, 100)}%"></div></div>
      </div>
      <div class="traffic-stat traffic-stat-msgs">
        <div class="traffic-value text-amber">{fmtNumber(traffic.messages_per_sec)}</div>
        <div class="traffic-label">Messages / sec</div>
        <div class="traffic-bar"><div class="bar-fill bar-amber" style="width: {Math.min(traffic.messages_per_sec / 50 * 100, 100)}%"></div></div>
      </div>
    </div>

    {#if activeUsers.length > 0}
      <div class="session-section">
        <div class="session-header">
          <span class="text-sm text-muted">Active Sessions  <span class="session-count">{activeUsers.length}</span></span>
        </div>
        <div class="session-list">
          {#each activeUsers as session}
            <div class="session-row" style="animation-delay: '{activeUsers.indexOf(session) * 0.05}s'">
              <div class="session-users">
                <span class="session-user">{session.user_a_anon.slice(0, 14)}…</span>
                <span class="session-arrow">⟷</span>
                <span class="session-user">{session.user_b_anon.slice(0, 14)}…</span>
              </div>
              <div class="session-meta">
                <span class="session-duration">{fmtDuration(session.duration_sec)}</span>
                <span class="session-time">{fmtTime(session.started_at)}</span>
              </div>
            </div>
          {/each}
        </div>
      </div>
    {:else}
      <div class="empty-state">
        <span class="empty-icon">💤</span>
        <span class="empty-text">Belum ada sesi aktif</span>
      </div>
    {/if}
  {/if}
</div>

<style>
  .traffic-panel {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 1.25rem 1.5rem;
    animation: fadeIn 0.3s ease;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  .panel-title {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .live-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.6rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--accent-green);
    background: rgba(34,197,94,0.1);
    padding: 0.15rem 0.5rem;
    border-radius: 20px;
  }

  .traffic-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
  }

  .traffic-stat {
    background: var(--bg-secondary);
    border-radius: var(--radius-md);
    padding: 1rem;
    text-align: center;
    position: relative;
    overflow: hidden;
    transition: all 0.2s ease;
  }
  .traffic-stat:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  }

  .traffic-value {
    font-size: 2rem;
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -0.03em;
  }
  .traffic-label {
    font-size: 0.65rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    margin-top: 0.2rem;
  }

  .traffic-bar {
    height: 3px;
    background: rgba(255,255,255,0.05);
    border-radius: 2px;
    margin-top: 0.6rem;
    overflow: hidden;
  }
  .bar-fill {
    height: 100%;
    border-radius: 2px;
    transition: width 1s ease;
  }
  .bar-green { background: var(--accent-green); }
  .bar-purple { background: var(--accent-purple); }
  .bar-blue { background: var(--accent-blue); }
  .bar-amber { background: var(--accent-yellow); }

  .text-amber { color: var(--accent-yellow); }

  /* Sessions */
  .session-section { margin-top: 0.75rem; }
  .session-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--border);
  }
  .session-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--accent-purple);
    color: #fff;
    font-size: 0.6rem;
    font-weight: 800;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    vertical-align: middle;
    margin-left: 0.2rem;
  }

  .session-list {
    max-height: 220px;
    overflow-y: auto;
  }
  .session-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.45rem 0.5rem;
    border-radius: var(--radius-sm);
    border-bottom: 1px solid rgba(30,58,95,0.3);
    animation: slideUp 0.3s ease both;
    transition: background 0.15s ease;
  }
  .session-row:hover { background: rgba(56,189,248,0.05); }
  .session-row:last-child { border-bottom: none; }

  .session-users {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .session-user {
    font-family: monospace;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }
  .session-arrow { color: var(--text-muted); font-size: 0.8rem; }
  .session-meta {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }
  .session-duration {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent-blue);
  }
  .session-time {
    font-size: 0.65rem;
    color: var(--text-muted);
    font-family: monospace;
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.5rem;
    gap: 0.3rem;
  }
  .empty-icon { font-size: 1.5rem; }
  .empty-text { font-size: 0.8rem; color: var(--text-muted); }

  /* Error state */
  .error-state {
    text-align: center;
    padding: 1.5rem;
    color: var(--accent-red);
    font-size: 0.85rem;
  }

  /* Loading skeleton */
  .loading-skeleton { animation: fadeIn 0.3s ease; }
  .skeleton-row {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.75rem;
  }
  .skeleton-card {
    height: 80px;
    background: linear-gradient(90deg, var(--bg-secondary) 25%, var(--bg-card) 50%, var(--bg-secondary) 75%);
    background-size: 200% 100%;
    border-radius: var(--radius-md);
    animation: shimmer 1.5s ease infinite;
  }

  @media (max-width: 640px) {
    .traffic-grid { grid-template-columns: repeat(2, 1fr); }
    .skeleton-row { grid-template-columns: repeat(2, 1fr); }
  }
</style>
