function hann(N: number): Float32Array {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++)
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
  return w;
}

export function wsola(inp: Float32Array, rate: number): Float32Array {
  if (rate >= 0.99) return new Float32Array(inp);
  const N = 2048;
  const Hs = 512;
  const Ha = Math.max(1, Math.round(Hs * rate));
  const corrLen = Math.min(N - Hs, 512);
  const corrStep = 4;
  const searchR = 64;
  const win = hann(N);
  const len = inp.length;
  const numF = Math.floor((len - N) / Ha) + 1;
  if (numF <= 1) return new Float32Array(inp);

  const outLen = (numF - 1) * Hs + N;
  const out = new Float32Array(outLen);
  const wSum = new Float32Array(outLen);

  for (let i = 0; i < N; i++) {
    out[i] += inp[i] * win[i];
    wSum[i] += win[i] * win[i];
  }

  let prevP = 0;
  for (let f = 1; f < numF; f++) {
    const expP = prevP + Ha;
    const oP = f * Hs;
    const refS = prevP + Hs;

    let bestP = expP;
    let bestC = -2;
    const lo = Math.max(0, expP - searchR);
    const hi = Math.min(len - N, expP + searchR);

    for (let p = lo; p <= hi; p++) {
      let c = 0;
      let e1 = 0;
      let e2 = 0;
      for (let i = 0; i < corrLen; i += corrStep) {
        const a = inp[refS + i];
        const b = inp[p + i];
        c += a * b;
        e1 += a * a;
        e2 += b * b;
      }
      const d = Math.sqrt(e1 * e2);
      const ncc = d > 1e-12 ? c / d : 0;
      if (ncc > bestC) {
        bestC = ncc;
        bestP = p;
      }
    }

    for (let i = 0; i < N; i++) {
      const si = bestP + i;
      const oi = oP + i;
      if (si < len && oi < outLen) {
        out[oi] += inp[si] * win[i];
        wSum[oi] += win[i] * win[i];
      }
    }
    prevP = bestP;
  }

  for (let i = 0; i < outLen; i++) {
    if (wSum[i] > 1e-8) out[i] /= wSum[i];
  }
  return out;
}
