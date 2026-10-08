// The exposure map behind the hero: slowly drifting contour lines, read by a scan
// sweep every few seconds. First-party WebGL2 in about 4 KB, no library. It draws one
// still frame under reduced motion, runs only while in view, survives a lost context,
// and leaves the CSS glow alone when WebGL is unavailable or software-rendered.

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_pointer;
uniform float u_gain;
out vec4 o;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1, 0)), c = hash(i + vec2(0, 1)), d = hash(i + vec2(1, 1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = r * p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 q = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float t = u_time * 0.018;
  q += u_pointer * 0.035;

  // Terrain: domain-warped noise, drifting very slowly.
  vec2 w = vec2(fbm(q * 1.6 + t), fbm(q * 1.6 - t * 0.7 + 3.1));
  float h = fbm(q * 2.2 + 0.9 * w + vec2(t * 0.5, -t * 0.3));

  // Contour lines with analytic anti-aliasing; every third line is heavier.
  float k = h * 15.0;
  float aa = fwidth(k) * 1.2 + 0.02;
  float line = 1.0 - smoothstep(0.0, aa, abs(fract(k) - 0.5));
  float major = 1.0 - smoothstep(0.0, aa, abs(fract(k / 3.0) - 0.5) * 3.0);

  // The scan: a soft band crossing left to right about every eleven seconds.
  // (d * d rather than pow(): a negative base is undefined in GLSL ES.)
  float sx = fract(u_time / 11.0) * 1.4 - 0.2;
  float d = (uv.x - sx) / 0.07;
  float sweep = exp(-d * d);
  float wake = smoothstep(sx - 0.35, sx, uv.x) * (1.0 - step(sx, uv.x));

  // Keep the headline column quiet, soften the band edges, add a light vignette.
  float left = smoothstep(0.18, 0.62, uv.x);
  float edge = smoothstep(0.0, 0.12, uv.y) * (1.0 - smoothstep(0.82, 1.0, uv.y));
  float vig = 1.0 - 0.35 * length((uv - vec2(0.65, 0.5)) * vec2(1.0, 1.4));

  // A faint elevation tint between the lines gives the field depth, like a shaded relief map.
  float relief = smoothstep(0.35, 0.85, h) * 0.045;
  float a = (line * 0.16 + major * 0.10) * (1.0 + sweep * 2.2 + wake * 0.35) + relief + sweep * 0.025;
  a *= left * edge * vig * u_gain;
  vec3 mint = vec3(0.384, 0.827, 0.651);
  o = vec4(mint * a, a);
}`;

const STILL_FRAME_TIME = 7.1; // the scan band resting on the right

export function mountExposureMap(canvas: HTMLCanvasElement) {
  const host = canvas.parentElement;
  if (!host) return;

  const coarse = matchMedia('(pointer: coarse)').matches;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const gain = Number(canvas.dataset.gain ?? '1');
  // A sibling marked data-parallax (the record lines) drifts against the map under the pointer.
  const parallax = host.querySelector<HTMLElement>('[data-parallax]');
  // About 30 frames a second on desktops and 20 on phones: plenty for terrain that drifts this slowly.
  const frameInterval = coarse ? 48 : 31;
  const dprCap = coarse ? 1 : 1.25;

  let gl: WebGL2RenderingContext | null = null;
  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uPointer: WebGLUniformLocation | null = null;
  let lost = false;
  let visible = false;
  let raf = 0;
  let lastDraw = 0;
  let lastTick = 0;
  let active = 0; // seconds the map has actually been running; a pause does not jump the scan
  let px = 0, py = 0, tx = 0, ty = 0;
  let sentPx = '', sentPy = '';

  const giveUp = (why: string) => {
    host.classList.remove('map-live');
    host.classList.add('no-map');
    console.warn(`exposure map: ${why}`);
  };

  function setup(): boolean {
    gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: false,
      premultipliedAlpha: true,
      powerPreference: 'low-power',
      failIfMajorPerformanceCaveat: true,
    });
    if (!gl) return false;
    const ctx = gl;
    const compile = (type: number, src: string) => {
      const shader = ctx.createShader(type);
      if (!shader) return null;
      ctx.shaderSource(shader, src);
      ctx.compileShader(shader);
      if (!ctx.getShaderParameter(shader, ctx.COMPILE_STATUS)) {
        console.warn(ctx.getShaderInfoLog(shader));
        ctx.deleteShader(shader);
        return null;
      }
      return shader;
    };
    const vs = compile(ctx.VERTEX_SHADER, VERT);
    const fs = compile(ctx.FRAGMENT_SHADER, FRAG);
    const program = ctx.createProgram();
    if (!vs || !fs || !program) return false;
    ctx.attachShader(program, vs);
    ctx.attachShader(program, fs);
    ctx.linkProgram(program);
    ctx.deleteShader(vs);
    ctx.deleteShader(fs);
    if (!ctx.getProgramParameter(program, ctx.LINK_STATUS)) {
      console.warn(ctx.getProgramInfoLog(program));
      return false;
    }
    ctx.useProgram(program);

    // One triangle that covers the clip space; the fragment shader does the rest.
    ctx.bindBuffer(ctx.ARRAY_BUFFER, ctx.createBuffer());
    ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);
    const position = ctx.getAttribLocation(program, 'p');
    ctx.enableVertexAttribArray(position);
    ctx.vertexAttribPointer(position, 2, ctx.FLOAT, false, 0, 0);

    uRes = ctx.getUniformLocation(program, 'u_res');
    uTime = ctx.getUniformLocation(program, 'u_time');
    uPointer = ctx.getUniformLocation(program, 'u_pointer');
    ctx.uniform1f(ctx.getUniformLocation(program, 'u_gain'), gain);
    return true;
  }

  function resize(): boolean {
    if (!gl) return false;
    const dpr = Math.min(devicePixelRatio || 1, dprCap);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (w === canvas.width && h === canvas.height) return false;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uRes, w, h);
    return true;
  }

  function draw(time: number) {
    if (!gl || lost) return;
    gl.uniform1f(uTime, time);
    gl.uniform2f(uPointer, px, py);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (parallax) {
      const sx = px.toFixed(3), sy = py.toFixed(3);
      if (sx !== sentPx) { parallax.style.setProperty('--px', sx); sentPx = sx; }
      if (sy !== sentPy) { parallax.style.setProperty('--py', sy); sentPy = sy; }
    }
  }

  function frame(now: number) {
    raf = 0;
    if (!visible || lost || document.hidden) {
      lastTick = 0;
      return;
    }
    if (lastTick) active += Math.min(now - lastTick, 100) / 1000;
    lastTick = now;
    if (now - lastDraw >= frameInterval) {
      lastDraw = now;
      px += (tx - px) * 0.06;
      py += (ty - py) * 0.06;
      draw(active);
    }
    schedule();
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  const still = () => {
    resize();
    draw(STILL_FRAME_TIME);
  };

  if (!setup()) {
    giveUp('WebGL2 unavailable, software-rendered, or the shader failed to build');
    return;
  }

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); // allows the context to be restored
    lost = true;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    host.classList.remove('map-live');
    host.classList.add('no-map');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    if (!setup()) return;
    host.classList.remove('no-map');
    host.classList.add('map-live');
    canvas.width = 0; // force the viewport and resolution uniform to be set again
    if (reduce.matches) still();
    else { resize(); schedule(); }
  });

  resize();
  host.classList.add('map-live');

  if (reduce.matches) {
    still();
    new ResizeObserver(() => { if (resize()) draw(STILL_FRAME_TIME); }).observe(canvas);
    return;
  }

  new ResizeObserver(() => { if (resize()) draw(active); }).observe(canvas);
  // The loop starts when the canvas comes into view and stops when it leaves.
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) schedule();
    else lastTick = 0;
  }).observe(canvas);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) schedule();
  });
  if (matchMedia('(pointer: fine)').matches) {
    addEventListener(
      'pointermove',
      (e) => {
        tx = (e.clientX / innerWidth) * 2 - 1;
        ty = -((e.clientY / innerHeight) * 2 - 1);
      },
      { passive: true },
    );
  }
}
