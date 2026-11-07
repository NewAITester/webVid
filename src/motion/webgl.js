/**
 * هستهٔ رندر WebGL — فاز ۴۰
 * ─────────────────────────────────────────────────────────────
 * یک رندر موازی کوچک برای افکت‌های رنگی/تاری که با شیدر اجرا می‌شوند.
 * قاعدهٔ امن: اگر WebGL در دسترس نباشد (مرورگر قدیمی، Node، بوم جعلی
 * تست‌ها)، همهٔ متدها null/false برمی‌گردانند و رندر Canvas 2D فعلی
 * بدون هیچ تغییری کار می‌کند. هیچ‌جا WebGL جایگزین اجباری نیست.
 */

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
uniform float u_brightness; // -1..1
uniform float u_contrast;   // 0..2 (1 = بدون تغییر)
uniform float u_saturation; // 0..2 (1 = بدون تغییر)
uniform float u_blur;       // پیکسل (0 = بدون تاری)
uniform float u_vignette;   // 0..1
uniform vec2 u_center;

vec3 hueRotate(vec3 c, float a) {
  // چرخش فام در فضای YIQ — همان ماتریس استاندارد hue-rotate
  const vec3 k = vec3(0.299, 0.587, 0.114);
  const vec3 yiq = vec3(dot(c, k));
  vec3 chroma = c - yiq;
  float cosA = cos(a), sinA = sin(a);
  vec3 yiq2 = vec3(
    0.299 * c.r + 0.587 * c.g + 0.114 * c.b,
    0.596 * c.r - 0.274 * c.g - 0.322 * c.b,
    0.211 * c.r - 0.523 * c.g + 0.312 * c.b
  );
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
    // تاری جعبه‌ای ۳×۳ — ۹ نمونه با وزن برابر
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
  if (u_vignette > 0.001) {
    float d = distance(v_uv, u_center);
    c *= 1.0 - u_vignette * smoothstep(0.3, 0.9, d);
  }
  gl_FragColor = vec4(c, col.a);
}
`;

/**
 * ماتریس چرخش فام (سطر به سطر، ۳×۳) — نسخهٔ خالص JS برای تست.
 * در ۰ درجه ماتریس واحد است. فرمول استاندارد hue-rotate.
 */
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
      if (!canvas || typeof canvas.getContext !== 'function') return;
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) return;
      const vs = this._compile(gl, gl.VERTEX_SHADER, VERT_SRC);
      const fs = this._compile(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
      if (!vs || !fs) return;
      const prog = gl.createProgram();
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
      this.gl = gl; this.prog = prog;
      this.u = {};
      for (const n of ['u_tex', 'u_texel', 'u_hue', 'u_brightness', 'u_contrast', 'u_saturation', 'u_blur', 'u_vignette', 'u_center']) {
        this.u[n] = gl.getUniformLocation(prog, n);
      }
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 0, 0,  1, -1, 1, 0,  -1, 1, 0, 1,  1, 1, 1, 1,
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

  /**
   * بوم/عکس منبع را با تنظیمات رنگی و تاری از طریق شیدر رندر می‌کند
   * و بوم WebGL خودش را برمی‌گرداند؛ اگر پشتیبانی نشود null.
   */
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
      gl.uniform2f(this.u.u_center, 0.5, 0.5);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      return this.canvas;
    } catch {
      return null;
    }
  }
}
