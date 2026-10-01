import React, { useCallback, useEffect, useRef } from "react";
import {
  centerApprox,
  computeReference,
  maxIterations,
  referenceFits,
  referenceOffset,
  viewScale,
  ORBIT_TEXTURE_WIDTH,
  VIEW_SPAN,
  type Reference,
  type Vec2,
  type View,
} from "./view";

const PALETTE = {
  hueSpeed: 0.04,
  hueCycles: 1.0,
  hueOffset: 0.0,
  satBase: 0.75,
  satSpiral: 0.2,
  satWave: 0.1,
  valBase: 0.5,
  valT: 0.45,
  valRipple: 0.08,
  edgeGlowStrength: 0.45,
  veinStrength: 0.08,
  coreColor: [0.02, 0.06, 0.04] as const,
  corePulseAmp: 0.1,
  corePulseBase: 0.9,
  coreBreatheAmp: 0.1,
  coreBreatheBase: 0.9,
  coreDepthAmp: 0.3,
} as const;

const vertexShaderSource = `#version 300 es
  layout(location = 0) in vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

// Most iterations the iteration pass can report (it packs them into 24 bits).
const MAX_PACKED_ITERATIONS = 262144;

// Pass 1: iterates every pixel and writes out how it escaped. This is the
// expensive part, so it only runs when the view changes, a strip at a time.
//
// Each pixel is iterated as its difference d from the reference orbit
// (perturbation): d' = 2·Z·d + d² + dc, which stays accurate in float32 however
// deep the view is. d is held as w·2^e so it can be far smaller than a float
// allows, and whenever the pixel's orbit comes closer to 0 than to the
// reference, it restarts against the beginning of the reference (rebasing),
// which is what keeps a single reference valid for the whole screen.
const iterateShaderSource = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform vec2 u_resolution;
uniform sampler2D u_orbit;
uniform int u_orbitLength;
uniform int u_maxIter;
uniform int u_scaleExp;
uniform float u_scaleMant;
uniform vec2 u_refOffset;
// Plain float view, for the shortcut below. Only good at shallow zooms.
uniform bool u_shallow;
uniform vec2 u_center;
uniform float u_viewHeight;

out vec4 outData;

vec2 cmul(vec2 a, vec2 b) {
  return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec4 orbitAt(int i) {
  return texelFetch(
    u_orbit,
    ivec2(i % ${ORBIT_TEXTURE_WIDTH}, i / ${ORBIT_TEXTURE_WIDTH}),
    0
  );
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;

  // The main cardioid and the period-2 bulb fill much of a shallow view and
  // would each cost the full iteration count per pixel; they have closed
  // forms. The margin keeps float error on the side of iterating.
  if (u_shallow) {
    vec2 c = u_center + (uv - 0.5) * vec2(aspect, 1.0) * u_viewHeight;
    float x = c.x - 0.25;
    float q = x * x + c.y * c.y;
    bool inCardioid = q * (q + x) < 0.25 * c.y * c.y - 1e-6;
    bool inBulb = (c.x + 1.0) * (c.x + 1.0) + c.y * c.y < 0.0625 - 1e-6;
    if (inCardioid || inBulb) {
      outData = vec4(0.0);
      return;
    }
  }

  // Offset from the reference point, in units of 2^u_scaleExp.
  vec2 dc = ((uv - 0.5) * vec2(aspect, 1.0) + u_refOffset) * u_scaleMant;

  vec2 w = vec2(0.0);
  int e = u_scaleExp;
  int m = 0;
  vec4 ref = orbitAt(0);

  vec2 z = vec2(0.0);
  float iter = 0.0;
  bool escaped = false;

  for (int i = 0; i < u_maxIter; i++) {
    float s = exp2(float(e));
    w = 2.0 * (cmul(ref.xy, w) + cmul(ref.zw, w))
      + cmul(s * w, w)
      + dc * exp2(float(u_scaleExp - e));
    m++;
    iter += 1.0;

    ref = orbitAt(m);
    vec2 Z = ref.xy + ref.zw;
    z = (ref.xy + s * w) + ref.zw;

    if (dot(z, z) > 4.0) {
      escaped = true;
      break;
    }

    if (m >= u_orbitLength - 1) {
      w = z;
      e = 0;
      m = 0;
      ref = orbitAt(0);
    } else if (e > -100) {
      vec2 zScaled = Z * exp2(float(-e)) + w;
      if (dot(zScaled, zScaled) < dot(w, w)) {
        w = zScaled;
        m = 0;
        ref = orbitAt(0);
      }
    }

    if (dot(w, w) > 1e20) {
      w *= exp2(-30.0);
      e += 30;
    }
  }

  if (!escaped) {
    outData = vec4(0.0);
    return;
  }

  float magnitude = dot(z, z);
  float log_zn = log(magnitude) / 2.0;
  float nu = log(log_zn / log(2.0)) / log(2.0);
  float smoothIter = max(iter - nu, 0.0);

  uint bits = uint(
    min(smoothIter / ${MAX_PACKED_ITERATIONS}.0, 1.0) * 16777215.0
  );
  outData = vec4(
    float(bits >> 16u) / 255.0,
    float((bits >> 8u) & 255u) / 255.0,
    float(bits & 255u) / 255.0,
    0.25 + 0.75 * clamp((magnitude - 4.0) / 60.0, 0.0, 1.0)
  );
}
`;

// Pass 2: colors the result of pass 1. Cheap, so it runs every frame to keep
// the palette animating.
const colorShaderSource = `#version 300 es
precision highp float;

uniform vec2 u_resolution;
uniform sampler2D u_data;
// Where the current view sits within the view u_data was rendered for: its
// height as a fraction of that view's, and its center's offset in that view's
// heights. Lets a view that has moved on be shown from the last result.
uniform float u_dataRatio;
uniform vec2 u_dataOffset;
uniform float u_dataAspect;
uniform vec2 u_center;
uniform float u_scale;
uniform float u_iterScale;
uniform float u_time;

uniform float u_hueSpeed;
uniform float u_hueCycles;
uniform float u_hueOffset;

uniform float u_satBase;
uniform float u_satSpiral;
uniform float u_satWave;

uniform float u_valBase;
uniform float u_valT;
uniform float u_valRipple;

uniform float u_edgeGlowStrength;
uniform float u_veinStrength;

uniform vec3 u_coreColor;
uniform float u_corePulseAmp;
uniform float u_corePulseBase;
uniform float u_coreBreatheAmp;
uniform float u_coreBreatheBase;
uniform float u_coreDepthAmp;

out vec4 outColor;

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;

  float cx = (uv.x - 0.5) * u_scale * aspect + u_center.x;
  float cy = (uv.y - 0.5) * u_scale + u_center.y;

  vec2 dataUv =
    0.5 +
    ((uv - 0.5) * vec2(aspect, 1.0) * u_dataRatio + u_dataOffset) /
      vec2(u_dataAspect, 1.0);
  vec4 data = texture(u_data, dataUv);
  bool escaped = data.a > 0.1;

  vec3 color;

  if (!escaped) {
    float depth = sin(cx * 15.0 + u_time * 0.5) * cos(cy * 15.0 - u_time * 0.3);
    float pulse = sin(u_time * 2.0) * u_corePulseAmp + u_corePulseBase;
    float breathe = sin(u_time * 0.5) * u_coreBreatheAmp + u_coreBreatheBase;
    color = u_coreColor * pulse * breathe * (1.0 + depth * u_coreDepthAmp);
  } else {
    vec3 bytes = floor(data.rgb * 255.0 + 0.5);
    float smoothIter =
      dot(bytes, vec3(65536.0, 256.0, 1.0)) / 16777215.0 * ${MAX_PACKED_ITERATIONS}.0;
    float magnitude = 4.0 + (data.a - 0.25) / 0.75 * 60.0;

    float t = smoothIter * u_iterScale;
    // Iteration counts grow without bound with depth; brightness follows a
    // triangle wave of t so it stays in range (and equals t while t <= 1).
    float tv = 1.0 - abs(mod(t, 2.0) - 1.0);

    float spiral = sin(t * 30.0 + u_time * 1.2 + cx * 10.0) * 0.5 + 0.5;
    float wave = cos(t * 20.0 - u_time * 0.8 + cy * 10.0) * 0.5 + 0.5;
    float ripple = sin(sqrt(magnitude) * 3.0 - u_time * 2.0);

    float h = fract(u_hueOffset + t * u_hueCycles + u_time * u_hueSpeed);

    float s = u_satBase + spiral * u_satSpiral + wave * u_satWave;
    float v = u_valBase + tv * u_valT + ripple * u_valRipple;

    float edgeGlow = exp(-tv * 4.0) * u_edgeGlowStrength;
    v += edgeGlow;

    float vein = sin(t * 70.0 + cx * 35.0 + cy * 35.0 + u_time * 0.5) * u_veinStrength;
    v *= (1.0 + vein);

    color = hsv2rgb(vec3(h, clamp(s, 0.0, 1.0), clamp(v, 0.0, 1.0)));

    float biolum = pow(spiral * wave, 3.0) * 0.25;
    color += vec3(biolum * 0.15, biolum * 0.4, biolum * 0.35);
  }

  vec2 vigUV = uv - 0.5;
  float vig = 1.0 - dot(vigUV, vigUV) * 0.4;
  color *= vig;

  outColor = vec4(color, 1.0);
}
`;

// The iteration pass is spread over frames in strips small enough not to hold
// a frame up, so the page keeps animating and responding while it works. In
// the meantime the last finished result is shown, shifted and scaled to the
// current view.
const INITIAL_STRIP_PIXELS = 60_000;
const MIN_STRIP_PIXELS = 2_000;
// While the view is moving, the pass renders at a fraction of full resolution
// chosen to finish in about this many strips, then once more at full
// resolution when the view comes to rest.
const MOVING_STRIPS = 3;
const MAX_STRIPS = 90;
const MIN_QUALITY = 0.15;
const SETTLE_DELAY_MS = 120;
// Zoom up to which a float can place a pixel well enough for the shortcut.
const SHALLOW_MAX_ZOOM = 10_000;

function createProgram(
  gl: WebGL2RenderingContext,
  fragmentSource: string,
): WebGLProgram | null {
  const compile = (type: number, source: string): WebGLShader | null => {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  };

  const vertexShader = compile(gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!vertexShader || !fragmentShader || !program) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

type DataTarget = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
  // The view the texture holds, once it holds one.
  view: View | null;
};

// An iteration pass in progress.
type Job = {
  view: View;
  width: number;
  height: number;
  nextRow: number;
  fullResolution: boolean;
};

type Renderer = {
  gl: WebGL2RenderingContext;
  iterateProgram: WebGLProgram;
  colorProgram: WebGLProgram;
  // The finished result being shown, and the one being rendered into.
  front: DataTarget;
  back: DataTarget;
  orbitTexture: WebGLTexture;
  reference: Reference | null;
  job: Job | null;
  // The strip the GPU is still working on, and how the frames since it was
  // handed over have gone.
  pending: {
    sync: WebGLSync;
    frames: number;
    slowestFrameMs: number;
  } | null;
  // How much of the current view fits in a strip without dropping frames.
  stripPixels: number;
  lastFrameAt: number;
  // The display's frame interval, as best observed.
  frameMs: number;
};

function createDataTarget(gl: WebGL2RenderingContext): DataTarget | null {
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  if (!texture || !framebuffer) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    texture,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { texture, framebuffer, width: 0, height: 0, view: null };
}

function createRenderer(canvas: HTMLCanvasElement): Renderer | null {
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  });
  if (!gl) {
    console.error("WebGL2 not supported");
    return null;
  }

  const iterateProgram = createProgram(gl, iterateShaderSource);
  const colorProgram = createProgram(gl, colorShaderSource);
  const front = createDataTarget(gl);
  const back = createDataTarget(gl);
  const orbitTexture = gl.createTexture();
  const buffer = gl.createBuffer();
  if (
    !iterateProgram ||
    !colorProgram ||
    !front ||
    !back ||
    !orbitTexture ||
    !buffer
  ) {
    console.error("Failed to set up WebGL resources");
    return null;
  }

  const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindTexture(gl.TEXTURE_2D, orbitTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  return {
    gl,
    iterateProgram,
    colorProgram,
    front,
    back,
    orbitTexture,
    reference: null,
    job: null,
    pending: null,
    stripPixels: INITIAL_STRIP_PIXELS,
    lastFrameAt: 0,
    frameMs: 16.7,
  };
}

function startJob(
  renderer: Renderer,
  view: View,
  width: number,
  height: number,
  fullResolution: boolean,
): void {
  const { gl, back } = renderer;

  if (!renderer.reference || !referenceFits(view, renderer.reference)) {
    const reference = computeReference(view);
    renderer.reference = reference;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, renderer.orbitTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      ORBIT_TEXTURE_WIDTH,
      reference.orbit.length / (ORBIT_TEXTURE_WIDTH * 4),
      0,
      gl.RGBA,
      gl.FLOAT,
      reference.orbit,
    );
  }

  if (back.width !== width || back.height !== height) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, back.texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    back.width = width;
    back.height = height;
  }

  renderer.job = { view, width, height, nextRow: 0, fullResolution };
}

// Checks on the strip the GPU was last given, and sizes the next one by how
// it went. False while the GPU is still busy with it.
function settlePending(renderer: Renderer, now: number): boolean {
  const { gl, pending } = renderer;

  const frameTime = now - renderer.lastFrameAt;
  renderer.lastFrameAt = now;
  renderer.frameMs = Math.min(
    Math.max(Math.min(renderer.frameMs * 1.01, frameTime), 4),
    34,
  );

  if (!pending) return true;
  pending.frames++;
  pending.slowestFrameMs = Math.max(pending.slowestFrameMs, frameTime);

  const status = gl.clientWaitSync(pending.sync, 0, 0);
  if (status === gl.TIMEOUT_EXPIRED) return false;

  const droppedFrames = pending.slowestFrameMs > renderer.frameMs * 1.6;
  if (droppedFrames || pending.frames >= 4) renderer.stripPixels *= 0.7;
  else if (pending.frames <= 2) renderer.stripPixels *= 1.2;
  renderer.stripPixels = Math.max(renderer.stripPixels, MIN_STRIP_PIXELS);

  gl.deleteSync(pending.sync);
  renderer.pending = null;
  return true;
}

// Renders the next strip of the job in progress.
function renderStrip(renderer: Renderer): void {
  const { gl, iterateProgram: program, back, job, reference } = renderer;
  if (!job || !reference) return;
  const { view, width, height } = job;

  // With nothing to show yet, the first pass goes in one piece. After that a
  // pass is never cut into more than MAX_STRIPS, so it always finishes soon.
  const rows = renderer.front.view
    ? Math.min(
        Math.max(
          Math.ceil(renderer.stripPixels / width),
          Math.ceil(height / MAX_STRIPS),
        ),
        height - job.nextRow,
      )
    : height;

  gl.bindFramebuffer(gl.FRAMEBUFFER, back.framebuffer);
  gl.viewport(0, 0, width, height);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(0, job.nextRow, width, rows);
  gl.useProgram(program);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, renderer.orbitTexture);
  gl.uniform1i(gl.getUniformLocation(program, "u_orbit"), 0);

  const scale = viewScale(view);
  const offset = referenceOffset(view, reference);
  const center = centerApprox(view);
  const zoom = Math.exp(view.logZoom);
  gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), width, height);
  gl.uniform1i(
    gl.getUniformLocation(program, "u_orbitLength"),
    reference.length,
  );
  gl.uniform1i(
    gl.getUniformLocation(program, "u_maxIter"),
    Math.min(maxIterations(view), MAX_PACKED_ITERATIONS),
  );
  gl.uniform1i(gl.getUniformLocation(program, "u_scaleExp"), scale.exponent);
  gl.uniform1f(gl.getUniformLocation(program, "u_scaleMant"), scale.mantissa);
  gl.uniform2f(
    gl.getUniformLocation(program, "u_refOffset"),
    offset.x,
    offset.y,
  );
  gl.uniform1i(
    gl.getUniformLocation(program, "u_shallow"),
    zoom <= SHALLOW_MAX_ZOOM ? 1 : 0,
  );
  gl.uniform2f(gl.getUniformLocation(program, "u_center"), center.x, center.y);
  gl.uniform1f(
    gl.getUniformLocation(program, "u_viewHeight"),
    VIEW_SPAN / zoom,
  );

  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.disable(gl.SCISSOR_TEST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  if (sync) {
    renderer.pending = { sync, frames: 0, slowestFrameMs: 0 };
  }

  job.nextRow += rows;
  if (job.nextRow >= height) {
    back.view = view;
    renderer.back = renderer.front;
    renderer.front = back;
    renderer.job = null;
  }
}

// Screen offsets are in view heights, with y pointing up.
type MandelbrotVisualizationProps = {
  view: View;
  onPan: (delta: Vec2) => void;
  onZoom: (factor: number, focus: Vec2) => void;
  onReset: () => void;
};

export function MandelbrotVisualization({
  view,
  onPan,
  onZoom,
  onReset,
}: MandelbrotVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const animationRef = useRef<number | null>(null);
  const timeRef = useRef<number>(0);

  const viewRef = useRef(view);
  const progressRef = useRef({
    // The view (or canvas) changed since an iteration pass was last started.
    stale: true,
    // A full-resolution pass of the current view has been started.
    sharp: false,
    changedAt: 0,
  });

  const pointersRef = useRef<Map<number, Vec2>>(new Map());
  const gestureRef = useRef<{
    lastMid: Vec2 | null;
    lastDist: number | null;
    lastTapAt: number;
    lastTapPos: Vec2 | null;
  }>({
    lastMid: null,
    lastDist: null,
    lastTapAt: 0,
    lastTapPos: null,
  });

  useEffect(() => {
    viewRef.current = view;
    progressRef.current.stale = true;
    progressRef.current.sharp = false;
    progressRef.current.changedAt = performance.now();
  }, [view]);

  const render = useCallback((): void => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) return;

    const { gl, colorProgram: program } = renderer;
    const view = viewRef.current;
    const progress = progressRef.current;
    const now = performance.now();

    // A sharpening pass can take a while; drop it if the view moves again.
    if (progress.stale && renderer.job?.fullResolution) renderer.job = null;

    if (settlePending(renderer, now)) {
      if (!renderer.job && progress.stale) {
        const pixels = canvas.width * canvas.height;
        const affordable = renderer.stripPixels * MOVING_STRIPS;
        // The very first pass has nothing to show in the meantime, so it is
        // not worth doing twice.
        const quality = renderer.front.view
          ? Math.min(Math.max(Math.sqrt(affordable / pixels), MIN_QUALITY), 1)
          : 1;
        startJob(
          renderer,
          view,
          Math.max(1, Math.round(canvas.width * quality)),
          Math.max(1, Math.round(canvas.height * quality)),
          false,
        );
        progress.stale = false;
        progress.sharp = quality >= 1;
      } else if (
        !renderer.job &&
        !progress.sharp &&
        now - progress.changedAt > SETTLE_DELAY_MS
      ) {
        startJob(renderer, view, canvas.width, canvas.height, true);
        progress.sharp = true;
      }

      if (renderer.job) renderStrip(renderer);
    }

    const shown = renderer.front.view;
    if (!shown) return;

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, renderer.front.texture);
    gl.uniform1i(gl.getUniformLocation(program, "u_data"), 1);

    const dataRatio = Math.exp(shown.logZoom - view.logZoom);
    const dataOffset = referenceOffset(view, shown);
    gl.uniform1f(gl.getUniformLocation(program, "u_dataRatio"), dataRatio);
    gl.uniform1f(
      gl.getUniformLocation(program, "u_dataAspect"),
      renderer.front.width / renderer.front.height,
    );
    gl.uniform2f(
      gl.getUniformLocation(program, "u_dataOffset"),
      dataOffset.x * dataRatio,
      dataOffset.y * dataRatio,
    );

    gl.uniform2f(
      gl.getUniformLocation(program, "u_resolution"),
      canvas.width,
      canvas.height,
    );
    const center = centerApprox(view);
    const zoom = Math.exp(view.logZoom);
    gl.uniform2f(
      gl.getUniformLocation(program, "u_center"),
      center.x,
      center.y,
    );
    gl.uniform1f(gl.getUniformLocation(program, "u_scale"), VIEW_SPAN / zoom);
    gl.uniform1f(
      gl.getUniformLocation(program, "u_iterScale"),
      1 / Math.min(150 + zoom * 15, 400),
    );
    gl.uniform1f(gl.getUniformLocation(program, "u_time"), timeRef.current);

    const p = PALETTE;

    gl.uniform1f(gl.getUniformLocation(program, "u_hueSpeed"), p.hueSpeed);
    gl.uniform1f(gl.getUniformLocation(program, "u_hueCycles"), p.hueCycles);
    gl.uniform1f(gl.getUniformLocation(program, "u_hueOffset"), p.hueOffset);

    gl.uniform1f(gl.getUniformLocation(program, "u_satBase"), p.satBase);
    gl.uniform1f(gl.getUniformLocation(program, "u_satSpiral"), p.satSpiral);
    gl.uniform1f(gl.getUniformLocation(program, "u_satWave"), p.satWave);

    gl.uniform1f(gl.getUniformLocation(program, "u_valBase"), p.valBase);
    gl.uniform1f(gl.getUniformLocation(program, "u_valT"), p.valT);
    gl.uniform1f(gl.getUniformLocation(program, "u_valRipple"), p.valRipple);

    gl.uniform1f(
      gl.getUniformLocation(program, "u_edgeGlowStrength"),
      p.edgeGlowStrength,
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "u_veinStrength"),
      p.veinStrength,
    );

    gl.uniform3f(
      gl.getUniformLocation(program, "u_coreColor"),
      p.coreColor[0],
      p.coreColor[1],
      p.coreColor[2],
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "u_corePulseAmp"),
      p.corePulseAmp,
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "u_corePulseBase"),
      p.corePulseBase,
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "u_coreBreatheAmp"),
      p.coreBreatheAmp,
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "u_coreBreatheBase"),
      p.coreBreatheBase,
    );
    gl.uniform1f(
      gl.getUniformLocation(program, "u_coreDepthAmp"),
      p.coreDepthAmp,
    );

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      progressRef.current.stale = true;
      progressRef.current.sharp = false;
    };

    updateSize();
    rendererRef.current = createRenderer(canvas);

    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  useEffect(() => {
    const animate = (): void => {
      timeRef.current += 0.016;
      render();
      animationRef.current = window.requestAnimationFrame(animate);
    };

    animationRef.current = window.requestAnimationFrame(animate);
    return () => {
      if (animationRef.current != null)
        window.cancelAnimationFrame(animationRef.current);
    };
  }, [render]);

  const zoomAroundPoint = useCallback(
    (clientX: number, clientY: number, zoomMul: number): void => {
      const height = window.innerHeight;
      onZoom(zoomMul, {
        x: (clientX - window.innerWidth / 2) / height,
        y: (height / 2 - clientY) / height,
      });
    },
    [onZoom],
  );

  const handleWheel = useCallback(
    (e: WheelEvent): void => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
      zoomAroundPoint(e.clientX, e.clientY, zoomFactor);
    },
    [zoomAroundPoint],
  );

  const handleDoubleClick = useCallback((): void => {
    onReset();
  }, [onReset]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): void => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      canvas.setPointerCapture?.(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const now = Date.now();
      const g = gestureRef.current;
      const dt = now - g.lastTapAt;

      if (dt < 320 && g.lastTapPos) {
        const dx = e.clientX - g.lastTapPos.x;
        const dy = e.clientY - g.lastTapPos.y;
        if (dx * dx + dy * dy < 30 * 30) {
          onReset();
          g.lastTapAt = 0;
          g.lastTapPos = null;
        }
      } else {
        g.lastTapAt = now;
        g.lastTapPos = { x: e.clientX, y: e.clientY };
      }

      g.lastMid = null;
      g.lastDist = null;
    },
    [onReset],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): void => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const pts = Array.from(pointersRef.current.values());

      if (pts.length === 1) {
        const current = pts[0];
        const g = gestureRef.current;

        if (g.lastMid == null) {
          g.lastMid = current;
          return;
        }

        const dMidX = current.x - g.lastMid.x;
        const dMidY = current.y - g.lastMid.y;

        if (dMidX !== 0 || dMidY !== 0) {
          onPan({
            x: -dMidX / window.innerHeight,
            y: dMidY / window.innerHeight,
          });
        }

        g.lastMid = current;
        return;
      }

      if (pts.length >= 2) {
        const a = pts[0];
        const b = pts[1];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const dist = Math.hypot(a.x - b.x, a.y - b.y);

        const g = gestureRef.current;

        if (g.lastMid == null || g.lastDist == null) {
          g.lastMid = mid;
          g.lastDist = dist;
          return;
        }

        const dMidX = mid.x - g.lastMid.x;
        const dMidY = mid.y - g.lastMid.y;

        if (dMidX !== 0 || dMidY !== 0) {
          onPan({
            x: -dMidX / window.innerHeight,
            y: dMidY / window.innerHeight,
          });
        }

        const ratio = dist / g.lastDist;
        if (Number.isFinite(ratio) && ratio > 0) {
          const zoomFactor = 4.5;
          const amplifiedRatio =
            ratio > 1
              ? 1 + (ratio - 1) * zoomFactor
              : 1 - (1 - ratio) * zoomFactor;
          zoomAroundPoint(mid.x, mid.y, Math.max(amplifiedRatio, 0.1));
        }

        g.lastMid = mid;
        g.lastDist = dist;
      }
    },
    [zoomAroundPoint, onPan],
  );

  const onPointerUpOrCancel = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): void => {
      pointersRef.current.delete(e.pointerId);
      const g = gestureRef.current;

      if (pointersRef.current.size === 0) {
        g.lastMid = null;
        g.lastDist = null;
      } else {
        g.lastMid = null;
        g.lastDist = null;
      }
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const wheelListener = (e: WheelEvent) => handleWheel(e);
    canvas.addEventListener("wheel", wheelListener, { passive: false });
    return () => canvas.removeEventListener("wheel", wheelListener);
  }, [handleWheel]);

  return (
    <>
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUpOrCancel}
        onPointerCancel={onPointerUpOrCancel}
        onDoubleClick={handleDoubleClick}
        className="w-full h-full cursor-crosshair"
        style={{
          touchAction: "none",
          WebkitUserSelect: "none",
          userSelect: "none",
        }}
      />
    </>
  );
}
