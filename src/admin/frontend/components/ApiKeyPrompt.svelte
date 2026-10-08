<script>
  let { onKeySet } = $props();
  let key = $state('');
</script>

<div class="overlay">
  <div class="modal">
    <div class="modal-icon">🔐</div>
    <h2 class="modal-title">Admin Access</h2>
    <p class="modal-desc">
      Masukkan API Key dari console/server untuk mengakses dashboard.
    </p>
    <div class="modal-hint">
      <span class="hint-label">Default:</span>
      <code>change-this-secret-key</code>
    </div>
    <input
      type="password"
      bind:value={key}
      placeholder="Masukkan API Key..."
      onkeydown={e => e.key === 'Enter' && onKeySet(key)}
    />
    <button class="btn" onclick={() => onKeySet(key)} disabled={!key.trim()}>
      Masuk ke Dashboard
    </button>
  </div>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(11,17,32,0.92);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 2.5rem 2rem;
    width: 400px;
    text-align: center;
    animation: fadeIn 0.3s ease;
    box-shadow: 0 24px 80px rgba(0,0,0,0.5);
  }

  .modal-icon {
    font-size: 2.5rem;
    margin-bottom: 0.75rem;
  }

  .modal-title {
    font-size: 1.3rem;
    font-weight: 700;
    margin-bottom: 0.5rem;
  }

  .modal-desc {
    color: var(--text-secondary);
    font-size: 0.85rem;
    line-height: 1.5;
    margin-bottom: 0.75rem;
  }

  .modal-hint {
    background: var(--bg-secondary);
    border-radius: var(--radius-sm);
    padding: 0.5rem 0.75rem;
    margin-bottom: 1.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    font-size: 0.8rem;
  }
  .hint-label { color: var(--text-muted); }
  code {
    background: var(--border);
    color: var(--accent-blue);
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
    font-weight: 600;
    font-family: monospace;
  }

  input {
    width: 100%;
    padding: 0.75rem 1rem;
    border-radius: var(--radius-md);
    border: 1px solid var(--border);
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 0.95rem;
    outline: none;
    transition: border-color 0.2s ease;
    font-family: inherit;
    margin-bottom: 1rem;
  }
  input::placeholder { color: var(--text-muted); }
  input:focus { border-color: var(--accent-blue); box-shadow: 0 0 0 3px rgba(56,189,248,0.1); }

  .btn {
    width: 100%;
    background: linear-gradient(135deg, var(--accent-blue), var(--accent-cyan));
    color: #0b1120;
    border: none;
    padding: 0.7rem 1.5rem;
    border-radius: var(--radius-md);
    cursor: pointer;
    font-weight: 700;
    font-size: 0.9rem;
    transition: all 0.2s ease;
  }
  .btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: var(--glow-blue); }
  .btn:active:not(:disabled) { transform: translateY(0); }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
