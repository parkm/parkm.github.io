// WebGL wave background. Owns the shared engine state (time, base hue, ripples)
// and the master animation clock. Other modules read/write `engine` and register
// per-frame callbacks via `onFrame`.

import { hslToHex } from "./utils";

interface Ripple {
  x: number;
  y: number;
  startTime: number;
  strength: number;
  hueShift: number;
  directionX: number;
  directionY: number;
  speed: number;
}

const ripples: Ripple[] = [];
const MAX_RIPPLES = 12;
const RIPPLE_LIFETIME = 3.0;

// Shared, mutable engine state. Input steers `baseHue`/`baseHueVelocity`; the
// game reads `baseHue`/`time`.
export const engine = {
  time: 0,
  baseHue: 180,
  baseHueVelocity: 0.12,
  energy: 0, // 0..1 — driven by the game's combo; intensifies the background
  hueLockUntil: 0, // engine.time to hold baseHue until (the game's "match landed" beat)
};

// True while the hue is held for a beat after a big match — steering input and
// the auto-drift both pause so the match registers before the color can switch.
export function isHueLocked(): boolean {
  return engine.time < engine.hueLockUntil;
}

// Hold the base hue for `seconds` so a fresh match lands before it can change.
export function lockHue(seconds: number): void {
  engine.hueLockUntil = Math.max(engine.hueLockUntil, engine.time + seconds);
}

let gl: WebGL2RenderingContext | null = null;
let program: WebGLProgram | null = null;
let canvas: HTMLCanvasElement;
let colorValueEl: HTMLElement | null = null;

let previousX = -1;
let previousY = -1;
let previousTime = 0;

const frameCallbacks: Array<(time: number) => void> = [];

// Register a callback invoked once per rendered frame with the current time.
export function onFrame(cb: (time: number) => void): void {
  frameCallbacks.push(cb);
}

function createShader(
  glCtx: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = glCtx.createShader(type);
  if (!shader) return null;

  glCtx.shaderSource(shader, source);
  glCtx.compileShader(shader);

  if (!glCtx.getShaderParameter(shader, glCtx.COMPILE_STATUS)) {
    console.error("Shader compile error:", glCtx.getShaderInfoLog(shader));
    glCtx.deleteShader(shader);
    return null;
  }

  return shader;
}

export function addRipple(x: number, y: number): void {
  if (ripples.length >= MAX_RIPPLES) {
    ripples.shift();
  }

  const normalizedX = x / window.innerWidth;
  const normalizedY = 1.0 - y / window.innerHeight;

  let directionX = 0;
  let directionY = 0;
  let speed = 0;
  let strength = 0.3;

  const currentTime = performance.now();

  if (previousX >= 0 && previousY >= 0 && previousTime > 0) {
    const deltaTime = (currentTime - previousTime) / 1000;

    if (deltaTime > 0 && deltaTime < 0.5) {
      const deltaX = (x - previousX) / window.innerWidth;
      const deltaY = -(y - previousY) / window.innerHeight;

      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      speed = distance / deltaTime;

      if (distance > 0.001) {
        directionX = deltaX / distance;
        directionY = deltaY / distance;
      }

      const minStrength = 0.15;
      const maxStrength = 0.8;
      const speedScale = 1.5;
      strength =
        minStrength + Math.min(speed * speedScale, maxStrength - minStrength);
    }
  }

  previousX = x;
  previousY = y;
  previousTime = currentTime;

  ripples.push({
    x: normalizedX,
    y: normalizedY,
    startTime: engine.time,
    strength,
    hueShift: (Math.random() - 0.5) * 20 * (0.5 + strength * 0.5),
    directionX,
    directionY,
    speed: Math.min(speed, 10),
  });
}

function updateColorDisplay(h: number, s: number, l: number): void {
  if (colorValueEl) colorValueEl.textContent = hslToHex(h, s, l);
}

function animate(): void {
  if (!gl || !program) return;

  engine.time += 1 / 60;
  if (!isHueLocked()) {
    engine.baseHue = (engine.baseHue + engine.baseHueVelocity) % 360;
  }

  for (let i = ripples.length - 1; i >= 0; i--) {
    const age = engine.time - ripples[i].startTime;
    if (age > RIPPLE_LIFETIME) {
      ripples.splice(i, 1);
    }
  }

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);

  const resolutionLocation = gl.getUniformLocation(program, "u_resolution");
  gl.uniform2f(resolutionLocation, canvas.width, canvas.height);

  const timeLocation = gl.getUniformLocation(program, "u_time");
  gl.uniform1f(timeLocation, engine.time);

  const baseHueLocation = gl.getUniformLocation(program, "u_baseHue");
  gl.uniform1f(baseHueLocation, engine.baseHue);

  const energyLocation = gl.getUniformLocation(program, "u_energy");
  gl.uniform1f(energyLocation, engine.energy);

  const rippleCountLocation = gl.getUniformLocation(program, "u_rippleCount");
  gl.uniform1i(rippleCountLocation, Math.min(ripples.length, MAX_RIPPLES));

  const rippleData = new Float32Array(36);
  const rippleTimeData = new Float32Array(12);
  const rippleHueData = new Float32Array(12);
  const rippleDirectionData = new Float32Array(36);

  ripples.forEach((ripple, i) => {
    if (i < MAX_RIPPLES) {
      rippleData[i * 3] = ripple.x;
      rippleData[i * 3 + 1] = ripple.y;
      rippleData[i * 3 + 2] = ripple.strength;
      rippleTimeData[i] = ripple.startTime;
      rippleHueData[i] = ripple.hueShift;
      rippleDirectionData[i * 3] = ripple.directionX;
      rippleDirectionData[i * 3 + 1] = ripple.directionY;
      rippleDirectionData[i * 3 + 2] = ripple.speed;
    }
  });

  const ripplesLocation = gl.getUniformLocation(program, "u_ripples");
  gl.uniform3fv(ripplesLocation, rippleData);

  const rippleTimesLocation = gl.getUniformLocation(program, "u_rippleTimes");
  gl.uniform1fv(rippleTimesLocation, rippleTimeData);

  const rippleHuesLocation = gl.getUniformLocation(program, "u_rippleHues");
  gl.uniform1fv(rippleHuesLocation, rippleHueData);

  const rippleDirectionsLocation = gl.getUniformLocation(
    program,
    "u_rippleDirections",
  );
  gl.uniform3fv(rippleDirectionsLocation, rippleDirectionData);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  updateColorDisplay(engine.baseHue, 75, 52);

  for (const cb of frameCallbacks) cb(engine.time);

  requestAnimationFrame(animate);
}

function resize(): void {
  if (!canvas) return;
  canvas.width = window.innerWidth * window.devicePixelRatio;
  canvas.height = window.innerHeight * window.devicePixelRatio;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}

function initWebGL(): void {
  try {
    resize();

    gl = canvas.getContext("webgl2", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
    });

    if (!gl) {
      console.error("WebGL2 not supported");
      return;
    }

    const vertexShader = createShader(
      gl,
      gl.VERTEX_SHADER,
      `#version 300 es
        in vec2 a_position;
        out vec2 v_uv;

        void main() {
          v_uv = a_position * 0.5 + 0.5;
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `,
    );

    const fragmentShader = createShader(
      gl,
      gl.FRAGMENT_SHADER,
      `#version 300 es
        precision highp float;

        uniform vec2 u_resolution;
        uniform float u_time;
        uniform float u_baseHue;
        uniform float u_energy;
        uniform int u_rippleCount;
        uniform vec3 u_ripples[12];
        uniform float u_rippleTimes[12];
        uniform float u_rippleHues[12];
        uniform vec3 u_rippleDirections[12];

        in vec2 v_uv;
        out vec4 fragColor;

        const float PI = 3.14159265359;
        const float TAU = 6.28318530718;

        vec3 hsl2rgb(vec3 c) {
          vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
          return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
        }

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);

          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));

          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbm(vec2 p) {
          float value = 0.0;
          float amplitude = 0.5;
          float frequency = 1.0;

          for(int i = 0; i < 3; i++) {
            value += amplitude * noise(p * frequency);
            frequency *= 2.0;
            amplitude *= 0.5;
          }
          return value;
        }

        float directionalRipple(vec2 toRipple, vec2 direction, float speed, float time, float strength) {
          float waveSpeed = 0.6;
          float baseFrequency = 8.0;
          float frequency = baseFrequency * (0.8 + strength * 0.4);

          float directionStrength = length(direction);
          vec2 normalizedDir = directionStrength > 0.001 ? normalize(direction) : vec2(0.0, 0.0);

          float dotProduct = dot(normalize(toRipple + vec2(0.0001)), normalizedDir);
          float directionalBias = mix(1.0, max(0.0, dotProduct), min(1.0, directionStrength * 2.0));

          float dist = length(toRipple);

          float radius = time * waveSpeed;
          float distFromRing = abs(dist - radius);

          float ringWidth = 0.12 + strength * 0.05;
          float ringFalloff = smoothstep(ringWidth, 0.0, distFromRing);

          float fadeRate = 0.6 / (0.5 + strength * 0.5);
          float timeFade = exp(-time * fadeRate);

          float anisotropy = 1.0 + directionStrength * (0.3 + strength * 0.4);
          vec2 stretchedPos = toRipple;
          if (directionStrength > 0.001) {
            vec2 perpDir = vec2(-normalizedDir.y, normalizedDir.x);
            float alongDir = dot(toRipple, normalizedDir);
            float perpToDir = dot(toRipple, perpDir);
            stretchedPos = normalizedDir * alongDir + perpDir * perpToDir / anisotropy;
          }

          float stretchedDist = length(stretchedPos);
          float spatialFade = 1.0 / (1.0 + stretchedDist * stretchedDist * 2.5);

          float phase = dist * frequency - time * TAU;
          float wave = sin(phase);

          float directionalFalloff = mix(1.0, directionalBias, min(1.0, directionStrength * 1.5));

          float amplitudeMod = 0.3 + strength * 0.4;

          return wave * ringFalloff * timeFade * spatialFade * directionalFalloff * amplitudeMod;
        }

        void main() {
          vec2 uv = v_uv;
          vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
          float distFromCenter = length((uv - 0.5) * aspect);

          vec2 flowTime = vec2(u_time * 0.015, u_time * 0.012);
          float flow = fbm(uv * 1.2 + flowTime) * 2.0 - 1.0;
          vec2 flowField = vec2(flow, fbm(uv * 1.2 - flowTime)) * 0.005;

          vec2 baseUV = uv + flowField;

          float ambientWave = sin(baseUV.x * TAU * 0.8 + u_time * 0.08) * 0.5
                            + cos(baseUV.y * TAU * 0.8 + u_time * 0.1) * 0.5;
          ambientWave *= 0.05 * (1.0 + u_energy * 1.8);

          float turbulence = (fbm(baseUV * 1.5 + u_time * 0.04) - 0.5) * 0.15 * (1.0 + u_energy);

          float hueShift = ambientWave * 18.0 + turbulence * 10.0;
          float satShift = ambientWave * 5.0 + turbulence * 3.0;
          float lightShift = ambientWave * 8.0 + turbulence * 5.0;

          for(int i = 0; i < 12; i++) {
            if(i >= u_rippleCount) break;

            vec2 ripplePos = u_ripples[i].xy;
            float rippleStrength = u_ripples[i].z;
            float rippleAge = u_time - u_rippleTimes[i];
            float rippleHue = u_rippleHues[i];
            vec2 rippleDirection = u_rippleDirections[i].xy;
            float rippleSpeed = u_rippleDirections[i].z;

            if(rippleAge < 0.0 || rippleAge > 3.0) continue;

            vec2 toRipple = (uv - ripplePos) * aspect;

            float ripple = directionalRipple(toRipple, rippleDirection, rippleSpeed, rippleAge, rippleStrength);

            float effectMultiplier = rippleStrength;
            hueShift += ripple * rippleHue * 0.3 * effectMultiplier;
            satShift += ripple * 8.0 * effectMultiplier;
            lightShift += ripple * 10.0 * effectMultiplier;
          }

          float radialGradient = 1.0 - smoothstep(0.0, 0.8, distFromCenter);
          lightShift += (radialGradient - 0.5) * 10.0;
          satShift += (radialGradient - 0.5) * 6.0;

          float hue = mod(u_baseHue + hueShift, 360.0) / 360.0;
          float sat = clamp(0.72 + satShift / 100.0 + u_energy * 0.08, 0.60, 0.95);
          float light = clamp(0.58 + lightShift / 100.0 + u_energy * 0.05, 0.45, 0.78);

          vec3 color = hsl2rgb(vec3(hue, sat, light));

          float vignette = 1.0 - distFromCenter * (0.15 - u_energy * 0.08);
          color *= vignette;
          color *= 1.0 + u_energy * 0.12; // bloom as the combo climbs

          fragColor = vec4(color, 1.0);
        }
      `,
    );

    if (!vertexShader || !fragmentShader) {
      console.error("Failed to create shaders");
      return;
    }

    program = gl.createProgram();
    if (!program) return;

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      return;
    }

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.useProgram(program);

    animate();
  } catch (error) {
    console.error("Failed to initialize WebGL:", error);
  }
}

export function initWaves(
  canvasEl: HTMLCanvasElement,
  colorValue: HTMLElement,
): void {
  canvas = canvasEl;
  colorValueEl = colorValue;
  window.addEventListener("resize", resize);
  initWebGL();
}
