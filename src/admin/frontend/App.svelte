<script>
  import Header from './components/Header.svelte';
  import StatsGrid from './components/StatsGrid.svelte';
  import RealtimeChart from './components/RealtimeChart.svelte';
  import LogsViewer from './components/LogsViewer.svelte';
  import SystemInfo from './components/SystemInfo.svelte';
  import ApiKeyPrompt from './components/ApiKeyPrompt.svelte';
  import TrafficPanel from './components/TrafficPanel.svelte';
  import QuarantinePanel from './components/QuarantinePanel.svelte';
  import { fetchMetrics, fetchSystem, setKey } from './lib/api.js';

  let metrics = $state(null);
  let system = $state(null);
  let error = $state('');
  let keySet = $state(!!localStorage.getItem('admin_api_key'));
  let interval;

  function onKeySet(key) {
    setKey(key);
    keySet = true;
    startPolling();
  }

  async function load() {
    try {
      const [m, s] = await Promise.all([fetchMetrics(), fetchSystem()]);
      metrics = m;
      system = s;
      error = '';
    } catch (e) {
      error = e.message;
    }
  }

  function startPolling() {
    load();
    interval = setInterval(load, 5000);
  }

  $effect(() => {
    return () => { if (interval) clearInterval(interval); };
  });
</script>

{#if !keySet}
  <ApiKeyPrompt {onKeySet} />
{:else}
  <Header {error} />
  <div class="container">
    {#if metrics}
      <TrafficPanel />
      <StatsGrid current={metrics.current} history={metrics.history} />
      <div class="grid-2 mb-2">
        <RealtimeChart data={metrics.history} />
        <SystemInfo info={system} summary={metrics} />
      </div>
    {:else if error}
      <div class="card text-center mb-2" style="padding: 3rem;">
        <div class="text-red text-lg mb-1">⚠️ {error}</div>
        <button class="btn" onclick={load}>Coba Lagi</button>
      </div>
    {:else}
      <div class="card text-center" style="padding: 3rem;">
        <div class="text-muted">Memuat data...</div>
      </div>
    {/if}
    <QuarantinePanel />
    <LogsViewer />
  </div>
{/if}

<style>
  .container { max-width: 1400px; margin: 0 auto; padding: 1.5rem; }
  .btn {
    background: #38bdf8; color: #0f172a; border: none; padding: 0.5rem 1.5rem;
    border-radius: 8px; cursor: pointer; font-weight: 600; margin-top: 1rem;
  }
  .btn:hover { background: #7dd3fc; }
</style>
