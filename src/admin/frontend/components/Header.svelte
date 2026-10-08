<script>
  let { error = '' } = $props();
</script>

<header class="header">
  <div class="header-left">
    <div class="logo-icon">🤖</div>
    <div>
      <h1 class="logo-title">RandomChat Admin</h1>
      <span class="logo-sub">Dashboard Monitoring</span>
    </div>
    <span class="version-badge">v1.1.0</span>
  </div>
  <div class="header-right">
    <div class="status-indicator" class:status-error={error}>
      <span class="status-dot" class:status-dot-error={error}></span>
      <span class="status-text">{error ? 'Error' : 'Online'}</span>
    </div>
  </div>
</header>

<style>
  .header {
    background: linear-gradient(180deg, rgba(26,35,50,0.95) 0%, rgba(11,17,32,0.95) 100%);
    backdrop-filter: blur(12px);
    padding: 0.85rem 2rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    position: sticky;
    top: 0;
    z-index: 50;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo-icon {
    font-size: 1.6rem;
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .logo-title {
    font-size: 1.1rem;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.2;
  }
  .logo-sub {
    font-size: 0.65rem;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .version-badge {
    background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan));
    color: #0b1120;
    font-size: 0.6rem;
    font-weight: 800;
    padding: 0.15rem 0.5rem;
    border-radius: 20px;
    margin-left: 0.25rem;
  }

  .header-right { display: flex; align-items: center; gap: 1rem; }

  .status-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: var(--accent-green);
    font-weight: 600;
  }
  .status-error { color: var(--accent-red); }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent-green);
    animation: pulse 1.5s ease infinite;
    box-shadow: 0 0 8px rgba(34,197,94,0.5);
  }
  .status-dot-error {
    background: var(--accent-red);
    box-shadow: 0 0 8px rgba(239,68,68,0.5);
    animation: none;
  }
</style>
