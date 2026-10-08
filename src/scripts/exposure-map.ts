// The exposure map behind the hero: slowly drifting contour lines, read by a scan
// sweep every few seconds. First-party WebGL2 in about 4 KB, no library. It draws one
// still frame under reduced motion, stops when scrolled out of view, and leaves the
// CSS glow alone when WebGL is unavailable.

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
  float sx = fract(u_time / 11.0) * 1.4 - 0.2;
  float sweep = exp(-pow((uv.x - sx) / 0.07, 2.0));
  float wake = smoothstep(sx - 0.35, sx, uv.x) * (1.0 - step(sx, uv.x));

  // Keep the headline column quiet, soften the band edges, add a light vignette.
  float left = smoothstep(0.18, 0.62, uv.x);
  float edge = smoothstep(0.0, 0.12, uv.y) * smoothstep(1.0, 0.82, uv.y);
  float vig = 1.0 - 0.35 * length((uv - vec2(0.65, 0.5)) * vec2(1.0, 1.4));

  // A faint elevation tint between the lines gives the field depth, like a shaded relief map.
  float relief = smoothstep(0.35, 0.85, h) * 0.045;
  float a = (line * 0.16 + major * 0.10) * (1.0 + sweep * 2.2 + wake * 0.35) + relief + sweep * 0.025;
  a *= left * edge * vig * u_gain;
  vec3 mint = vec3(0.384, 0.827, 0.651);
  o = vec4(mint * a, a);
}`;

export function mountExposureMap(canvas: HTMLCanvasElement) {
  const host = canvas.parentElement;
  if (!host) return;
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    antialias: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
  });
  if (!gl) {
    host.classList.add('no-map');
    return;
  }

  const compile = (type: number, src: string) => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    return shader;
  };
  const program = gl.createProgram()!;
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    host.classList.add('no-map');
    return;
  }
  gl.useProgram(program);

  // One triangle that covers the clip space; the fragment shader does the rest.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'p');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(program, 'u_res');
  const uTime = gl.getUniformLocation(program, 'u_time');
  const uPointer = gl.getUniformLocation(program, 'u_pointer');
  gl.uniform1f(gl.getUniformLocation(program, 'u_gain'), Number(canvas.dataset.gain ?? '1'));

  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const start = performance.now();
  let px = 0, py = 0, tx = 0, ty = 0;
  let visible = true;
  let last = 0;
  let raf = 0;

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.25);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (w === canvas.width && h === canvas.height) return;
    canvas.width = w;
    canvas.height = h;
    gl!.viewport(0, 0, w, h);
    gl!.uniform2f(uRes, w, h);
  }

  function draw(t: number) {
    px += (tx - px) * 0.06;
    py += (ty - py) * 0.06;
    gl!.uniform1f(uTime, t);
    gl!.uniform2f(uPointer, px, py);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  // About 30 frames a second is plenty for terrain that drifts this slowly.
  function frame(now: number) {
    raf = 0;
    if (!visible || document.hidden) return;
    if (now - last >= 31) {
      last = now;
      draw((now - start) / 1000);
    }
    schedule();
  }
  function schedule() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  resize();
  if (reduce.matches) {
    // One composed still, with the scan band resting on the right.
    new ResizeObserver(() => { resize(); draw(7.1); }).observe(canvas);
    draw(7.1);
    host.classList.add('map-live');
    return;
  }

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) schedule();
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
  host.classList.add('map-live');
  schedule();
}
