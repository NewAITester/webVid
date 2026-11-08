/**
 * هستهٔ رندر WebGL — فاز R4 (بازسازی)
 * افکت‌های رنگی/تاری با شیدر اجرا می‌شوند؛ اگر WebGL نباشد (Node،
 * مرورگر قدیمی) همهٔ مسیرها امن برمی‌گردند و رندر Canvas 2D با
 * ctx.filter جایگزین می‌شود. هیچ‌جا WebGL اجباری نیست.
 */
import { effectParamsAt, isFxOn } from '../core/evaluate.js';

export const VERT_SRC = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const FRAG_SRC = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_texel;
uniform float u_hue;        // رادیان
uniform float u_brightness; // -1..1 (جمعی)
uniform float u_contrast;   // 0..2 (1 = بدون تغییر)
uniform float u_saturation; // 0..2 (1 = بدون تغییر)
uniform float u_blur;       // پیکسل (0 = بدون تاری)
uniform float u_vignette;   // 0..1
uniform float u_grayscale;  // 0..1
uniform float u_sepia;      // 0..1
uniform float u_invert;     // 0..1
uniform vec2 u_center;

vec3 hueRotate(vec3 c, float a) {
  vec3 yiq2 = vec3(
    0.299 * c.r + 0.587 * c.g + 0.114 * c.b,
    0.596 * c.r - 0.274 * c.g - 0.322 * c.b,
    0.211 * c.r - 0.523 * c.g + 0.312 * c.b
  );
  float cosA = cos(a), sinA = sin(a);
  vec3 rot = vec3(
    yiq2.x,
    yiq2.y * cosA - yiq2.z * sinA,
    yiq2.y * sinA + yiq2.z * cosA
  );
  return vec3(
    rot.x + 0.956 * rot.y + 0.621 * rot.z,
    rot.x - 0.272 * rot.y - 0.647 * rot.z,
    rot.x - 1.106 * rot.y + 1.703 * rot.z
  );
}

void main() {
  vec4 col;
  if (u_blur > 0.5) {
    vec4 sum = vec4(0.0);
    for (int x = -1; x <= 1; x++) {
      for (int y = -1; y <= 1; y++) {
        sum += texture2D(u_tex, v_uv + vec2(float(x), float(y)) * u_texel * u_blur);
      }
    }
    col = sum / 9.0;
  } else {
    col = texture2D(u_tex, v_uv);
  }
  vec3 c = col.rgb;
  c = hueRotate(c, u_hue);
  c = clamp((c - 0.5) * u_contrast + 0.5 + u_brightness, 0.0, 1.0);
  float luma = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(luma), c, u_saturation);
  if (u_grayscale > 0.001 || u_sepia > 0.001 || u_invert > 0.001) {
    float luma2 = dot(c, vec3(0.299, 0.587, 0.114));
    c = mix(c, vec3(luma2), u_grayscale);
    vec3 sepiaC = vec3(
      dot(c, vec3(0.393, 0.769, 0.189)),
      dot(c, vec3(0.349, 0.686, 0.168)),
      dot(c, vec3(0.272, 0.534, 0.131))
    );
    c = mix(c, sepiaC, u_sepia);
    c = mix(c, vec3(1.0) - c, u_invert);
  }
  if (u_vignette > 0.001) {
    float d = distance(v_uv, u_center);
    c *= 1.0 - u_vignette * smoothstep(0.3, 0.9, d);
  }
  gl_FragColor = vec4(c, col.a);
}
`;

/** ماتریس چرخش فام (۳×۳) — خالص JS برای تست. در ۰ درجه واحد است. */
export function hueRotateMatrix(deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  const lumR = 0.213, lumG = 0.715, lumB = 0.072;
  return [
    lumR + c * (1 - lumR) + s * (-lumR),
    lumG + c * (-lumG) + s * (-lumG),
    lumB + c * (-lumB) + s * (1 - lumB),
    lumR + c * (-lumR) + s * (0.143),
    lumG + c * (1 - lumG) + s * (0.14),
    lumB + c * (-lumB) + s * (-0.283),
    lumR + c * (-lumR) + s * (-(1 - lumR)),
    lumG + c * (-lumG) + s * (lumG),
    lumB + c * (1 - lumB) + s * (lumB),
  ];
}

export class WebGLRenderer {
  constructor(canvas) {
    this.supported = false;
    this.canvas = canvas || null;
    this.gl = null;
    try {
      if (!canvas) {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') return;
        canvas = document.createElement('canvas');
      }
      if (typeof canvas.getContext !== 'function') return;
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return;
      const vs = this._compile(gl, gl.VERTEX_SHADER, VERT_SRC);
      const fs = this._compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
      if (!vs || !fs) return;
      const prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
      this.gl = gl; this.prog = prog; this.canvas = canvas;
      this.u = {};
      for (const n of ['u_tex', 'u_texel', 'u_hue', 'u_brightness', 'u_contrast', 'u_saturation', 'u_blur', 'u_vignette', 'u_grayscale', 'u_sepia', 'u_invert', 'u_center']) {
        this.u[n] = gl.getUniformLocation(prog, n);
      }
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1,
      ]), gl.STATIC_DRAW);
      this.buf = buf;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      this.tex = tex;
      this.supported = true;
    } catch {
      this.supported = false;
      this.gl = null;
    }
  }

  _compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
    return sh;
  }

  /** بوم منبع را با تنظیمات رنگی/تاری از شیدر می‌گذراند و بوم WebGL را برمی‌گرداند؛ اگر نشد null. */
  adjust(source, opts = {}) {
    if (!this.supported || !source) return null;
    try {
      const gl = this.gl;
      const w = source.width || source.videoWidth || 1;
      const h = source.height || source.videoHeight || 1;
      if (this.canvas.width !== w) this.canvas.width = w;
      if (this.canvas.height !== h) this.canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.useProgram(this.prog);
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
      const pos = gl.getAttribLocation(this.prog, 'a_pos');
      const uv = gl.getAttribLocation(this.prog, 'a_uv');
      gl.enableVertexAttribArray(pos);
      gl.enableVertexAttribArray(uv);
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8);
      gl.uniform1i(this.u.u_tex, 0);
      gl.uniform2f(this.u.u_texel, 1 / w, 1 / h);
      gl.uniform1f(this.u.u_hue, ((opts.hue || 0) * Math.PI) / 180);
      gl.uniform1f(this.u.u_brightness, opts.brightness || 0);
      gl.uniform1f(this.u.u_contrast, opts.contrast == null ? 1 : opts.contrast);
      gl.uniform1f(this.u.u_saturation, opts.saturation == null ? 1 : opts.saturation);
      gl.uniform1f(this.u.u_blur, opts.blur || 0);
      gl.uniform1f(this.u.u_vignette, opts.vignette || 0);
      gl.uniform1f(this.u.u_grayscale, opts.grayscale || 0);
      gl.uniform1f(this.u.u_sepia, opts.sepia || 0);
      gl.uniform1f(this.u.u_invert, opts.invert || 0);
      gl.uniform2f(this.u.u_center, 0.5, 0.5);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return this.canvas;
    } catch {
      return null;
    }
  }
}

/**
 * پارامترهای WebGL یک لایه در زمان t — از افکت‌های رنگی/تاریِ فعال.
 * اگر هیچ افکت مرتبطی نباشد (یا همه در مقدار خنثی) null برمی‌گرداند.
 */
export function webglParamsFor(layer, t) {
  let out = null;
  const put = (k, v, isDefault) => { if (!isDefault) { (out ||= {})[k] = v; } };
  for (const fx of (layer.effects || []).filter(isFxOn)) {
    const p = effectParamsAt(fx, t - layer.start);
    if (fx.id === 'brightness') put('brightness', p.amount || 0, !p.amount);
    else if (fx.id === 'contrast') put('contrast', 1 + (p.amount || 0), !p.amount);
    else if (fx.id === 'saturation') put('saturation', 1 + (p.amount || 0), !p.amount);
    else if (fx.id === 'hueShift') put('hue', p.amount || 0, !p.amount);
    else if (fx.id === 'blur') put('blur', p.amount || 0, !(p.amount > 0));
    else if (fx.id === 'vignette') put('vignette', p.amount || 0, !p.amount);
    else if (fx.id === 'grayscale') put('grayscale', p.amount ?? 0, !(p.amount > 0));
    else if (fx.id === 'sepia') put('sepia', p.amount ?? 0, !(p.amount > 0));
    else if (fx.id === 'invert') put('invert', p.amount ?? 0, !(p.amount > 0));
  }
  return out;
}

/**
 * مرجع پیکسلی خالص JS برای فرگمنت شیدر — همان ریاضی شیدر روی
 * Uint8ClampedArray (درجا تغییر می‌کند). برای تست و راستی‌آزمایی.
 */
export function applyColorAdjustPixels(data, w, h, opts = {}) {
  const hue = ((opts.hue || 0) * Math.PI) / 180;
  const brightness = opts.brightness || 0;
  const contrast = opts.contrast == null ? 1 : opts.contrast;
  const saturation = opts.saturation == null ? 1 : opts.saturation;
  const vignette = opts.vignette || 0;
  const grayscale = opts.grayscale || 0;
  const sepia = opts.sepia || 0;
  const invert = opts.invert || 0;
  const blur = opts.blur || 0;
  const cosA = Math.cos(hue), sinA = Math.sin(hue);
  const smoothstep = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  let src = data;
  if (blur > 0.5) {
    const r = Math.max(1, Math.round(blur));
    const tmp = new Uint8ClampedArray(data);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.max(0, Math.min(w - 1, x + dx * r));
        const yy = Math.max(0, Math.min(h - 1, y + dy * r));
        const o = (yy * w + xx) * 4;
        sr += tmp[o]; sg += tmp[o + 1]; sb += tmp[o + 2]; sa += tmp[o + 3];
      }
      const o = (y * w + x) * 4;
      data[o] = sr / 9; data[o + 1] = sg / 9; data[o + 2] = sb / 9; data[o + 3] = sa / 9;
    }
    src = data;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = (y * w + x) * 4;
    let r = src[o] / 255, g = src[o + 1] / 255, b = src[o + 2] / 255;
    const Y = 0.299 * r + 0.587 * g + 0.114 * b;
    const I = 0.596 * r - 0.274 * g - 0.322 * b;
    const Q = 0.211 * r - 0.523 * g + 0.312 * b;
    const I2 = I * cosA - Q * sinA;
    const Q2 = I * sinA + Q * cosA;
    r = Y + 0.956 * I2 + 0.621 * Q2;
    g = Y - 0.272 * I2 - 0.647 * Q2;
    b = Y - 1.106 * I2 + 1.703 * Q2;
    r = Math.max(0, Math.min(1, (r - 0.5) * contrast + 0.5 + brightness));
    g = Math.max(0, Math.min(1, (g - 0.5) * contrast + 0.5 + brightness));
    b = Math.max(0, Math.min(1, (b - 0.5) * contrast + 0.5 + brightness));
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    r = luma + (r - luma) * saturation;
    g = luma + (g - luma) * saturation;
    b = luma + (b - luma) * saturation;
    if (grayscale > 0.001 || sepia > 0.001 || invert > 0.001) {
      const l2 = 0.299 * r + 0.587 * g + 0.114 * b;
      r = r + (l2 - r) * grayscale;
      g = g + (l2 - g) * grayscale;
      b = b + (l2 - b) * grayscale;
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r + (sr - r) * sepia;
      g = g + (sg - g) * sepia;
      b = b + (sb - b) * sepia;
      r = r + ((1 - r) - r) * invert;
      g = g + ((1 - g) - g) * invert;
      b = b + ((1 - b) - b) * invert;
    }
    if (vignette > 0.001) {
      const u = (x + 0.5) / w, v = (y + 0.5) / h;
      const d = Math.hypot(u - 0.5, v - 0.5);
      const f = 1 - vignette * smoothstep(0.3, 0.9, d);
      r *= f; g *= f; b *= f;
    }
    data[o] = Math.round(Math.max(0, Math.min(1, r)) * 255);
    data[o + 1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
    data[o + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
  }
  return data;
}
