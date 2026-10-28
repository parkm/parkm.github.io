const VERTEX = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Leaf shadows: two layers of swaying leaves (the farther one softer) plus
// branches, output as a light/shade color for the page to blend with.
const FRAGMENT = /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform float uCssPerPixel;
uniform float uTime;
uniform float uEvening;
uniform float uSunAngle;
uniform float uDark;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

mat2 rot(float a) { return mat2(cos(a), sin(a), -sin(a), cos(a)); }

// Pointed at both ends and widest toward the stem; 1.0 on the outline.
float leafShape(vec2 d, float size) {
  float x = d.x / size;
  float y = d.y / (size * 0.42 * (1.0 - 0.3 * x));
  return x * x + abs(y);
}

float leaves(vec2 p, float cell, float softness, float seed, float t) {
  vec2 q = p / cell;
  // Wobble the outlines so no two leaves are the same clean shape.
  q += (vec2(noise(q * 2.3 + seed), noise(q * 2.3 + seed + 5.2)) - 0.5) * 0.18;
  vec2 id = floor(q);
  float cover = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 c = id + vec2(x, y);
      float h = hash(c + seed);
      if (h < 0.3 + 0.6 * smoothstep(0.3, 0.7, noise(c * 0.2 + seed))) continue;
      vec2 offset = 0.25 + 0.5 * vec2(hash(c + seed + 1.3), hash(c + seed + 7.1));
      // Gusts roll across the canopy so neighbours move together, and the
      // leaves flutter more while a gust passes.
      float wave = sin(t * 0.45 - c.x * 0.45 - c.y * 0.2 + h * 1.5);
      float sway = wave * 0.07 + sin(t * 0.2 + h * 17.0) * 0.05;
      float flutter = sin(t * 1.3 + h * 40.0) * 0.025 * (1.0 + wave);
      vec2 twig = q - c - offset - vec2(sway, sway * 0.35);
      float size = 0.3 + 0.2 * hash(c + seed + 3.7);
      // Penumbra varies across the canopy: some leaves crisp, some blurred.
      float soft = softness * (0.6 + 0.8 * noise(c * 0.15 + seed + 2.0));
      // A loose spray of up to three leaves along each twig.
      for (int k = 0; k < 3; k++) {
        float fk = float(k);
        float hk = hash(c + seed + fk * 9.1);
        if (k != 1 && hk < 0.45) continue;
        float s = size * (0.7 + 0.3 * hk);
        float a = h * 6.283 + sway * 2.0 + flutter * (1.0 + 0.5 * fk) + (fk - 1.0) * (0.6 + 1.2 * hk);
        vec2 stem = (fk - 1.0) * vec2(0.22, 0.12 * hk);
        vec2 d = rot(a) * (twig - stem) - vec2(s, 0.0);
        float e = leafShape(d, s);
        cover = max(cover, 1.0 - smoothstep(1.0 - soft, 1.0 + soft, e));
      }
    }
  }
  return cover;
}

float branch(vec2 p, float slope, float offset, float width, float t) {
  float y = p.x * slope + offset + sin(p.x * 0.004 + t * 0.2) * 30.0;
  float d = abs(p.y - y) / sqrt(1.0 + slope * slope);
  return 1.0 - smoothstep(width * 0.5, width * 2.4, d);
}

void main() {
  vec2 p = gl_FragCoord.xy * uCssPerPixel;
  p.y = uRes.y * uCssPerPixel - p.y;
  float t = uTime;

  // A low sun stretches shadows along its direction.
  vec2 sp = rot(uSunAngle) * p;
  sp.x /= 1.0 + 0.7 * uEvening;
  vec2 gust = vec2(sin(t * 0.17) * 14.0 + sin(t * 0.07) * 22.0, cos(t * 0.13) * 8.0);

  float near = leaves(sp + gust, 92.0, 0.32, 0.0, t);
  float far = leaves(sp * 1.0 + gust * 0.6 + 400.0, 58.0, 0.65, 11.0, t * 0.8);
  float wood = max(branch(sp + gust * 0.4, -0.32, 260.0, 7.0, t), branch(sp + gust * 0.3, 0.18, 640.0, 4.0, t) * 0.8);

  float shade = 1.0 - (1.0 - near * 0.9) * (1.0 - far * 0.6) * (1.0 - wood * 0.85);
  shade = smoothstep(0.0, 1.0, shade);

  // Fade the shadow out away from the top-right corner.
  vec2 size = uRes * uCssPerPixel;
  float reach = length((p - vec2(size.x * 1.02, -size.y * 0.08)) / max(size.x, size.y));
  shade *= 1.0 - smoothstep(0.3, 1.0, reach + (noise(p * 0.004 + t * 0.02) - 0.5) * 0.25);

  vec3 col;
  if (uDark > 0.5) {
    vec3 moon = vec3(0.055, 0.065, 0.085);
    col = moon * (1.0 - shade);
  } else {
    vec3 sun = mix(vec3(1.0), vec3(1.0, 0.982, 0.95), uEvening);
    vec3 shadow = mix(vec3(0.87, 0.9, 0.885), vec3(0.86, 0.87, 0.89), uEvening);
    col = mix(sun, shadow, shade);
  }
  col += (hash(gl_FragCoord.xy + fract(t)) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}`;

/** Buffer pixels per CSS pixel. */
const RESOLUTION = 1 / 3;
const FRAME_INTERVAL = 1000 / 30;

/** 0 around midday, rising to 1 toward morning and evening. */
function sunPosition(date: Date) {
  const hour = date.getHours() + date.getMinutes() / 60;
  const fromNoon = Math.min(Math.abs(hour - 13) / 6, 1);
  return {
    evening: fromNoon ** 1.5,
    angle: ((hour - 13) / 12) * Math.PI * 0.5 + 0.35,
  };
}

/**
 * Renders the light into a fixed full-window canvas. No-op without WebGL.
 */
export function startDappleLight(canvas: HTMLCanvasElement) {
  // Alpha so an undrawn buffer (e.g. right after a resize) is transparent
  // rather than black, which would multiply the whole page to black.
  const gl = canvas.getContext("webgl2", {
    alpha: true,
    antialias: false,
    depth: false,
    powerPreference: "low-power",
  });
  if (!gl) return;

  const program = gl.createProgram();
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn("Light disabled:", gl.getShaderInfoLog(shader));
      return;
    }
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  gl.useProgram(program);
  gl.bindVertexArray(gl.createVertexArray());
  const uniform = (name: string) => gl.getUniformLocation(program, name);
  const uRes = uniform("uRes");
  const uCssPerPixel = uniform("uCssPerPixel");
  const uTime = uniform("uTime");
  const uEvening = uniform("uEvening");
  const uSunAngle = uniform("uSunAngle");
  const uDark = uniform("uDark");

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const html = document.documentElement;
  let time = Math.random() * 1000;
  let last = 0;
  let raf = 0;

  const draw = () => {
    const sun = sunPosition(new Date());
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uCssPerPixel, 1 / RESOLUTION);
    gl.uniform1f(uTime, time);
    gl.uniform1f(uEvening, sun.evening);
    gl.uniform1f(uSunAngle, sun.angle);
    gl.uniform1f(uDark, html.classList.contains("dark") ? 1 : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    canvas.classList.add("is-live");
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (now - last < FRAME_INTERVAL) return;
    time += Math.min((now - last) / 1000, 0.1);
    last = now;
    draw();
  };

  const moving = () => !reduceMotion.matches && !document.hidden;
  const sync = () => {
    if (moving() && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!moving() && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const resize = () => {
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * RESOLUTION));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * RESOLUTION));
    draw();
  };

  new ResizeObserver(resize).observe(canvas);
  document.addEventListener("visibilitychange", sync);
  reduceMotion.addEventListener("change", sync);
  // Redraw on theme change.
  new MutationObserver(draw).observe(html, {
    attributes: true,
    attributeFilter: ["class"],
  });
  canvas.addEventListener("webglcontextlost", () => {
    cancelAnimationFrame(raf);
    canvas.classList.remove("is-live");
  });

  resize();
  sync();
}
