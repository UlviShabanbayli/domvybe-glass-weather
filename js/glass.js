// DV54 SKYGLASS: the sky and the glass, one WebGL2 canvas behind the DOM widget.
//
// One full-screen pass per frame:
//   sky      the condition photo (cover-fit, slow drift, pointer parallax), cross-fading between conditions;
//            rain streaks falling through it; a breathing bloom around the sun.
//   glass    inside the widget's rounded rect (read from the DOM every frame): the photo seen through glass that is
//            frosted by a haze value per pixel. haze 0 = clear glass (sharp photo), ~0.4 = frosted (pre-blurred photo +
//            milk), 1 = fogged (heavier blur, milky condensation and micro-beads). A bevel refracts the rim inward, the
//            hourly strip is a darker inset pane, the selected hour is a small lifted lens that slides between cells.
//   drops    procedural water on the glass, anchored to the widget: three layers of beads that land (pop in) and dry
//            (shrink away), and two layers of running drops that stick and slip down the pane on a wobbly path, leaving
//            a clear trail with a line of tiny beads. Every drop is a lens: it shows the sharp sky, inverted and
//            minified, with a dark total-internal-reflection rim, a specular glint and a caustic.
//   wipe     a small ping-pong mask (1/4 css px) the pointer paints into; it decays so the fog creeps back in patches.
// Nothing here draws text: all type is DOM above the canvas.

const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;
uniform vec2 uRes;          // device px
uniform vec2 uCss;          // css px
uniform float uDpr;
uniform float uT;
uniform vec4 uSkyXf;        // sky uv = pc * xy + zw
uniform float uMix;         // cross-fade A -> B
uniform sampler2D uSA, uBA, uFA, uSB, uBB, uFB, uMask, uNoise;
uniform vec4 uW; uniform float uWR;      // widget rect (css x, y, w, h), radius
uniform vec4 uS; uniform float uSR;      // hourly strip rect, radius
uniform vec4 uSel; uniform float uSelA;  // selection lens rect, alpha
uniform float uRain, uStreak, uFog, uFrost, uWarm;
uniform vec3 uSun;          // css x, y, strength
uniform float uScale;       // drop scale (phones are a little finer)
uniform float uOn;          // widget glass on
uniform float uFrame;
uniform vec4 uChip[3];     // header glass pills (css rects); frosted here instead of CSS backdrop-filter

uvec2 pcg(uvec2 v){
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return v;
}
vec4 H(vec2 id, float s){
  uvec2 a = pcg(uvec2(id + 8192.0) + uvec2(uint(s) * 7919u, uint(s) * 104729u));
  uvec2 b = pcg(a ^ uvec2(0x9E3779B9u, 0x85EBCA6Bu));
  return vec4(a, b) * (1.0 / 4294967296.0);
}

float sdRR(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
vec2 gRR(vec2 p, vec2 b, float r){
  vec2 q = abs(p) - b + r;
  vec2 g = (q.x > 0.0 && q.y > 0.0) ? normalize(q) : (q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));
  return g * sign(p + 1e-6);
}

vec2 suv(vec2 pc){ return pc * uSkyXf.xy + uSkyXf.zw; }
vec3 tS(vec2 uv){ vec3 c = texture(uSA, uv).rgb; if (uMix > 0.0) c = mix(c, texture(uSB, uv).rgb, uMix); return c; }
vec3 tB(vec2 uv){ vec3 c = texture(uBA, uv).rgb; if (uMix > 0.0) c = mix(c, texture(uBB, uv).rgb, uMix); return c; }
vec3 tF(vec2 uv){ vec3 c = texture(uFA, uv).rgb; if (uMix > 0.0) c = mix(c, texture(uFB, uv).rgb, uMix); return c; }

// rain falling through the sky: thin streaks, two depths
float streaks(vec2 pc){
  if (uStreak < 0.002) return 0.0;
  vec2 q = vec2(pc.x - pc.y * 0.13, pc.y);
  float a = 0.0;
  for (int L = 0; L < 2; L++) {
    float fl = float(L);
    float w = mix(9.0, 5.0, fl);
    float len = mix(190.0, 95.0, fl);
    float cx = floor(q.x / w);
    vec4 h = H(vec2(cx, 31.0 + fl), 3.0);
    float y = q.y - uT * mix(1350.0, 900.0, fl) * (0.8 + 0.4 * h.y) - h.z * 7000.0;
    float per = len * mix(3.6, 2.8, fl);
    float k = floor(y / per);
    vec4 g = H(vec2(cx, k), 5.0 + fl);
    float f = (y - k * per) - g.w * (per - len);
    float on = step(g.x, uStreak * mix(0.5, 0.42, fl));
    float body = smoothstep(0.0, len, f) * step(f, len);
    float xo = q.x - (cx + 0.25 + 0.5 * g.y) * w;
    a += on * body * exp(-xo * xo / mix(1.1, 0.55, fl)) * mix(0.42, 0.28, fl) * (0.55 + 0.45 * g.z);
  }
  return a;
}

// a bead in this cell: returns (offset / radius, radius px). life 1 = lands and dries in a cycle; eat shrinks it
vec3 bead(vec2 gp, float S, float s, float life, float eat, float dens){
  vec2 id = floor(gp / S);
  vec4 h = H(id, s);
  vec4 k = H(id, s + 1.0);
  float r0 = S * (0.08 + 0.28 * pow(h.z, 2.3));
  vec2 c = (id + 0.5) * S + (h.xy - 0.5) * max(S - 2.8 * r0 - 2.0, 0.0);   // room for the halo inside the cell
  float P = 8.0 + 15.0 * k.x;
  float ph = fract(uT / P + k.y);
  float r = r0 * mix(1.0, smoothstep(0.0, 0.01, ph) * (1.0 - smoothstep(0.8, 1.0, ph)), life);
  r *= smoothstep(k.z, k.z + 0.1, uRain * dens) * eat;
  vec2 v = gp - c;
  float il = inversesqrt(dot(v, v) + 1e-4);
  float wob = 1.0 + 0.14 * (k.w - 0.5) * (2.0 * v.x * v.y * il * il) + 0.12 * (h.w - 0.5) * ((v.x * v.x - v.y * v.y) * il * il) + 0.07 * v.y * il;
  return vec3(v / max(r * wob, 1e-3), r);
}

// a column of running drops: the drop, its clear trail and the beads it leaves behind
void runner(vec2 gp, float CW, float s, float span, inout vec3 best, inout float trail){
  float off = s * 23.0;
  float ci = floor((gp.x + off) / CW);
  vec4 h = H(vec2(ci, 3.0), s);
  vec4 g = H(vec2(ci, 4.0), s);
  float exist = smoothstep(g.x, g.x + 0.12, uRain * 1.3 - 0.12);
  if (exist <= 0.0) return;
  float sp = 1.1 + 0.9 * h.z;                     // stick-slip beats per second
  float P = 9.0 + 10.0 * h.y;                     // seconds per pass
  float st = uT * sp + h.w * 50.0;
  float fs = fract(st);
  float jerk = floor(st) + smoothstep(0.3, 0.75, fs);
  float mv = mix(st, jerk, 0.78) / (P * sp) + g.y;
  float cyc = floor(mv);
  float yd = fract(mv) * (span * 1.75 + 80.0) - 40.0;
  vec4 cv = H(vec2(ci, cyc), s + 9.0);
  float r = (4.2 + 5.6 * h.x) * exist * (0.8 + 0.4 * cv.x);
  float base = (ci + 0.5) * CW - off;
  float A = CW * 0.15, ph = cv.y * 6.2832;
  float xd = base + A * sin(yd * 0.019 + ph) + A * 0.45 * sin(yd * 0.061 + ph * 1.7);
  float slide = smoothstep(0.3, 0.45, fs) * (1.0 - smoothstep(0.6, 0.8, fs));
  vec2 v = gp - vec2(xd, yd);
  float ry = v.y < 0.0 ? r * (1.22 + 0.5 * slide) : r * 0.97;
  vec2 d = vec2(v.x / (r * (1.0 - 0.07 * slide)), v.y / ry);
  if (dot(d, d) < dot(best.xy, best.xy)) best = vec3(d, r);
  float dy = yd - gp.y;
  if (dy > 0.0) {
    float xt = base + A * sin(gp.y * 0.019 + ph) + A * 0.45 * sin(gp.y * 0.061 + ph * 1.7);
    float tw = r * 0.6 * (1.0 - 0.5 * smoothstep(0.0, 600.0, dy));
    trail = max(trail, exp(-dy / 190.0) * smoothstep(tw, tw * 0.3, abs(gp.x - xt)));
    float B = 9.0;
    float kb = floor(gp.y / B);
    vec4 b = H(vec2(ci + 977.0 * s, kb), s + 13.0);
    float yb = (kb + 0.5) * B + (b.y - 0.5) * 3.0;
    float xb = base + A * sin(yb * 0.019 + ph) + A * 0.45 * sin(yb * 0.061 + ph * 1.7) + (b.w - 0.5) * r * 0.8;
    float dyb = yd - yb;
    float rb = (0.8 + 2.1 * b.x * b.x) * step(b.z, 0.6) * smoothstep(r * 1.2, r * 2.2, dyb) * (1.0 - smoothstep(220.0, 640.0, dyb)) * exist;
    vec2 db = (gp - vec2(xb, yb)) / max(rb, 1e-3);
    if (rb > 0.05 && dot(db, db) < dot(best.xy, best.xy)) best = vec3(db, rb);
  }
}

void main(){
  vec2 pc = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;   // css px, y down
  vec4 nz = texture(uNoise, pc / 384.0);
  float rain = streaks(pc);

  // ---- sky
  vec3 sky = tS(suv(pc));
  float sd = length(pc - uSun.xy);
  float breath = 0.85 + 0.15 * sin(uT * 0.55);
  sky += uSun.z * (exp(-sd / 70.0) * 0.22 * breath + exp(-sd / 380.0) * 0.07) * vec3(1.0, 0.82, 0.55);
  sky = mix(sky, sky * 0.9 + vec3(0.1), rain * 0.9);
  sky += rain * vec3(0.55, 0.57, 0.6);

  vec2 wc = uW.xy + uW.zw * 0.5, wb = uW.zw * 0.5;
  float dW = sdRR(pc - wc, wb, uWR);
  // the pane's soft shadow and the warm light it bounces onto the sky
  float sh = 1.0 - smoothstep(-24.0, 46.0, sdRR(pc - wc - vec2(0.0, 22.0), wb, uWR));
  vec3 outC = sky * (1.0 - 0.2 * sh * uOn);
  vec3 col = outC;
  // frosted header pills: blurred photo, a little milk, a bright top rim
  for (int i = 0; i < 3; i++) {
    vec4 cr = uChip[i];
    if (cr.z <= 0.0) continue;
    vec2 cc = cr.xy + cr.zw * 0.5, cb = cr.zw * 0.5;
    float dc = sdRR(pc - cc, cb, cb.y);
    if (dc < 1.5) {
      float cv = clamp(0.5 - dc * uDpr, 0.0, 1.0);
      vec3 fc = tB(suv(pc)) * 0.92 + 0.07;
      fc += exp(-abs(dc + 0.8) / 0.8) * (0.25 + 0.25 * -gRR(pc - cc, cb, cb.y).y);
      col = mix(col, fc, cv);
    }
  }

  if (uOn > 0.0 && dW < 1.5) {
    vec2 gN = gRR(pc - wc, wb, uWR);
    float e = clamp(1.0 + dW / 20.0, 0.0, 1.0);
    float bev = e * e * e;
    vec2 rp = pc - gN * bev * 34.0;

    vec2 scn = uS.xy + uS.zw * 0.5, sb = uS.zw * 0.5;
    float dS = sdRR(pc - scn, sb, uSR);
    float inS = smoothstep(0.6, -0.6, dS);
    float es = clamp(1.0 + dS / 9.0, 0.0, 1.0) * inS;
    rp -= gRR(pc - scn, sb, uSR) * es * es * 7.0;

    vec2 lc = uSel.xy + uSel.zw * 0.5, lb = uSel.zw * 0.5;
    float dL = sdRR(pc - lc, lb, min(lb.x, lb.y));
    float inL = smoothstep(0.6, -0.6, dL) * uSelA * inS;
    float el = clamp(1.0 + dL / 10.0, 0.0, 1.0);
    rp -= gRR(pc - lc, lb, min(lb.x, lb.y)) * el * el * 10.0 * inL;
    rp = mix(rp, lc + (rp - lc) * 0.9, inL);       // the lens magnifies a little

    // drops (anchored to the pane)
    vec2 gp = (pc - uW.xy) / uScale;
    vec3 best = vec3(9.0, 9.0, 0.0);
    float trail = 0.0;
    if (uRain > 0.001) {
      float span = uW.w / uScale;
      runner(gp, 66.0, 1.0, span, best, trail);
      runner(gp, 101.0, 2.0, span, best, trail);
      float eat = 1.0 - smoothstep(0.12, 0.45, trail);
      vec3 b;
      b = bead(gp, 34.0, 21.0, 1.0, eat, 0.46); if (dot(b.xy, b.xy) < dot(best.xy, best.xy)) best = b;
      b = bead(gp, 17.0, 41.0, 1.0, eat, 0.22); if (dot(b.xy, b.xy) < dot(best.xy, best.xy)) best = b;
      b = bead(gp + 7.0, 10.0, 61.0, 0.6, eat, 0.32); if (dot(b.xy, b.xy) < dot(best.xy, best.xy)) best = b;
    }

    // haze: frost everywhere, fog builds from the edges in noisy patches, the wipe mask and running drops clear it
    float m = texture(uMask, vec2(pc.x / uCss.x, 1.0 - pc.y / uCss.y)).r;
    float clr = smoothstep(nz.r * 0.4, nz.r * 0.4 + 0.3, m);
    float edgeF = 1.0 - smoothstep(-10.0, -230.0, dW);   // 1 at the rim, 0 deep inside
    float nf = texture(uNoise, pc / 1100.0 + vec2(0.37, 0.61)).g;
    float fogP = smoothstep(0.0, 1.0, uFog * 1.25 - 0.12 + (nf - 0.5) * 0.6 + edgeF * 0.3 * uFog);
    float haze = max(uFrost, fogP);
    haze *= 1.0 - clr;
    haze *= 1.0 - 0.9 * trail;

    vec2 uv = suv(rp);
    // fetch only the layers this pixel needs (sharp where it is clear, fog blur where it is fogged)
    vec3 Bl = tB(uv);
    float hb = smoothstep(0.0, 0.42, haze), hf = smoothstep(0.3, 0.8, haze);
    vec3 gcol = hb < 0.999 ? mix(tS(uv), Bl, hb) : Bl;
    if (hf > 0.001) gcol = mix(gcol, tF(uv), hf);
    vec3 milk = mix(vec3(0.93, 0.905, 0.88), Bl * 1.05 + 0.12, mix(0.45, 0.22, smoothstep(0.5, 1.0, haze)));
    // sunlight scattered in the frosted pane, warm near the sun
    float lit = uSun.z * exp(-length(pc - uSun.xy) / (uCss.x * 0.24));
    gcol += lit * (0.2 + 0.8 * haze) * vec3(0.20, 0.12, 0.04);
    // frosted glass reads as a calm, slightly greyed pane (the board's beige), so white type holds on it
    float fr = smoothstep(0.1, 0.45, haze);
    float fogged = smoothstep(0.5, 1.0, haze);
    gcol = mix(gcol, vec3(dot(gcol, vec3(0.299, 0.587, 0.114))), 0.2 * fr) * mix(1.0, 0.89, fr * (1.0 - fogged));
    // condensation: a milky, low-contrast white veil
    gcol = mix(gcol, milk, 0.05 + 0.1 * smoothstep(0.08, 0.42, haze) + 0.58 * fogged);
    gcol *= mix(vec3(1.0), vec3(1.04, 1.0, 0.93), uWarm);
    gcol += rain * (0.3 - 0.27 * smoothstep(0.0, 0.4, haze)) * vec3(0.6);
    // the wet edge of a wiped path
    gcol += clr * (1.0 - clr) * 4.0 * 0.045;
    // condensation micro-beads where it is fogged
    if (haze > 0.45) {
      vec2 cid = floor(pc / 5.0);
      vec4 ch = H(cid, 77.0);
      vec2 cv = pc - (cid + 0.25 + 0.5 * ch.xy) * 5.0;
      float cr = 0.45 + 1.25 * ch.z * ch.z;
      float cd = length(cv) / cr;
      float mk = smoothstep(0.45, 0.85, haze) * step(ch.w, 0.75) * (1.0 - smoothstep(0.75, 1.0, cd));
      gcol = mix(gcol, gcol * 0.86 + vec3(0.04), mk * 0.6);
      gcol += mk * smoothstep(0.55, 0.0, length(cv / cr + vec2(0.35, 0.4))) * 0.22;
    }

    // inset strip and the selection lens
    gcol = mix(gcol, gcol * vec3(0.82, 0.8, 0.79), inS * 0.9);
    float sTop = exp(-abs(dS + 0.8) / 0.9) * (0.5 + 0.5 * -gRR(pc - scn, sb, uSR).y);
    gcol += sTop * 0.16 * smoothstep(1.5, -0.5, dS);
    gcol = mix(gcol, gcol * 1.09 + vec3(0.075, 0.07, 0.065), inL);
    float lRim = exp(-abs(dL + 0.7) / 0.8) * inS * uSelA;
    gcol += lRim * (0.22 + 0.2 * -gRR(pc - lc, lb, min(lb.x, lb.y)).y);

    // the pane's rim: bright bevel line, top-lit, and a soft inner glow
    float rimL = exp(-abs(dW + 0.9) / 0.85);
    float top = 0.55 + 0.45 * -gN.y;
    gcol += rimL * (0.32 + 0.38 * top);
    gcol += bev * 0.07 * top;
    gcol -= exp(-abs(dW + 3.0) / 2.2) * 0.05 * (1.0 - top);
    // slow light drifting across the glass (idle motion)
    float sw = dot(pc - uW.xy, normalize(vec2(1.0, 0.42)));
    float sp0 = (fract(uT / 17.0) * 1.8 - 0.4) * (uW.z + uW.w * 0.42);
    gcol += exp(-pow((sw - sp0) / 150.0, 2.0)) * 0.045 + exp(-pow((sw - sp0 - 120.0) / 22.0, 2.0)) * 0.025;

    // drops: lenses of the sharp sky
    float dl = length(best.xy);
    if (dl < 1.4 && best.z > 0.05) {
      float r = best.z * uScale;
      vec2 dd = best.xy;
      vec2 c = pc - dd * r;
      float hgt = sqrt(max(1.0 - dl * dl, 0.0));
      vec3 n = normalize(vec3(dd * 0.95, hgt + 0.05));
      vec2 q = c - dd * r * 5.5 - vec2(0.0, r * 1.5);
      vec3 dc = tS(suv(q));
      dc = dc * 1.06 + 0.035;
      float rim = smoothstep(0.5, 1.0, dl);
      dc *= 1.0 - 0.6 * rim * rim;
      dc = mix(dc, dc * vec3(0.86, 0.9, 1.0), rim * 0.4);
      vec3 R = reflect(vec3(0.0, 0.0, -1.0), n);
      vec3 L = normalize(vec3(-0.45, -0.75, 0.5));
      float spc = max(dot(R, L), 0.0);
      dc += pow(spc, 70.0) * 1.5 + pow(spc, 9.0) * 0.07;
      float caus = smoothstep(0.35, 0.85, dl) * smoothstep(0.1, 0.9, dd.y / max(dl, 1e-3)) * (1.0 - smoothstep(0.88, 1.0, dl));
      dc += caus * 0.3 * vec3(1.0, 0.95, 0.85);
      float cov = smoothstep(1.0, 1.0 - 1.6 / max(r * uDpr, 1.0), dl);
      // outside the drop: a little shade above, focused light below
      float ring = (1.0 - cov) * smoothstep(1.4, 1.0, dl);
      gcol *= 1.0 - ring * 0.16 * smoothstep(0.2, -0.8, dd.y / dl);
      gcol += ring * 0.12 * smoothstep(0.1, 0.9, dd.y / dl) * vec3(1.0, 0.96, 0.88);
      gcol = mix(gcol, dc, cov);
    }

    float cover = clamp(0.5 - dW * uDpr, 0.0, 1.0);
    col = mix(outC, gcol, cover);
  }
  col += (nz.b - 0.5) * (1.5 / 255.0);   // dither against banding in the soft gradients
  fragColor = vec4(col, 1.0);
}`;

const MASK_FS = `#version 300 es
precision highp float;
out vec4 o;
uniform sampler2D uPrev;
uniform vec2 uMRes, uCss;
uniform vec4 uSeg;      // css x0 y0 x1 y1
uniform float uBrush, uOn, uDecay;
void main(){
  vec2 f = gl_FragCoord.xy / uMRes;
  float m = texture(uPrev, f).r - uDecay;
  vec2 pc = vec2(f.x * uCss.x, (1.0 - f.y) * uCss.y);
  vec2 a = uSeg.xy, b = uSeg.zw, pa = pc - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-3), 0.0, 1.0);
  float d = length(pa - ba * h);
  m = max(m, uOn * smoothstep(uBrush, uBrush * 0.15, d));
  o = vec4(clamp(m, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => rej(new Error('image ' + src)); i.src = src; });

// smooth value noise, tileable, two octaves in R and G, white noise in B
function noiseData(N = 256) {
  const out = new Uint8Array(N * N * 4);
  const lattice = (g, seed) => { const a = new Float32Array(g * g); let s = seed; for (let i = 0; i < a.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; a[i] = s / 4294967296; } return a; };
  const sample = (a, g, x, y) => {
    const fx = x * g / N, fy = y * g / N, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const at = (i, j) => a[((j % g + g) % g) * g + ((i % g + g) % g)];
    return (at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx) * (1 - sy) + (at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx) * sy;
  };
  const A1 = lattice(8, 11), A2 = lattice(32, 23), B1 = lattice(6, 37), B2 = lattice(24, 41);
  let s = 99;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    out[i] = Math.round(255 * (sample(A1, 8, x, y) * 0.7 + sample(A2, 32, x, y) * 0.3));
    out[i + 1] = Math.round(255 * (sample(B1, 6, x, y) * 0.68 + sample(B2, 24, x, y) * 0.32));
    s = (s * 1664525 + 1013904223) >>> 0; out[i + 2] = s >>> 24; out[i + 3] = 255;
  }
  return out;
}

export class SkyGlass {
  constructor(canvas, { reduced = false } = {}) {
    this.canvas = canvas;
    this.reduced = reduced;
    this.skies = {};             // name -> { S, B, F } textures + meta
    this.from = null; this.to = null; this.mix = 0; this.mixV = 0;
    this.p = { rain: 0, streak: 0, fog: 0, frost: 0.42, warm: 0, sun: 1 };
    this.target = { ...this.p };
    this.t0 = performance.now(); this.t = 0; this.clockOffset = 46;   // open mid-shower: drops already running
    this.running = false; this.dirty = true; this.visible = true;
    this.rects = null; this.getRects = null;
    this.parallax = { x: 0, y: 0, tx: 0, ty: 0 };
    this.seg = null; this.maskUntil = 0; this.decayAcc = 0;
    this.frames = 0; this.onFirstFrame = null;
    this.scale = 1;
    this._tick = this._tick.bind(this);
    this.ok = this._init();
  }

  _init() {
    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) return false;
    this.gl = gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const prog = (fs, names) => {
      const pr = gl.createProgram();
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs));
      gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
      const u = {}; for (const n of names) u[n] = gl.getUniformLocation(pr, n);
      return { pr, u };
    };
    this.main = prog(FS, ['uRes', 'uCss', 'uDpr', 'uT', 'uSkyXf', 'uMix', 'uSA', 'uBA', 'uFA', 'uSB', 'uBB', 'uFB', 'uMask', 'uNoise', 'uW', 'uWR', 'uS', 'uSR',
      'uSel', 'uSelA', 'uRain', 'uStreak', 'uFog', 'uFrost', 'uWarm', 'uSun', 'uScale', 'uOn', 'uFrame', 'uChip']);
    this.maskP = prog(MASK_FS, ['uPrev', 'uMRes', 'uCss', 'uSeg', 'uBrush', 'uOn', 'uDecay']);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(this.main.pr);
    ['uSA', 'uBA', 'uFA', 'uSB', 'uBB', 'uFB', 'uMask', 'uNoise'].forEach((n, i) => gl.uniform1i(this.main.u[n], i));
    this.noise = this._tex(256, 256, noiseData(256), gl.REPEAT, gl.LINEAR);
    this.mask = [null, null]; this.fbo = [null, null]; this.mi = 0;
    return true;
  }

  _tex(w, h, data, wrap, filter) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }

  _imgTex(img, mip) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    if (mip) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  // skies: { name: { sharp, blur, fog, aspect, sun: [u, v] } }
  async load(skies) {
    await Promise.all(Object.entries(skies).map(async ([name, s]) => {
      const [a, b, c] = await Promise.all([loadImg(s.sharp), loadImg(s.blur), loadImg(s.fog)]);
      if (!this.gl) return;
      this.skies[name] = { S: this._imgTex(a, true), B: this._imgTex(b, false), F: this._imgTex(c, false), aspect: a.naturalWidth / a.naturalHeight, sun: s.sun, focus: s.focus || [0.5, 0.5] };
    }));
  }

  // upload + mip every sky now, so the first cross-fade to a new condition does not stall a frame
  warm() {
    const gl = this.gl; if (!gl) return;
    gl.useProgram(this.main.pr); gl.viewport(0, 0, 1, 1);
    for (const k of Object.keys(this.skies)) {
      const A = this.skies[k];
      [A.S, A.B, A.F, A.S, A.B, A.F].forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
      gl.uniform1f(this.main.u.uMix, 0.5); gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  }

  setSky(name, { instant = false } = {}) {
    if (!this.skies[name]) return;
    if (instant || !this.from || this.reduced) { this.from = name; this.to = null; this.mix = 0; this.dirty = true; this._kick(); return; }
    if (name === (this.to || this.from)) return;
    if (this.to) { // a fade is already running: settle it where it is, then fade from the nearer photo
      if (this.mix > 0.5) this.from = this.to;
      this.mix = 0;
    }
    if (name === this.from) { this.to = null; this.mix = 0; this.dirty = true; this._kick(); return; }
    this.to = name; this.mix = 0; this._kick();
  }

  set(params, instant = false) {
    Object.assign(this.target, params);
    if (instant || this.reduced) Object.assign(this.p, params);
    this.dirty = true; this._kick();
  }

  resize() {
    const gl = this.gl; if (!gl) return;
    const w = innerWidth, h = innerHeight, dpr = window.devicePixelRatio || 1;
    let s = Math.min(dpr, 2);
    const cap = 2.0e6; if (w * h * s * s > cap) s = Math.sqrt(cap / (w * h));
    // the governor may have lowered the resolution on a GPU that cannot keep up
    s = Math.max(1, s * (this.quality || 1));
    const W = Math.round(w * s), Hh = Math.round(h * s);
    this.cssW = w; this.cssH = h; this.scale = s;
    if (this.canvas.width !== W || this.canvas.height !== Hh) { this.canvas.width = W; this.canvas.height = Hh; }
    // wipe mask: a quarter of css px
    const mw = Math.max(8, Math.ceil(w / 4)), mh = Math.max(8, Math.ceil(h / 4));
    if (mw !== this.mw || mh !== this.mh) {
      this.mw = mw; this.mh = mh;
      for (let i = 0; i < 2; i++) {
        if (this.mask[i]) { gl.deleteTexture(this.mask[i]); gl.deleteFramebuffer(this.fbo[i]); }
        this.mask[i] = this._tex(mw, mh, null, gl.CLAMP_TO_EDGE, gl.LINEAR);
        this.fbo[i] = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.mask[i], 0);
        gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    this.dirty = true; this._kick();
  }

  // pointer wipe, css px (viewport)
  wipe(x, y, { brush = 40, fresh = false } = {}) {
    const last = this.lastWipe;
    this.seg = this.seg || [];
    this.seg.push([fresh || !last ? x : last[0], fresh || !last ? y : last[1], x, y, brush]);
    this.lastWipe = [x, y];
    this.maskUntil = performance.now() + 9000; this.lastInput = performance.now();
    this.wiped = (this.wiped || 0) + 1;
    this._kick();
  }
  endWipe() { this.lastWipe = null; }
  clearMask() {
    const gl = this.gl; if (!gl || !this.fbo[0]) return;
    for (const f of this.fbo) { gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); this.dirty = true; this._kick();
  }
  setParallax(nx, ny) { this.parallax.tx = nx * 9; this.parallax.ty = ny * 6; this.lastInput = performance.now(); this._kick(); }

  start() { this.started = true; this._kick(); }
  setVisible(v) { this.visible = v; if (v) { this.last = performance.now(); this._kick(); } }
  setReduced(r) { this.reduced = r; if (r) { Object.assign(this.p, this.target); if (this.to) { this.from = this.to; this.to = null; this.mix = 0; } } this.dirty = true; this._kick(); }

  _kick() { if (!this.running && this.started && this.visible && this.gl) { this.running = true; this.last = performance.now(); requestAnimationFrame(this._tick); } }

  _tick(now) {
    if (!this.visible || !this.gl) { this.running = false; return; }
    const raw = now - this.last;
    const dt = clamp(raw / 1000, 0, 1 / 20); this.last = now;
    this._govern(raw);
    if (!this.reduced) this.t += dt;
    let moving = !this.reduced;
    let busy = this.dirty || !!this.seg || this.forceFrames > 0 || this.rectsMoving || now - (this.lastInput || 0) < 500;
    // parameter easing (each has its own feel: rain lands slowly, drops dry slower still, fog breathes in)
    const ease = (k, tc) => { const d = this.target[k] - this.p[k]; if (Math.abs(d) < 1e-4) { this.p[k] = this.target[k]; return; } this.p[k] += d * (1 - Math.exp(-dt / tc)); moving = busy = true; };
    ease('rain', this.target.rain > this.p.rain ? 1.1 : 1.6); ease('streak', 0.8); ease('fog', this.target.fog > this.p.fog ? 1.0 : 0.7);
    ease('frost', 0.6); ease('warm', 0.9); ease('sun', 0.9);
    if (this.to) {
      this.mix = Math.min(1, this.mix + dt / 1.5); moving = busy = true;
      if (this.mix >= 1) { this.from = this.to; this.to = null; this.mix = 0; }
    }
    const P = this.parallax;
    if (Math.abs(P.tx - P.x) + Math.abs(P.ty - P.y) > 0.01) { const k = 1 - Math.exp(-dt / 0.5); P.x += (P.tx - P.x) * k; P.y += (P.ty - P.y) * k; moving = busy = true; }
    const maskActive = now < this.maskUntil;
    // ambient only (drops running, fog creeping back, nobody touching anything): the canvas updates every other
    // display frame, which halves the GPU work on 120 Hz screens; input, fades and glides always get every frame
    const ambient = !busy && !this.reduced;
    this._odd = ambient ? !this._odd : false;
    this._acc = (this._acc || 0) + dt;
    if ((moving || maskActive || busy) && !this._odd) {
      if (this.forceFrames > 0) this.forceFrames--;
      this._draw(now, this._acc, maskActive);
      this._acc = 0;
      this.dirty = false;
    }
    if (moving || maskActive || this.seg || this.forceFrames > 0 || this.rectsMoving) requestAnimationFrame(this._tick);
    else this.running = false;
  }

  // resolution governor: if most frames miss a 40 Hz budget while the loop runs continuously, render the
  // canvas at fewer pixels (text is DOM, so it stays sharp). Never below 1 device px per css px.
  _govern(ms) {
    if (this.reduced || !this.started) return;
    const g = this.gov || (this.gov = { n: 0, slow: 0, cool: performance.now() + 3000 });
    g.n++; if (ms > 24) g.slow++;
    // only a GPU that is slow most of the time (not a busy moment): 2/3 of 3 s of frames, at most twice per visit
    if (g.n >= 180) {
      if (g.slow > 120 && performance.now() > g.cool && this.scale > 1.01 && (g.steps || 0) < 2) {
        this.quality = (this.quality || 1) * 0.8; g.steps = (g.steps || 0) + 1; g.cool = performance.now() + 6000; this.resize();
      }
      g.n = 0; g.slow = 0;
    }
  }

  // the app can ask for frames while its own DOM is animating (strip expand, lens glide)
  keepAlive(frames = 2) { this.forceFrames = Math.max(this.forceFrames || 0, frames); this._kick(); }

  _maskPass(dt, active) {
    const gl = this.gl, M = this.maskP;
    const segs = this.seg || [];
    this.seg = null;
    // fog creeps back: ~1/9 per second (held clear for the first ~3 s by the shader's threshold)
    this.decayAcc += active ? dt * 0.105 : 0;
    let decay = 0;
    if (this.decayAcc >= 2 / 255) { decay = Math.floor(this.decayAcc * 255) / 255; this.decayAcc -= decay; }
    if (!segs.length && !decay) return;
    gl.useProgram(M.pr);
    gl.viewport(0, 0, this.mw, this.mh);
    gl.uniform2f(M.u.uMRes, this.mw, this.mh); gl.uniform2f(M.u.uCss, this.cssW, this.cssH);
    gl.uniform1i(M.u.uPrev, 0);
    const passes = segs.length ? segs : [[0, 0, 0, 0, 1]];
    passes.forEach((s, i) => {
      const src = this.mi, dst = 1 - this.mi;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[dst]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.mask[src]);
      gl.uniform4f(M.u.uSeg, s[0], s[1], s[2], s[3]); gl.uniform1f(M.u.uBrush, s[4]);
      gl.uniform1f(M.u.uOn, segs.length ? 1 : 0); gl.uniform1f(M.u.uDecay, i === 0 ? decay : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.mi = dst;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.main.pr);
  }

  _draw(now, dt, maskActive) {
    const gl = this.gl;
    if (!this.from || !this.skies[this.from]) return;
    if (this.mask[0]) this._maskPass(dt, maskActive);
    const r = this.getRects ? this.getRects() : null;
    const u = this.main.u;
    gl.useProgram(this.main.pr);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const A = this.skies[this.from], B = this.to ? this.skies[this.to] : A;
    const tex = [A.S, A.B, A.F, B.S, B.B, B.F, this.mask[this.mi], this.noise];
    tex.forEach((t, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t); });
    const W = this.cssW, Hc = this.cssH;
    // cover-fit with a slow drift (zoom breathing) and pointer parallax
    const z = this.reduced ? 1.03 : 1.035 + 0.012 * Math.sin(this.t * 2 * Math.PI / 52);
    const asp = A.aspect;
    let dw = Math.max(W, Hc * asp) * z, dh = dw / asp;
    if (dh < Hc * z) { dh = Hc * z; dw = dh * asp; }
    const f = W / Hc < 0.9 ? [0.23, 0.5] : A.focus;   // portrait: keep the low sun in frame, lower left
    const ox = (W - dw) * f[0] + this.parallax.x, oy = (Hc - dh) * f[1] + this.parallax.y;
    gl.uniform4f(u.uSkyXf, 1 / dw, 1 / dh, -ox / dw, -oy / dh);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height); gl.uniform2f(u.uCss, W, Hc);
    gl.uniform1f(u.uDpr, this.scale);
    gl.uniform1f(u.uT, this.t + this.clockOffset);
    gl.uniform1f(u.uMix, this.to ? this.mix * this.mix * (3 - 2 * this.mix) : 0);
    const p = this.p;
    gl.uniform1f(u.uRain, p.rain); gl.uniform1f(u.uStreak, this.reduced ? 0 : p.streak); gl.uniform1f(u.uFog, p.fog);
    gl.uniform1f(u.uFrost, p.frost); gl.uniform1f(u.uWarm, p.warm);
    const sun = A.sun; const sx = ox + sun[0] * dw, sy = oy + sun[1] * dh;
    gl.uniform3f(u.uSun, sx, sy, p.sun);
    gl.uniform1f(u.uFrame, this.frames);
    if (r && r.w) {
      gl.uniform1f(u.uOn, 1);
      gl.uniform4f(u.uW, r.w.x, r.w.y, r.w.w, r.w.h); gl.uniform1f(u.uWR, r.wr);
      gl.uniform4f(u.uS, r.s.x, r.s.y, r.s.w, r.s.h); gl.uniform1f(u.uSR, r.sr);
      gl.uniform4f(u.uSel, r.sel.x, r.sel.y, r.sel.w, r.sel.h); gl.uniform1f(u.uSelA, r.selA);
      gl.uniform1f(u.uScale, r.scale || 1);
      const ch = new Float32Array(12); (r.chips || []).slice(0, 3).forEach((c, i) => ch.set([c.x, c.y, c.w, c.h], i * 4));
      gl.uniform4fv(u.uChip, ch);
    } else gl.uniform1f(u.uOn, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.frames++;
    if (this.frames === 2 && this.onFirstFrame) this.onFirstFrame();
  }

  state() { return { from: this.from, to: this.to, mix: this.mix, p: { ...this.p }, target: { ...this.target }, running: this.running, frames: this.frames, t: this.t, quality: this.quality || 1, wiped: this.wiped || 0, scale: this.scale }; }

  // read back the wipe mask (tests): fraction of mask texels over 0.5 inside a css rect
  maskCoverage(rect) {
    const gl = this.gl; if (!gl) return 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[this.mi]);
    const px = new Uint8Array(this.mw * this.mh * 4);
    gl.readPixels(0, 0, this.mw, this.mh, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    let n = 0, on = 0;
    const x0 = Math.floor(rect.x / 4), x1 = Math.ceil((rect.x + rect.w) / 4), y0 = Math.floor(rect.y / 4), y1 = Math.ceil((rect.y + rect.h) / 4);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const gy = this.mh - 1 - y; if (gy < 0 || gy >= this.mh || x < 0 || x >= this.mw) continue;
      n++; if (px[(gy * this.mw + x) * 4] > 127) on++;
    }
    return n ? on / n : 0;
  }
}
