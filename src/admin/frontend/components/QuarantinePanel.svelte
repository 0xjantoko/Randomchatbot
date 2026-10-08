<script>
  import { fetchQuarantine, releaseQuarantine, fetchEvidence, fetchEvidenceDetail } from '../lib/api.js';

  let users = $state([]);
  let loading = $state(false);
  let error = $state('');
  let detail = $state({}); // userId -> { items, messages: {id: [...] } }
  let interval;

  async function load() {
    loading = true;
    try {
      const res = await fetchQuarantine(100);
      users = res.users || [];
      error = '';
    } catch (e) {
      error = e.message;
    }
    loading = false;
  }

  async function release(user) {
    if (!confirm(`Lepas quarantine untuk ${user.anon_id}?`)) return;
    try {
      await releaseQuarantine(user.user_id, false);
      await load();
    } catch (e) {
      error = e.message;
    }
  }

  async function toggleEvidence(user) {
    const key = user.user_id;
    if (detail[key]) {
      detail = { ...detail, [key]: null };
      return;
    }
    try {
      const res = await fetchEvidence(key, 5);
      const items = res.items || [];
      const full = await Promise.all(items.map(i => fetchEvidenceDetail(i.id)));
      detail = { ...detail, [key]: full.map(f => f.evidence) };
    } catch (e) {
      error = e.message;
    }
  }

  function fmtTime(sec) {
    if (!sec) return '-';
    return new Date(sec * 1000).toLocaleString('id-ID', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  function fmtClock(sec) {
    return new Date(sec * 1000).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }

  $effect(() => {
    load();
    interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  });
</script>

<div class="card mb-2">
  <div class="q-header">
    <div class="q-title">
      <span>🚨 Antrean Review (Bracket Breach)</span>
      <span class="q-count">{users.length}</span>
    </div>
    <button class="btn-sm" onclick={load} disabled={loading}>
      {loading ? '↻ Memuat…' : '↻ Refresh'}
    </button>
  </div>

  {#if error}
    <div class="q-error">⚠️ {error}</div>
  {/if}

  {#if users.length === 0}
    <div class="q-empty">✅ Tidak ada user di quarantine</div>
  {:else}
    {#each users as u (u.user_id)}
      <div class="q-row">
        <div class="q-main">
          <span class="q-anon">{u.anon_id}</span>
          <span class="q-badge">{u.bracket_locked || u.trust_level || 'flagged'}</span>
          <span class="q-reason">{u.reason || 'unspecified'}</span>
          <span class="q-time">{fmtTime(u.quarantined_at)}</span>
        </div>
        <div class="q-actions">
          <button class="btn-xs" onclick={() => toggleEvidence(u)}>
            {detail[u.user_id] ? '▲ Tutup bukti' : '🔍 Bukti'}
          </button>
          <button class="btn-xs btn-danger" onclick={() => release(u)}>✔ Lepas</button>
        </div>
      </div>

      {#if detail[u.user_id]}
        <div class="q-evidence">
          {#if detail[u.user_id].length === 0}
            <div class="q-empty-sm">Tidak ada bukti tersimpan untuk user ini</div>
          {:else}
            {#each detail[u.user_id] as ev}
              <div class="ev-block">
                <div class="ev-head">
                  #{ev.id} · {ev.reason} · {ev.message_count} pesan · {fmtTime(ev.created_at)}
                </div>
                {#each ev.messages as m}
                  <div class="ev-msg">
                    <span class="ev-anon">{m.anon}</span>
                    <span class="ev-time">{fmtClock(m.at)}</span>
                    <span class="ev-text">{m.text}</span>
                  </div>
                {/each}
              </div>
            {/each}
          {/if}
        </div>
      {/if}
    {/each}
  {/if}
</div>

<style>
  .q-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
  .q-title { display: flex; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 0.85rem; }
  .q-count {
    display: inline-flex; align-items: center; justify-content: center;
    background: rgba(239,68,68,0.15); color: var(--accent-red);
    font-size: 0.6rem; font-weight: 700; min-width: 18px; height: 18px;
    padding: 0 0.35rem; border-radius: 20px;
  }
  .q-error { color: var(--accent-red); font-size: 0.78rem; margin-bottom: 0.5rem; }
  .q-empty, .q-empty-sm { text-align: center; padding: 1rem; color: var(--text-muted); font-size: 0.82rem; }

  .q-row {
    display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;
    padding: 0.5rem; border-bottom: 1px solid rgba(30,58,95,0.2); font-size: 0.78rem;
  }
  .q-row:last-child { border-bottom: none; }
  .q-main { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
  .q-anon { font-family: monospace; color: var(--accent-blue); }
  .q-badge {
    font-size: 0.6rem; font-weight: 700; letter-spacing: 0.05em;
    background: rgba(234,179,8,0.15); color: var(--accent-yellow);
    padding: 0.08rem 0.4rem; border-radius: 3px;
  }
  .q-reason { color: var(--text-secondary); }
  .q-time { color: var(--text-muted); font-size: 0.7rem; }
  .q-actions { display: flex; gap: 0.35rem; flex-shrink: 0; }

  .btn-sm, .btn-xs {
    background: var(--border); color: var(--text-secondary); border: none;
    border-radius: 6px; cursor: pointer; font-weight: 600;
  }
  .btn-sm { padding: 0.3rem 0.7rem; font-size: 0.72rem; }
  .btn-xs { padding: 0.22rem 0.5rem; font-size: 0.68rem; }
  .btn-xs:hover, .btn-sm:hover { background: rgba(56,189,248,0.2); color: var(--accent-blue); }
  .btn-danger:hover { background: rgba(239,68,68,0.2); color: var(--accent-red); }

  .q-evidence {
    background: rgba(15,23,42,0.5); border-radius: var(--radius-sm);
    padding: 0.5rem 0.6rem; margin: 0 0 0.5rem;
  }
  .ev-block + .ev-block { margin-top: 0.6rem; }
  .ev-head { color: var(--text-muted); font-size: 0.68rem; margin-bottom: 0.3rem; }
  .ev-msg { display: flex; gap: 0.5rem; font-size: 0.74rem; padding: 0.15rem 0; align-items: baseline; }
  .ev-anon { font-family: monospace; color: var(--accent-blue); font-size: 0.68rem; flex-shrink: 0; }
  .ev-time { color: var(--text-muted); font-size: 0.66rem; flex-shrink: 0; }
  .ev-text { color: var(--text-secondary); word-break: break-word; }
</style>
