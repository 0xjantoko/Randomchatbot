<script>
  import { onMount } from 'svelte';
  let { data = [] } = $props();
  let canvas;
  let tooltip = $state({ show: false, text: '', x: 0, y: 0 });

  function draw() {
    if (!canvas || !data?.length) return;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width;
    const h = 240;
    const dpr = devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const maxMessages = Math.max(...data.map(d => d.messages_total), 1) * 1.1;
    const maxPhotos = Math.max(...data.map(d => d.photos_total), 1) * 1.1;
    const pad = { top: 30, bottom: 28, left: 55, right: 20 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    // Grid
    ctx.strokeStyle = 'rgba(30, 58, 95, 0.4)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotH / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(w - pad.right, y); ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const val = Math.round(maxMessages - (maxMessages / 4) * i);
      const y = pad.top + (plotH / 4) * i;
      ctx.fillText(val, pad.left - 10, y);
    }

    if (data.length < 2) {
      ctx.fillStyle = '#475569';
      ctx.font = '13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⏳ Belum cukup data untuk grafik', w/2, h/2);
      return;
    }

    const stepX = plotW / (data.length - 1);

    // Area fill for messages
    const pointsMsg = data.map((d, i) => ({
      x: pad.left + i * stepX,
      y: pad.top + plotH - (d.messages_total / maxMessages) * plotH,
    }));

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.2)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0.01)');
    ctx.beginPath();
    ctx.moveTo(pointsMsg[0].x, pad.top + plotH);
    pointsMsg.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pointsMsg[pointsMsg.length - 1].x, pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line — messages
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    pointsMsg.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // Glow line
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    pointsMsg.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // Points — messages
    pointsMsg.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Area fill for photos
    const pointsPhoto = data.map((d, i) => ({
      x: pad.left + i * stepX,
      y: pad.top + plotH - (d.photos_total / maxPhotos) * plotH,
    }));

    const gradientPhoto = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    gradientPhoto.addColorStop(0, 'rgba(34, 197, 94, 0.15)');
    gradientPhoto.addColorStop(1, 'rgba(34, 197, 94, 0.01)');
    ctx.beginPath();
    ctx.moveTo(pointsPhoto[0].x, pad.top + plotH);
    pointsPhoto.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pointsPhoto[pointsPhoto.length - 1].x, pad.top + plotH);
    ctx.closePath();
    ctx.fillStyle = gradientPhoto;
    ctx.fill();

    // Line — photos
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    pointsPhoto.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    ctx.strokeStyle = 'rgba(34, 197, 94, 0.3)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    pointsPhoto.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.stroke();

    // Points — photos
    pointsPhoto.forEach((p) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#22c55e';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Legend
    const legendY = 14;
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(w - 145, legendY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Messages', w - 134, legendY);

    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.arc(w - 55, legendY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Photos', w - 44, legendY);
  }

  $effect(() => { data; draw(); });

  onMount(() => {
    draw();
    const ro = new ResizeObserver(draw);
    if (canvas?.parentElement) ro.observe(canvas.parentElement);
    return () => ro.disconnect();
  });
</script>

<div class="card">
  <div class="text-muted mb-1">📈 Metrics History (60 menit terakhir)</div>
  <div class="chart-wrap"><canvas bind:this={canvas}></canvas></div>
</div>

<style>
  .chart-wrap {
    width: 100%;
    position: relative;
  }
</style>
