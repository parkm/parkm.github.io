import React, { useCallback, useEffect, useRef } from "react";

export type Vec2 = { x: number; y: number };

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

export const DEFAULT_CENTER: Vec2 = { x: -0.745, y: 0.186 };
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 10_000_000;

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

const vertexShaderSource = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const fragmentShaderSource = `
precision highp float;

uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_zoom;
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

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float aspect = u_resolution.x / u_resolution.y;

  float scale = 3.5 / u_zoom;

  float cx = (uv.x - 0.5) * scale * aspect + u_center.x;
  float cy = (uv.y - 0.5) * scale + u_center.y;

  float zx = 0.0;
  float zy = 0.0;

  float maxIter = min(150.0 + u_zoom * 15.0, 400.0);
  float iter = 0.0;

  for (float i = 0.0; i < 400.0; i++) {
    if (i >= maxIter) break;

    float zx2 = zx * zx;
    float zy2 = zy * zy;

    if (zx2 + zy2 > 4.0) break;

    float xtemp = zx2 - zy2 + cx;
    zy = 2.0 * zx * zy + cy;
    zx = xtemp;
    iter = i;
  }

  vec3 color;
  float zx2 = zx * zx;
  float zy2 = zy * zy;
  float magnitude = zx2 + zy2;

  if (magnitude <= 4.0) {
    float depth = sin(cx * 15.0 + u_time * 0.5) * cos(cy * 15.0 - u_time * 0.3);
    float pulse = sin(u_time * 2.0) * u_corePulseAmp + u_corePulseBase;
    float breathe = sin(u_time * 0.5) * u_coreBreatheAmp + u_coreBreatheBase;
    color = u_coreColor * pulse * breathe * (1.0 + depth * u_coreDepthAmp);
  } else {
    float log_zn = log(magnitude) / 2.0;
    float nu = log(log_zn / log(2.0)) / log(2.0);
    float smoothIter = iter + 1.0 - nu;
    float t = smoothIter / maxIter;

    float spiral = sin(t * 30.0 + u_time * 1.2 + cx * 10.0) * 0.5 + 0.5;
    float wave = cos(t * 20.0 - u_time * 0.8 + cy * 10.0) * 0.5 + 0.5;
    float ripple = sin(sqrt(magnitude) * 3.0 - u_time * 2.0);

    float h = fract(u_hueOffset + t * u_hueCycles + u_time * u_hueSpeed);

    float s = u_satBase + spiral * u_satSpiral + wave * u_satWave;
    float v = u_valBase + t * u_valT + ripple * u_valRipple;

    float edgeGlow = exp(-t * 4.0) * u_edgeGlowStrength;
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

  gl_FragColor = vec4(color, 1.0);
}
`;

type MandelbrotVisualizationProps = {
  zoom: number;
  center: Vec2;
  onZoomChange: (zoom: number) => void;
  onCenterChange: (center: Vec2) => void;
};

export function MandelbrotVisualization({
  zoom,
  center,
  onZoomChange,
  onCenterChange,
}: MandelbrotVisualizationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const animationRef = useRef<number | null>(null);
  const timeRef = useRef<number>(0);

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

  const initWebGL = useCallback((): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      antialias: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });

    if (!gl) {
      console.error("WebGL not supported");
      return;
    }
    glRef.current = gl;

    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) {
      console.error("Failed to create shader(s)");
      return;
    }

    gl.shaderSource(vertexShader, vertexShaderSource);
    gl.compileShader(vertexShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
      console.error(
        "Vertex shader compile error:",
        gl.getShaderInfoLog(vertexShader),
      );
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    gl.shaderSource(fragmentShader, fragmentShaderSource);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error(
        "Fragment shader compile error:",
        gl.getShaderInfoLog(fragmentShader),
      );
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      console.error("Failed to create program");
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Program link error:", gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }

    gl.useProgram(program);
    programRef.current = program;

    const vertices = new Float32Array([
      -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
    ]);
    const buffer = gl.createBuffer();
    if (!buffer) {
      console.error("Failed to create buffer");
      return;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
  }, []);

  const render = useCallback((): void => {
    const gl = glRef.current;
    const program = programRef.current;
    const canvas = canvasRef.current;
    if (!gl || !program || !canvas) return;

    gl.viewport(0, 0, canvas.width, canvas.height);

    gl.uniform2f(
      gl.getUniformLocation(program, "u_resolution"),
      canvas.width,
      canvas.height,
    );
    gl.uniform2f(
      gl.getUniformLocation(program, "u_center"),
      center.x,
      center.y,
    );
    gl.uniform1f(gl.getUniformLocation(program, "u_zoom"), zoom);
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
  }, [center, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateSize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };

    updateSize();
    initWebGL();

    const handleResize = (): void => {
      updateSize();
      if (glRef.current)
        glRef.current.viewport(0, 0, canvas.width, canvas.height);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [initWebGL]);

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

  const screenToPlaneDelta = useCallback(
    (clientX: number, clientY: number, z: number) => {
      const scale = 3.5 / z;
      const aspect = window.innerWidth / window.innerHeight;
      const dx = (clientX / window.innerWidth - 0.5) * scale * aspect;
      const dy = (0.5 - clientY / window.innerHeight) * scale;
      return { dx, dy };
    },
    [],
  );

  const zoomAroundPoint = useCallback(
    (clientX: number, clientY: number, zoomMul: number): void => {
      const prevZoom = zoom;
      const nextZoom = clamp(prevZoom * zoomMul, MIN_ZOOM, MAX_ZOOM);

      const before = screenToPlaneDelta(clientX, clientY, prevZoom);
      const after = screenToPlaneDelta(clientX, clientY, nextZoom);

      onCenterChange({
        x: center.x + (before.dx - after.dx),
        y: center.y + (before.dy - after.dy),
      });
      onZoomChange(nextZoom);
    },
    [zoom, center, screenToPlaneDelta, onZoomChange, onCenterChange],
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
    onZoomChange(1);
    onCenterChange(DEFAULT_CENTER);
  }, [onZoomChange, onCenterChange]);

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
          onZoomChange(1);
          onCenterChange(DEFAULT_CENTER);
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
    [onZoomChange, onCenterChange],
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
          const scale = 3.5 / zoom;
          const aspect = window.innerWidth / window.innerHeight;
          const planeDx = -(dMidX / window.innerWidth) * scale * aspect;
          const planeDy = (dMidY / window.innerHeight) * scale;
          onCenterChange({ x: center.x + planeDx, y: center.y + planeDy });
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
          const scale = 3.5 / zoom;
          const aspect = window.innerWidth / window.innerHeight;
          const planeDx = -(dMidX / window.innerWidth) * scale * aspect;
          const planeDy = (dMidY / window.innerHeight) * scale;
          onCenterChange({ x: center.x + planeDx, y: center.y + planeDy });
        }

        const ratio = dist / g.lastDist;
        if (Number.isFinite(ratio) && ratio > 0) {
          const zoomFactor = 4.5;
          const amplifiedRatio =
            ratio > 1
              ? 1 + (ratio - 1) * zoomFactor
              : 1 - (1 - ratio) * zoomFactor;
          zoomAroundPoint(mid.x, mid.y, amplifiedRatio);
        }

        g.lastMid = mid;
        g.lastDist = dist;
      }
    },
    [zoom, center, zoomAroundPoint, onCenterChange],
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
