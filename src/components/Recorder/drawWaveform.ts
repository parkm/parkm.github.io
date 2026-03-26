export function drawWaveform(
  canvas: HTMLCanvasElement,
  samples: Float32Array | null,
  playedFraction: number,
  startMarkerFraction?: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "oklch(0.21 0.006 285.885)";
  ctx.fillRect(0, 0, w, h);

  if (!samples || samples.length < 2) return;

  const barW = 2.5;
  const gap = 1.5;
  const step = barW + gap;
  const numBars = Math.floor(w / step);
  const mid = h / 2;
  const maxH = h * 0.38;

  const peaks = new Float32Array(numBars);
  let globalMax = 0;
  for (let i = 0; i < numBars; i++) {
    const s = Math.floor((i * samples.length) / numBars);
    const e = Math.floor(((i + 1) * samples.length) / numBars);
    let pk = 0;
    for (let j = s; j < e; j++) pk = Math.max(pk, Math.abs(samples[j]));
    peaks[i] = pk;
    if (pk > globalMax) globalMax = pk;
  }
  if (globalMax < 0.001) globalMax = 0.001;

  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, "oklch(0.75 0.18 160)");
  grad.addColorStop(0.5, "oklch(0.72 0.15 180)");
  grad.addColorStop(1, "oklch(0.7 0.12 200)");

  for (let i = 0; i < numBars; i++) {
    const x = i * step + gap * 0.5;
    const bh = Math.max(2, (peaks[i] / globalMax) * maxH);
    const frac = i / numBars;

    ctx.fillStyle = grad;
    ctx.globalAlpha = playedFraction >= 0 && frac <= playedFraction ? 1 : 0.35;
    ctx.fillRect(x, mid - bh, barW, bh);
    ctx.fillRect(x, mid, barW, bh);
  }
  ctx.globalAlpha = 1;

  if (playedFraction >= 0 && playedFraction <= 1) {
    const px = playedFraction * w;
    ctx.save();
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = 6;
    ctx.fillStyle = "#fff";
    ctx.fillRect(px - 1, 0, 2, h);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(px, 4, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
  }

  // Start marker (pulsing line)
  if (
    startMarkerFraction != null &&
    startMarkerFraction >= 0 &&
    startMarkerFraction <= 1
  ) {
    const mx = startMarkerFraction * w;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);

    ctx.save();
    ctx.globalAlpha = 0.35 + 0.45 * pulse;
    ctx.shadowColor = "oklch(0.75 0.18 160)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "oklch(0.75 0.18 160)";
    ctx.fillRect(mx - 1, 0, 2, h);
    ctx.restore();

    // Triangle marker at top
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * pulse;
    ctx.fillStyle = "oklch(0.75 0.18 160)";
    ctx.beginPath();
    ctx.moveTo(mx - 5, 0);
    ctx.lineTo(mx + 5, 0);
    ctx.lineTo(mx, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
