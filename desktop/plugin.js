// desktop-src/sdk.js
import * as sdk from "@hermes/plugin-sdk";

// desktop-src/plugin.jsx
import { useEffect as useEffect4 } from "react";

// desktop-src/pointer.js
var POINTER_MODES = [
  { id: "lens", label: "Lens", index: 0, note: "the scene bends around the pointer like glass" },
  { id: "ripples", label: "Ripples", index: 1, note: "a wake follows the pointer and clicks send out rings" },
  { id: "well", label: "Gravity well", index: 2, note: "the scene is drawn in and swirls toward the pointer" },
  { id: "repel", label: "Repel", index: 3, note: "the pointer pushes the scene aside and clicks send out a shock" },
  { id: "wind", label: "Wind", index: 4, note: "moving the pointer blows the scene along" }
];
var POINTER_CHOICES = [
  { id: "auto", label: "Auto" },
  ...POINTER_MODES.map(({ id, label }) => ({ id, label })),
  { id: "off", label: "Off" }
];
var AUTO = {
  blackhole: "well",
  moonsea: "ripples",
  aurora: "ripples",
  tides: "ripples",
  sakura: "repel",
  embers: "repel",
  rain: "repel",
  starfield: "repel",
  wings: "wind",
  temple: "wind",
  clouds: "wind",
  dunes: "wind",
  streaks: "wind"
};
function autoMode(engine) {
  return AUTO[engine] || "lens";
}
function pointerChoice(settings) {
  if (!settings || settings.pointer === false || settings.pointerMode === "off") return "off";
  return POINTER_CHOICES.some((c) => c.id === settings.pointerMode) ? settings.pointerMode : "auto";
}
function modeIndex(settings, engine) {
  const choice = pointerChoice(settings);
  if (choice === "off") return -1;
  const id = choice === "auto" ? autoMode(engine) : choice;
  const mode = POINTER_MODES.find((m) => m.id === id) || POINTER_MODES[0];
  return mode.index;
}
var CLICK_SLOTS = 4;
var CLICK_LIFE = 2.4;

// desktop-src/shader.js
var VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;
var COMMON = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_c0, u_c1, u_c2, u_c3, u_c4;
uniform float u_n;
uniform float u_scale, u_intensity, u_density, u_seed;
uniform vec2 u_dir;
uniform float u_cell, u_levels, u_pattern;
uniform sampler2D u_glyphs;
uniform float u_glyphCount;
uniform sampler2D u_tex;
uniform float u_invert;
uniform vec3 u_pointer;
uniform float u_pmode;
uniform vec2 u_pvel;
uniform vec3 u_click0, u_click1, u_click2, u_click3;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = r * p * 2.02 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

// Twinkling point stars in a cell grid; shared by every sky.
float stars(vec2 p, float cells, float t, float seed, float density) {
  vec2 g = p * cells;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash(id + seed);
  float alive = step(h, density);
  vec2 o = (vec2(hash(id + seed + 3.1), hash(id + seed + 7.7)) - 0.5) * 0.7;
  float d = length(f - o);
  float tw = 0.55 + 0.45 * sin(t * (0.8 + 2.4 * h) + h * 40.0);
  float size = 0.05 + 0.09 * hash(id + seed + 1.3);
  return alive * tw * (smoothstep(size, 0.0, d) + 0.3 * smoothstep(size * 3.5, 0.0, d));
}

// A 1D ridgeline (mountain silhouettes): ridged fbm, sharp peaks and soft valleys.
float ridge(float x, float seed) {
  float h = 0.0;
  float a = 0.5;
  float f = 1.0;
  for (int i = 0; i < 6; i++) {
    float n = 1.0 - abs(noise(vec2(x * f, seed + float(i) * 7.3)) * 2.0 - 1.0);
    h += a * n * n;
    f *= 2.07;
    a *= 0.48;
  }
  return h;
}

float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0) * (u_n - 1.0);
  vec3 c = mix(u_c0, u_c1, clamp(t, 0.0, 1.0));
  c = mix(c, u_c2, clamp(t - 1.0, 0.0, 1.0));
  c = mix(c, u_c3, clamp(t - 2.0, 0.0, 1.0));
  c = mix(c, u_c4, clamp(t - 3.0, 0.0, 1.0));
  return c;
}

float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
float bayer2s(vec2 a) { return bayer2(a); }
float ign(vec2 a) { return fract(52.9829189 * fract(dot(a, vec2(0.06711056, 0.00583715)))); }
`;
var ENGINE_SRC = {
  radiance: `
float engine(vec2 p, float t) {
  vec2 c = vec2(0.3, 0.03);
  vec2 d = p - c;
  float r = length(d);
  float a = atan(d.y, d.x) + t * 0.012;
  float r0 = 0.165;
  float n = 200.0;
  float k = a / 6.28318 * n;
  float id = floor(k);
  float f = abs(fract(k) - 0.5);
  float h = hash(vec2(id, 3.7));
  float len = 0.18 + 0.62 * pow(hash(vec2(id, 9.1)), 1.4);
  float line = 1.0 - smoothstep(0.06 + 0.06 * h, 0.16 + 0.06 * h, f);
  float reach = smoothstep(r0 + 0.004, r0 + 0.02, r) * (1.0 - smoothstep(r0 + len * 0.75, r0 + len, r));
  float sheaf = 0.45 + 0.9 * smoothstep(0.5, 0.95, noise(vec2(a * 2.6, 1.7)));
  float shimmer = 0.65 + 0.35 * sin(t * (0.5 + h) + h * 30.0);
  float rays = line * reach * sheaf * shimmer * (0.5 + 0.5 * h);
  float disc = 1.0 - smoothstep(r0 - 0.003, r0, r);
  float hatch = smoothstep(0.35, 0.85, 0.5 + 0.5 * sin((p.y + 0.02 * fbm(d * 9.0)) * 540.0));
  float engraving = disc * (0.18 + 0.42 * hatch * smoothstep(0.25, 0.75, fbm(d * 10.0 + t * 0.03)));
  float ring = exp(-abs(r - r0) * 300.0);
  float dots = exp(-abs(r - r0 - 0.03) * 420.0) * step(0.55, fract(a * 72.0 / 6.28318));
  float field = 0.07 * fbm(p * 2.5 + t * 0.015) + 0.14 * exp(-r * 4.5);
  return clamp(field + rays + engraving + ring * 0.85 + dots * 0.5, 0.0, 1.0);
}`,
  temple: `
float tBox(vec2 p, vec2 c, vec2 b) {
  vec2 d = abs(p - c) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// One cell of a Greek key: c runs 0..1 along the band and 0..1 across it; distance to the stroke.
float tKey(vec2 c) {
  float d = segDist(c, vec2(0.0, 0.0), vec2(1.0, 0.0));
  d = min(d, segDist(c, vec2(0.0, 0.0), vec2(0.0, 1.0)));
  d = min(d, segDist(c, vec2(0.0, 1.0), vec2(0.75, 1.0)));
  d = min(d, segDist(c, vec2(0.75, 1.0), vec2(0.75, 0.25)));
  d = min(d, segDist(c, vec2(0.75, 0.25), vec2(0.25, 0.25)));
  d = min(d, segDist(c, vec2(0.25, 0.25), vec2(0.25, 0.75)));
  return min(d, segDist(c, vec2(0.25, 0.75), vec2(0.5, 0.75)));
}

// Backlit marble, engraved: dark stone in fine diagonal hatching, flutes, and a bright rim where the
// light wraps the edge. x runs -1..1 across the drum.
float tFluted(float x, vec2 p) {
  float f = fract((x * 0.5 + 0.5) * 5.0);
  float flute = 1.0 - smoothstep(0.0, 0.16, min(f, 1.0 - f));
  float hatch = smoothstep(0.7, 1.0, 0.5 + 0.5 * sin((p.x + p.y) * 640.0));
  return 0.07 + 0.16 * flute + 0.1 * hatch + 0.62 * smoothstep(0.66, 0.97, abs(x));
}

// A column drum adrift: centre c, half size b, tilted by ang. Returns (distance, value).
vec2 tDrum(vec2 p, vec2 c, vec2 b, float ang) {
  vec2 q = p - c;
  float s = sin(ang);
  float k = cos(ang);
  q = vec2(k * q.x + s * q.y, -s * q.x + k * q.y);
  vec2 dd = abs(q) - b;
  float sd = length(max(dd, 0.0)) + min(max(dd.x, dd.y), 0.0);
  float val = tFluted(q.x / b.x, q) + 0.5 * exp(-abs(abs(q.y) - b.y) * 600.0);
  return vec2(sd, val);
}

// A white feather adrift: shaft, a vane in fine engraved barbs, a curved tip. Returns (coverage, value).
vec2 tFeather(vec2 p, vec2 c, float ang, float L, float px) {
  vec2 q = p - c;
  float s = sin(ang);
  float k = cos(ang);
  q = vec2(k * q.x + s * q.y, -s * q.x + k * q.y);
  float y = q.y / L;
  float x = q.x + 0.1 * L * (4.0 * y * y - 1.0);
  float w = 0.17 * L * sqrt(max(1.0 - 4.0 * y * y, 0.0)) * (0.75 + 0.35 * (y + 0.5));
  float vane = (1.0 - smoothstep(-px, px, abs(x) - w)) * step(-0.42, y);
  float shaft = (1.0 - smoothstep(0.0012, 0.0012 + px, abs(x))) * step(-0.62, y) * step(y, 0.48);
  float barbs = smoothstep(0.35, 0.8, 0.5 + 0.5 * sin((abs(x) * 0.7 - q.y) * 900.0));
  float edge = exp(-abs(abs(x) - w) * 900.0) * vane;
  float cov = max(vane, shaft);
  return vec2(cov, min(0.42 + 0.3 * barbs * vane + 0.3 * edge + 0.35 * shaft, 0.74));
}

// The top of a bank of cumulus: the highest of a row of round puffs.
float tPuffs(float x, float base, float w, float seed) {
  float top = base - 1.0;
  float cell = floor(x / w);
  for (int i = -2; i <= 2; i++) {
    float ci = cell + float(i);
    float cx = (ci + 0.5 + 0.35 * (hash(vec2(ci, seed)) - 0.5)) * w;
    float rr = w * (0.6 + 0.9 * hash(vec2(ci, seed + 1.7)));
    float dx = x - cx;
    top = max(top, base + 0.25 * rr * hash(vec2(ci, seed + 4.1)) + 0.62 * sqrt(max(rr * rr - dx * dx, 0.0)));
  }
  return top;
}

// Inside a cloud: a silver lining at its top edge where the sun is behind, engraved lines below it.
float tCloud(vec2 p, float top, float lit, float t) {
  float dIn = max(top - p.y, 0.0);
  float body = (0.45 + 0.55 * fbm(vec2(p.x * 5.0 + t * 0.01, p.y * 9.0))) * exp(-dIn * 7.0) * lit;
  float lines = smoothstep(1.0 - body, 1.12 - body, 0.5 + 0.5 * sin(p.y * 560.0 + 2.0 * body));
  return 0.1 + 0.42 * lines * body + 0.12 * body + 0.65 * lit * exp(-dIn * 240.0);
}

float engine(vec2 p, float t) {
  float px = 1.2 / u_res.y;
  vec2 T = vec2(0.3, -0.02);
  vec2 S = T + vec2(0.0, 0.1);
  float R = 0.2;
  vec2 d = p - S;
  float r = length(d);
  float a = atan(d.y, d.x);
  float lit = 0.3 + 0.7 * exp(-abs(p.x - S.x) * 2.5);

  // Sky: Nous blue deepening upward, a soft glow around the sun, engraved horizontal hatching, a few stars.
  float v = 0.1 + 0.1 * smoothstep(0.5, -0.25, p.y) + 0.22 * exp(-r * 3.2) + 0.05 * fbm(p * 2.0 + vec2(t * 0.01, 0.0));
  v += 0.035 * smoothstep(0.6, 1.0, 0.5 + 0.5 * sin(p.y * 420.0 + 2.0 * fbm(p * 3.0)));
  v += 0.5 * stars(p + vec2(t * 0.002, 0.0), 26.0, t, 11.0, 0.12) * smoothstep(0.05, 0.4, p.y);

  // Engraved rays fanning out behind everything; they stay white, the gold is the sun's alone.
  float k = (a + t * 0.01) / 6.28318 * 180.0;
  float id = floor(k);
  float h = hash(vec2(id, 3.7));
  float len = 0.15 + 0.75 * pow(hash(vec2(id, 9.1)), 1.3);
  float line = 1.0 - smoothstep(0.05 + 0.05 * h, 0.14 + 0.06 * h, abs(fract(k) - 0.5));
  float r0 = R + 0.06;
  float reach = smoothstep(r0, r0 + 0.02, r) * (1.0 - smoothstep(r0 + len * 0.7, r0 + len, r));
  float sheaf = 0.4 + 0.9 * smoothstep(0.45, 0.95, noise(vec2(a * 2.6, 1.7 + t * 0.02)));
  float shimmer = 0.6 + 0.4 * sin(t * (0.4 + h) + h * 30.0);
  v = min(v + 0.75 * line * reach * sheaf * shimmer * (0.45 + 0.55 * h), 0.74);

  // An astrolabe circle with fine ticks, two small bodies on slow orbits.
  float rO = R + 0.19;
  float ticks = (1.0 - smoothstep(0.04, 0.08, abs(fract(a / 6.28318 * 72.0) - 0.5) * 2.0 - 0.9)) * step(rO, r) * step(r, rO + 0.01);
  v = max(v, 0.38 * exp(-abs(r - rO) * 1400.0) + 0.3 * ticks);
  for (int m = 0; m < 2; m++) {
    float am = t * (0.03 + 0.015 * float(m)) + float(m) * 2.6;
    vec2 body = S + vec2(cos(am), sin(am)) * (rO + 0.005);
    v = max(v, 0.75 * (1.0 - smoothstep(0.004, 0.006, length(p - body))));
  }

  // A Greek key ring turning slowly around the sun, between two fine circles.
  float r1 = R + 0.016;
  float r2 = R + 0.05;
  float band = step(r1, r) * step(r, r2);
  float u = (a / 6.28318 + 0.5) * 44.0 + t * 0.03;
  float key = 1.0 - smoothstep(0.06, 0.1, tKey(vec2(fract(u), (r - r1) / (r2 - r1) * 1.3 - 0.15)));
  v = mix(v, 0.2 + 0.55 * key, band);
  v += 0.5 * (exp(-abs(r - r1 + 0.004) * 900.0) + exp(-abs(r - r2 - 0.004) * 900.0));

  // The sun: an engraved disc with a hot gold core and a bright rim.
  float hatch = smoothstep(0.3, 0.8, 0.5 + 0.5 * sin((d.y + 0.015 * fbm(d * 8.0 + t * 0.02)) * 380.0));
  float sun = 0.5 + 0.25 * hatch + 0.45 * exp(-r / R * 2.2);
  v = mix(v, sun, 1.0 - smoothstep(R - px, R, r));
  v += 0.6 * exp(-abs(r - R) * 400.0);

  // The far bank of cloud, behind the temple.
  float topB = tPuffs(p.x + t * 0.004, -0.19, 0.045, 3.0);
  v = mix(v, tCloud(p, topB, lit, t), smoothstep(topB + px, topB - px, p.y));

  // The temple, backlit: three steps, six columns (one broken), its roof floating free above them.
  vec2 q = p - T;
  float cov = 0.0;
  float stone = 0.0;
  for (int s = 0; s < 3; s++) {
    float fs = float(s);
    float top = -0.13 - 0.016 * fs;
    float c = 1.0 - smoothstep(-px, px, tBox(q, vec2(0.0, top - 0.008), vec2(0.235 + 0.016 * fs, 0.008)));
    stone = mix(stone, 0.08 + 0.1 * smoothstep(0.7, 1.0, 0.5 + 0.5 * sin((q.x + q.y) * 640.0)) + 0.55 * exp(-abs(q.y - top) * 900.0), c);
    cov = max(cov, c);
  }
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float cx = -0.19 + fi * 0.076;
    float broken = step(3.5, fi) * step(fi, 4.5);
    float top = mix(0.06, -0.02 + 0.016 * noise(vec2(q.x * 90.0, fi)), broken);
    float hw = 0.0165 - 0.0025 * clamp((q.y + 0.13) / 0.19, 0.0, 1.0);
    float c = 1.0 - smoothstep(-px, px, max(abs(q.x - cx) - hw, max(-0.13 - q.y, q.y - top)));
    stone = mix(stone, tFluted((q.x - cx) / hw, q), c);
    cov = max(cov, c);
    float cap = min(tBox(q, vec2(cx, 0.065), vec2(0.021, 0.005)), tBox(q, vec2(cx, 0.074), vec2(0.026, 0.004)));
    c = (1.0 - smoothstep(-px, px, cap)) * (1.0 - broken);
    stone = mix(stone, 0.08 + 0.5 * exp(-abs(q.y - 0.078) * 900.0) + 0.35 * exp(-abs(q.y - 0.07) * 900.0), c);
    cov = max(cov, c);
  }
  // The broken column's upper drums drift up into the light.
  for (int j = 0; j < 3; j++) {
    float fj = float(j);
    vec2 dr = tDrum(q, vec2(0.114 + 0.006 * sin(t * 0.2 + fj * 2.4), 0.014 + 0.042 * fj + 0.006 * sin(t * 0.5 + fj * 2.0)),
                    vec2(0.0145, 0.016), 0.14 * sin(t * 0.3 + fj * 1.7) + 0.1 * (fj - 1.0));
    float c = 1.0 - smoothstep(-px, px, dr.x);
    stone = mix(stone, dr.y, c);
    cov = max(cov, c);
  }
  // Entablature and pediment, lifted on the light.
  float L = 0.034 + 0.006 * sin(t * 0.4);
  float yA = 0.078 + L;
  float c = 1.0 - smoothstep(-px, px, tBox(q, vec2(0.0, yA + 0.011), vec2(0.225, 0.011)));
  stone = mix(stone, 0.08 + 0.5 * exp(-abs(q.y - yA) * 900.0) + 0.4 * exp(-abs(q.y - yA - 0.022) * 900.0) + 0.2 * exp(-abs(q.y - yA - 0.011) * 900.0), c);
  cov = max(cov, c);
  float yF = yA + 0.022;
  c = 1.0 - smoothstep(-px, px, tBox(q, vec2(0.0, yF + 0.013), vec2(0.225, 0.013)));
  float fkey = 1.0 - smoothstep(0.07, 0.11, tKey(vec2(fract(q.x / 0.026 + 0.5), (q.y - yF) / 0.026 * 1.3 - 0.15)));
  stone = mix(stone, 0.09 + 0.5 * fkey, c);
  cov = max(cov, c);
  float yC = yF + 0.026;
  c = 1.0 - smoothstep(-px, px, tBox(q, vec2(0.0, yC + 0.005), vec2(0.24, 0.005)));
  float dentils = step(0.5, fract(q.x * 110.0)) * step(q.y, yC + 0.004);
  stone = mix(stone, 0.1 + 0.2 * dentils + 0.55 * exp(-abs(q.y - yC - 0.01) * 900.0), c);
  cov = max(cov, c);
  float yP = yC + 0.01;
  float ped = min(q.y - yP, yP + 0.07 * (1.0 - abs(q.x) / 0.24) - q.y);
  c = smoothstep(-px, px, ped);
  float inner = min(q.y - yP - 0.007, yP + 0.07 * (1.0 - abs(q.x) / 0.24) - 0.011 - q.y);
  float emblem = length(q - vec2(0.0, yP + 0.024));
  float pedVal = 0.08 + 0.1 * smoothstep(0.7, 1.0, 0.5 + 0.5 * sin((q.x + q.y) * 640.0)) + 0.5 * exp(-abs(inner) * 800.0)
    + 0.6 * (1.0 - smoothstep(0.007, 0.0085, emblem)) + 0.4 * exp(-abs(emblem - 0.012) * 1600.0);
  stone = mix(stone, pedVal, c);
  cov = max(cov, c);
  v = mix(v, stone, cov);
  v += 0.1 * exp(-r * 4.0);

  // Feathers drifting down past the temple, swaying as they fall.
  for (int f = 0; f < 5; f++) {
    float ff = float(f);
    float hx = hash(vec2(ff, 21.0));
    float fall = fract(hash(vec2(ff, 5.0)) - t * (0.004 + 0.003 * hx));
    vec2 fc = vec2(mix(-0.7, 0.85, fract(hx + ff * 0.37)) + 0.03 * sin(t * 0.45 + ff * 2.3), 0.52 - fall * 1.0);
    vec2 fe = tFeather(p, fc, 0.9 * sin(t * 0.35 + ff * 1.7) + 0.6 * (hx - 0.5), 0.06 + 0.035 * hash(vec2(ff, 9.0)), px);
    v = mix(v, fe.y, fe.x);
  }

  // The near bank of cloud, over the temple's lowest step, in stacked puffs.
  float drift = p.x - t * 0.007;
  float topF = tPuffs(drift, -0.255, 0.07, 9.0);
  float e1 = tPuffs(drift + 0.031, -0.32, 0.065, 13.0);
  float e2 = tPuffs(drift + 0.017, -0.39, 0.085, 17.0);
  float cf = tCloud(p, topF, lit * 0.95, t);
  cf = mix(cf, tCloud(p, e1, lit * 0.85, t), step(p.y, e1));
  cf = mix(cf, tCloud(p, e2, lit * 0.75, t), step(p.y, e2));
  v = mix(v, cf, smoothstep(topF + px, topF - px, p.y));

  // Motes rising in the glow.
  v += 0.6 * stars(p + vec2(0.0, -t * 0.015), 55.0, t * 2.0, 5.0, 0.08) * exp(-r * 3.0);
  return clamp(v, 0.0, 1.0);
}`,
  summit: `
float engine(vec2 p, float t) {
  float drift = t * 0.005;
  float v = 0.16 + 0.44 * smoothstep(0.55, -0.1, p.y);
  vec2 sp = vec2(0.42, 0.13);
  float sd = length(p - sp);
  v += 0.5 * exp(-sd * 8.0);
  v = max(v, smoothstep(0.065, 0.059, sd));
  float wisps = fbm(vec2(p.x * 1.2 + t * 0.007, p.y * 7.5 - 1.3));
  v += 0.16 * smoothstep(0.55, 0.85, wisps) * smoothstep(-0.02, 0.22, p.y);
  v += 0.55 * stars(p + vec2(drift * 0.2, 0.0), 24.0, t, 3.0, 0.3) * smoothstep(0.12, 0.45, p.y);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float base = 0.04 - fi * 0.12;
    float amp = 0.17 + fi * 0.07;
    float x = (p.x + drift * (fi + 1.0)) * (1.1 + fi * 0.45) + fi * 13.0;
    float h = base + amp * ridge(x, fi * 4.0);
    float fog = 0.12 * smoothstep(0.07, 0.0, abs(p.y - (base - 0.015))) * (0.6 + 0.4 * fbm(vec2(p.x * 3.0 - t * 0.02, fi)));
    if (p.y < h) {
      float tone = 0.44 - fi * 0.13;
      float rim = smoothstep(0.01, 0.0, h - p.y) * (0.24 - fi * 0.05) * smoothstep(-0.6, 0.5, p.x);
      v = tone + rim;
    }
    v += fog * (1.0 - fi * 0.2);
  }
  return clamp(v, 0.0, 1.0);
}`,
  clouds: `
float engine(vec2 p, float t) {
  float hz = 0.03;
  float v = 0.34 + 0.38 * smoothstep(0.55, hz, p.y);
  vec2 sp = vec2(-0.4, hz + 0.07);
  float sd = length(p - sp);
  v += 0.5 * exp(-sd * 6.0);
  v = max(v, smoothstep(0.05, 0.045, sd));
  float ang = atan(p.y - sp.y, p.x - sp.x);
  v += 0.1 * smoothstep(0.55, 1.0, noise(vec2(ang * 9.0, t * 0.04))) * exp(-sd * 1.8) * step(sp.y, p.y);
  v += 0.12 * smoothstep(0.55, 0.8, fbm(vec2(p.x * 1.4 + t * 0.008, p.y * 8.0))) * step(hz + 0.12, p.y);
  if (p.y < hz) {
    float z = 0.36 / (hz - p.y + 0.035);
    vec2 c = vec2(p.x * z * 0.9 + t * 0.025, z * 0.55 + t * 0.018);
    float dens = fbm(c * 0.85);
    float puff = smoothstep(0.38, 0.72, dens);
    float lit = clamp(dens - fbm(c * 0.85 + vec2(0.22, -0.1)), -0.3, 0.3);
    float cloud = 0.4 + 0.42 * puff + 1.5 * lit;
    float near = smoothstep(16.0, 2.0, z);
    v = mix(v, cloud, near * (0.55 + 0.45 * puff));
    v = mix(v, 0.7, smoothstep(5.0, 13.0, z) * 0.55);
  }
  return clamp(v, 0.0, 1.0);
}`,
  moonsea: `
float engine(vec2 p, float t) {
  float hz = -0.06;
  vec2 mp = vec2(0.34, 0.23);
  float md = length(p - mp);
  if (p.y > hz) {
    float v = 0.05 + 0.16 * smoothstep(0.5, hz, p.y);
    v += 0.7 * stars(p, 32.0, t, 2.0, 0.4) * (1.0 - exp(-md * 5.0));
    v += 0.32 * exp(-md * 7.0);
    float disc = smoothstep(0.07, 0.066, md);
    float maria = fbm((p - mp) * 26.0);
    v = mix(v, 0.86 + 0.14 * smoothstep(0.35, 0.65, maria) - 0.14 * smoothstep(0.58, 0.78, maria), disc);
    v += 0.1 * smoothstep(0.55, 0.8, fbm(vec2(p.x * 2.0 - t * 0.01, p.y * 9.0))) * exp(-md * 3.0);
    return clamp(v, 0.0, 1.0);
  }
  float depth = hz - p.y;
  float z = 0.22 / (depth + 0.01);
  vec2 w = vec2(p.x * z * 7.0, z * 2.6 + t * 0.32);
  float waves = noise(w) * 0.6 + noise(w * 2.3 + t * 0.2) * 0.4;
  float spread = 0.025 + depth * 0.85;
  float path = exp(-pow((p.x - mp.x) / spread, 2.0));
  float glint = smoothstep(0.64, 0.86, waves) * path;
  float sea = 0.05 + 0.1 * waves * clamp(1.0 - depth * 1.3, 0.0, 1.0) + 0.14 * exp(-depth * 28.0);
  return clamp(sea + glint + path * 0.07, 0.0, 1.0);
}`,
  dunes: `
float dune(float x, float fi) {
  float k = x * (1.4 + fi * 0.6) + fi * 3.7;
  float w = 0.5 + 0.5 * sin(k + 0.6 * sin(k * 0.5 + fi));
  return pow(w, 1.8) + 0.18 * fbm(vec2(x * 1.5, fi * 3.1));
}
float engine(vec2 p, float t) {
  float hz = -0.02;
  float v = 0.3 + 0.4 * smoothstep(0.55, hz, p.y);
  vec2 sp = vec2(0.3, hz + 0.11);
  float sd = length(p - sp);
  v += 0.45 * exp(-sd * 5.0);
  v = max(v, smoothstep(0.11, 0.104, sd));
  v += 0.08 * smoothstep(0.6, 0.85, fbm(vec2(p.x * 1.2 + t * 0.006, p.y * 9.0))) * step(hz + 0.05, p.y);
  float x = p.x + sin(p.y * 240.0 + t * 3.0) * 0.003 * smoothstep(0.07, 0.0, abs(p.y - hz));
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float xs = x + t * 0.004 * (fi + 1.0);
    float base = hz - 0.04 - fi * 0.15;
    float amp = 0.07 + fi * 0.06;
    float crest = base + amp * dune(xs, fi);
    if (p.y < crest) {
      float e = 0.004;
      float slope = (dune(xs + e, fi) - dune(xs - e, fi)) / (2.0 * e) * amp;
      float lit = smoothstep(0.25, -0.25, slope);
      float depth = clamp((crest - p.y) / (amp + 0.1), 0.0, 1.0);
      float tone = mix(0.12, 0.5, lit) - fi * 0.05 - depth * 0.08;
      float ripples = 0.035 * lit * smoothstep(0.2, 1.0, sin((p.y - crest) * 380.0 + xs * 22.0 + fbm(p * 6.0) * 4.0));
      float edge = smoothstep(0.005, 0.0, crest - p.y) * 0.22;
      float blow = smoothstep(0.03, 0.0, crest - p.y) * smoothstep(0.6, 0.9, noise(vec2(p.x * 30.0 - t * 2.0, p.y * 60.0))) * 0.2;
      v = tone + ripples + edge + blow;
    }
  }
  return clamp(v, 0.0, 1.0);
}`,
  blackhole: `
float disk(vec2 q, float t) {
  float rd = length(q);
  float a = atan(q.y, q.x);
  float inner = 0.15;
  float outer = 0.78;
  float band = smoothstep(inner, inner + 0.02, rd) * (1.0 - smoothstep(outer * 0.45, outer, rd));
  float swirl = fbm(vec2(rd * 10.0, a * 2.0 + t * 0.9 / (rd + 0.15)));
  float lanes = 0.5 + 0.5 * sin(rd * 120.0 + swirl * 7.0);
  float heat = pow(1.0 - clamp((rd - inner) / (outer - inner), 0.0, 1.0), 1.7);
  return band * (0.18 + 0.82 * heat) * (0.5 + 0.5 * swirl) * (0.7 + 0.3 * lanes);
}
float engine(vec2 p, float t) {
  vec2 c = vec2(0.3, 0.04);
  vec2 q = p - c;
  float r = length(q);
  float la = atan(q.y, q.x);
  float rs = 0.12;
  vec2 bent = q * (1.0 + rs * rs * 1.8 / max(r * r, 0.0004));
  float v = 0.03 + 0.6 * stars(bent + c, 36.0, t, 6.0, 0.3);
  // The far side of the disk, bent by gravity into a thin ring over and under the shadow.
  float ringR = 0.15 + max(r - rs * 1.12, 0.0) * 3.2;
  float ring = disk(vec2(cos(la), sin(la)) * ringR, t);
  float ringMask = smoothstep(rs * 1.07, rs * 1.13, r) * (1.0 - smoothstep(rs * 1.5, rs * 1.95, r));
  v = max(v, ring * ringMask * (0.55 + 0.45 * abs(sin(la))) * 1.3);
  v = max(v, exp(-abs(r - rs * 1.09) * 220.0));
  v *= smoothstep(rs * 0.98, rs * 1.02, r);
  // The near side of the disk crossing in front, nearly edge-on; the approaching side is brighter.
  vec2 dq = vec2(q.x, q.y / 0.15) / 1.25;
  float front = disk(dq, t) * (0.78 + 0.32 * (-dq.x / (length(dq) + 0.001)));
  float visible = q.y < 0.0 ? 1.0 : step(rs * 1.02, r);
  v = max(v, front * visible * 1.15);
  v += 0.1 * exp(-r * 5.0) * (1.0 - smoothstep(rs * 0.98, rs * 1.02, r) * 0.0);
  return clamp(v, 0.0, 1.0);
}`,
  planet: `
float engine(vec2 p, float t) {
  vec2 c = vec2(-0.12, -1.06);
  float R = 0.93;
  vec2 q = (p - c) / R;
  float d = length(q);
  vec3 L = normalize(vec3(0.72, 0.58, 0.32));
  float v = 0.03 + 0.5 * stars(p, 30.0, t, 9.0, 0.32) * smoothstep(1.0, 1.2, d);
  float side = dot(normalize(vec3(q, 0.0001)), L);
  v += exp(-(d - 1.0) * 26.0) * step(1.0, d) * (0.2 + 0.8 * smoothstep(-0.3, 0.6, side)) * 0.95;
  if (d < 1.0) {
    vec3 n = vec3(q, sqrt(1.0 - d * d));
    float rot = t * 0.01;
    vec3 s = vec3(n.x * cos(rot) + n.z * sin(rot), n.y, -n.x * sin(rot) + n.z * cos(rot));
    vec2 uv = vec2(atan(s.x, s.z), asin(s.y)) * 1.6;
    float land = smoothstep(0.48, 0.56, fbm(uv * 1.3 + 3.0));
    float cloud = smoothstep(0.5, 0.8, fbm(uv * 2.2 + vec2(t * 0.012, 0.0)));
    float light = dot(n, L);
    float day = smoothstep(-0.05, 0.25, light);
    float surface = mix(0.16, 0.3, land) + 0.45 * cloud;
    float lit = surface * (0.3 + 0.7 * max(light, 0.0)) * day;
    vec2 cell = floor(uv * 60.0);
    float city = land * step(0.82, hash(cell)) * smoothstep(0.1, -0.15, light) * (0.6 + 0.4 * sin(t + hash(cell) * 9.0));
    float rim = pow(1.0 - n.z, 3.0) * (0.35 + 0.65 * smoothstep(-0.2, 0.5, light));
    v = lit + city * 0.7 + rim * 0.6 + 0.02;
  }
  vec2 fp = c + normalize(L.xy) * R;
  float fd = length(p - fp);
  v += 0.9 * exp(-fd * 26.0) + 0.22 * exp(-fd * 5.0) + 0.12 * exp(-abs(p.y - fp.y) * 60.0) * exp(-abs(p.x - fp.x) * 2.0);
  return clamp(v, 0.0, 1.0);
}`,
  skyline: `
float engine(vec2 p, float t) {
  float street = -0.3;
  float y = p.y;
  bool mirror = y < street;
  if (mirror) y = 2.0 * street - y;
  float x = p.x + (mirror ? 0.007 * sin(p.y * 140.0 + t * 2.0) : 0.0);
  float v = 0.08 + 0.34 * smoothstep(0.5, street, y);
  vec2 mp = vec2(0.36, 0.18);
  float md = length(vec2(x, y) - mp);
  v = max(v, 0.5 * smoothstep(0.13, 0.125, md) * (0.85 + 0.15 * step(0.5, fract(y * 38.0))));
  v += 0.12 * exp(-md * 4.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float w = 0.07 + 0.035 * fi;
    float bx = (x + fi * 3.7 + t * 0.002 * (fi + 1.0)) / w;
    float bid = floor(bx);
    float fx = fract(bx);
    float h = street + 0.07 + 0.05 * (2.0 - fi) + (0.42 - fi * 0.09) * pow(hash(vec2(bid, fi)), 1.2);
    float spire = step(0.8, hash(vec2(bid, fi + 9.0))) * step(abs(fx - 0.5), 0.06) * 0.08;
    if (y < h + spire) {
      float tone = 0.2 - fi * 0.075;
      vec2 wc = vec2(fx * 4.0, (y - street) * (60.0 + fi * 18.0));
      vec2 wid = floor(wc);
      vec2 wf = fract(wc);
      float win = step(0.22, wf.x) * step(wf.x, 0.78) * step(0.28, wf.y) * step(wf.y, 0.78) * step(y, h - 0.01);
      float on = step(0.66, hash(wid + bid * 13.0 + fi));
      float warm = step(0.5, hash(wid + bid * 7.0));
      float flick = 0.9 + 0.1 * sin(t * 0.4 + hash(wid) * 40.0);
      float lit = win * on * flick * mix(0.62, 0.72, warm) * (0.75 + 0.12 * fi);
      float sign = step(0.7, hash(vec2(bid, 7.0 + fi))) * step(1.5, fi);
      float sy = street + 0.04 + 0.12 * hash(vec2(bid, 3.0));
      float tube = (1.0 - smoothstep(0.02, 0.05, abs(fx - 0.82))) * step(abs(y - sy - 0.07), 0.07);
      float pulse = 0.75 + 0.25 * step(0.25, fract(t * 0.25 + hash(vec2(bid, 1.0))));
      v = max(tone + lit, sign * tube * pulse * 0.95);
      v *= 0.55 + 0.45 * step(0.04, fx) * step(fx, 0.96);
    }
  }
  vec2 rc = vec2((p.x + p.y * 0.2) * 150.0, p.y * 5.0 + t * 7.0);
  float col = floor(rc.x);
  float drop = step(0.93, hash(vec2(col, floor(rc.y + hash(vec2(col, 2.0)) * 10.0))));
  v += drop * smoothstep(0.0, 0.7, fract(rc.y)) * step(abs(fract(rc.x) - 0.5), 0.1) * 0.14;
  if (mirror) v *= 0.55 + 0.12 * sin(p.y * 360.0 + t);
  return clamp(v, 0.0, 1.0);
}`,
  sakura: `
float petal(vec2 q, float ang) {
  float c = cos(ang);
  float s = sin(ang);
  q = mat2(c, -s, s, c) * q;
  q.x *= 1.6;
  float body = smoothstep(0.52, 0.4, length(q));
  float notch = smoothstep(0.16, 0.05, length(q - vec2(0.0, 0.5)));
  return body * (1.0 - notch);
}
float blossoms(vec2 p) {
  vec2 g = p * 52.0;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5 - (vec2(hash(id), hash(id + 1.7)) - 0.5) * 0.5;
  return smoothstep(0.44, 0.2, length(f)) * (0.55 + 0.45 * hash(id + 5.0));
}
float cluster(vec2 p, float t) {
  vec2 g = p * vec2(9.0, 7.5);
  vec2 id = floor(g);
  float best = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 n = id + vec2(float(i), float(j));
      vec2 o = vec2(hash(n), hash(n + 3.7)) + 0.06 * sin(t * 0.5 + hash(n) * 9.0);
      float r = 0.35 + 0.3 * hash(n + 8.0);
      float d = length(g - n - o) / r;
      best = max(best, smoothstep(1.0, 0.75, d) * (0.6 + 0.4 * (1.0 - d)));
    }
  }
  return best;
}
float engine(vec2 p, float t) {
  float v = 0.04 + 0.09 * smoothstep(-0.5, 0.5, p.y);
  float edge = 0.19 + 0.12 * fbm(vec2(p.x * 2.0, 1.0)) + 0.06 * sin(p.x * 2.4 + 0.7);
  float reach = smoothstep(edge - 0.06, edge + 0.08, p.y);
  float blooms = cluster(p + vec2(t * 0.003, 0.0), t) * reach;
  float flowers = blossoms(p + vec2(t * 0.003, 0.0));
  float bough = edge + 0.05 + 0.035 * sin(p.x * 5.0 + 1.3) + 0.02 * fbm(vec2(p.x * 6.0, 7.0));
  float branch = smoothstep(0.009, 0.0, abs(p.y - bough)) * smoothstep(-0.9, -0.2, -abs(p.x - 0.1));
  v = mix(v, 0.95, branch * 0.9);
  v = max(v, blooms * (0.3 + 0.55 * flowers));
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float cells = 2.6 + fl * 2.0;
    vec2 q = p * cells + vec2(t * (0.16 + fl * 0.06), t * (0.3 + fl * 0.12));
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash(id + fl * 5.0);
    float alive = step(h, 0.22 + 0.4 * u_density);
    vec2 o = (vec2(hash(id + 1.3), hash(id + 4.1)) - 0.5) * 0.4 + vec2(0.1 * sin(t * 1.1 + h * 20.0), 0.0);
    float ang = t * (0.6 + h) + h * 6.28;
    float size = 0.15 + 0.08 * hash(id + 9.0);
    float pe = petal((f - o) / size, ang) * (0.6 + 0.4 * abs(sin(ang * 1.3)));
    v = max(v, alive * pe * (0.48 + fl * 0.18));
  }
  return clamp(v, 0.0, 1.0);
}`,
  gradient: `
float engine(vec2 p, float t) {
  float a = dot(p, u_dir);
  float w = fbm(p * 0.8 + vec2(t * 0.03, -t * 0.02));
  float v = 0.5 + 0.5 * sin(a * 2.4 + w * 3.2 + t * 0.12);
  return smoothstep(0.0, 1.0, v) * 0.92 + 0.08 * w;
}`,
  nebula: `
float engine(vec2 p, float t) {
  p *= 1.7;
  vec2 q = vec2(fbm(p + vec2(0.0, t * 0.035)), fbm(p + vec2(5.2, 1.3) - t * 0.03));
  vec2 r = vec2(fbm(p + 3.4 * q + vec2(1.7, 9.2) + t * 0.045), fbm(p + 3.4 * q + vec2(8.3, 2.8) - t * 0.04));
  float f = fbm(p + 3.0 * r);
  float v = f * f * 1.6 + 0.3 * length(q) * f;
  return smoothstep(0.1, 1.15, v);
}`,
  aurora: `
float curtains(vec2 p, float t) {
  float v = 0.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float x = p.x * (0.9 + 0.25 * fi) + fi * 1.7;
    float y0 = 0.17 - 0.06 * fi + 0.09 * sin(x * 1.3 + t * 0.2 + fi) + 0.12 * (fbm(vec2(x * 0.8, t * 0.05 + fi * 3.0)) - 0.5);
    float d = p.y - y0;
    float curtain = smoothstep(-0.012, 0.0, d) * exp(-max(d, 0.0) * (3.0 + fi * 1.2));
    float rays = 0.45 + 0.55 * noise(vec2(x * 18.0 + fi * 7.0, t * 0.3));
    float edge = exp(-abs(d) * 40.0) * 0.55;
    v += (curtain * rays + edge) * (0.85 - 0.2 * fi);
  }
  return v;
}
float sky(vec2 p, float t) {
  float v = 0.05 + 0.1 * smoothstep(0.5, -0.2, p.y);
  v += 0.75 * stars(p, 28.0, t, 5.0, 0.35) * smoothstep(-0.12, 0.35, p.y);
  return v + curtains(p, t);
}
float range(float x) { return -0.1 + 0.11 * ridge(x * 1.5 + 2.0, 11.0); }
float engine(vec2 p, float t) {
  float lake = -0.13;
  if (p.y >= lake) {
    float top = range(p.x);
    if (p.y < top) return 0.04 + 0.03 * fbm(p * 7.0) + 0.16 * smoothstep(0.012, 0.0, top - p.y);
    return clamp(sky(p, t), 0.0, 1.0);
  }
  float depth = lake - p.y;
  vec2 q = vec2(p.x + 0.004 * sin(p.y * 150.0 + t * 1.4) * (0.5 + depth * 4.0), 2.0 * lake - p.y);
  float r = q.y < range(q.x) ? 0.02 : sky(q, t);
  float ripple = 0.8 + 0.2 * sin(p.y * 280.0 + t * 1.8);
  return clamp(r * 0.72 * ripple * (1.0 - depth * 0.8), 0.0, 1.0);
}`,
  tides: `
float engine(vec2 p, float t) {
  float n = mix(9.0, 30.0, u_density);
  float h = p.y + 0.09 * sin(p.x * 2.1 + t * 0.32) + 0.18 * (fbm(p * 1.2 + vec2(t * 0.035, 0.0)) - 0.5)
          + 0.04 * sin(p.x * 5.3 - t * 0.45);
  float k = h * n;
  float d = abs(fract(k) - 0.5);
  float line = 1.0 - smoothstep(0.05, 0.15, d);
  float band = 0.55 + 0.45 * sin(floor(k) * 0.8 + t * 0.18);
  float deep = 0.35 + 0.65 * smoothstep(0.55, -0.45, p.y);
  return clamp(line * band * deep + 0.1 * fbm(p * 2.0), 0.0, 1.0);
}`,
  starfield: `
float engine(vec2 p, float t) {
  float v = 0.2 * smoothstep(0.25, 0.8, fbm(p * 1.1 + t * 0.008));
  vec2 drift = u_dir * t * 0.015;
  float d = 0.18 + 0.6 * u_density;
  v += stars(p + drift, 7.0, t, 1.0, d);
  v += 0.8 * stars(p + drift * 2.0, 13.0, t, 11.0, d);
  v += 0.6 * stars(p + drift * 3.5, 22.0, t, 23.0, d);
  return clamp(v, 0.0, 1.0);
}`,
  embers: `
float engine(vec2 p, float t) {
  float glow = smoothstep(0.2, -0.62, p.y);
  float v = glow * (0.22 + 0.4 * fbm(vec2(p.x * 1.6, p.y * 1.1 - t * 0.22)));
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float cells = 6.0 + fl * 5.0;
    vec2 q = p * cells;
    q.y -= t * (0.7 + fl * 0.45);
    q.x += sin(q.y * 0.55 + fl * 2.0 + t * 0.3) * 0.35;
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash(id + fl * 17.0);
    float alive = step(h, 0.2 + u_density * 0.5);
    vec2 o = (vec2(hash(id + 3.1 + fl), hash(id + 5.3 + fl)) - 0.5) * 0.6;
    float d = length(f - o);
    float flick = 0.6 + 0.4 * sin(t * 5.0 * (h + 0.3) + h * 30.0);
    float fade = smoothstep(0.6, -0.3, p.y);
    v += alive * flick * fade * (smoothstep(0.17, 0.0, d) + 0.35 * smoothstep(0.45, 0.0, d)) * (1.0 - fl * 0.22);
  }
  return clamp(v, 0.0, 1.0);
}`,
  streaks: `
float engine(vec2 p, float t) {
  vec2 dir = u_dir;
  vec2 nrm = vec2(-dir.y, dir.x);
  vec2 q = vec2(dot(p, dir), dot(p, nrm));
  float v = 0.2 * fbm(vec2(q.x * 0.7 - t * 0.12, q.y * 3.0));
  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float rows = 12.0 + fl * 14.0;
    float row = floor(q.y * rows);
    float fy = fract(q.y * rows);
    float h = hash(vec2(row, fl * 7.0));
    float speed = (0.6 + 1.4 * h) * (1.0 + fl * 0.5);
    float x = q.x * (1.1 + fl * 0.35) - t * speed * 0.4 + h * 20.0;
    float seg = fract(x * 0.45);
    float len = 0.12 + 0.3 * hash(vec2(row, 3.0 + fl));
    float streak = smoothstep(1.0 - len, 1.0, seg) * step(seg, 0.995);
    float thick = 1.0 - smoothstep(0.08, 0.3, abs(fy - 0.5));
    float gate = step(hash(vec2(row, 9.0 + fl)), 0.25 + 0.55 * u_density);
    v += gate * streak * thick * (1.0 - fl * 0.25);
  }
  return clamp(v, 0.0, 1.0);
}`,
  wings: `
// One feather rooted at b, pointing along ang: length L, half width W. The trailing vane is wider, the
// barbs are engraved lines, the tip catches more light. Returns (coverage, value).
vec2 wFeather(vec2 p, vec2 b, float ang, float L, float W, float px) {
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 q = p - b;
  float u = dot(q, dir);
  float v = dot(q, vec2(-dir.y, dir.x)) + 0.06 * L * (u / L) * (u / L);
  float x = clamp(u / L, 0.0, 1.0);
  float w = W * sqrt(max(1.0 - x * x * x, 0.0)) * smoothstep(0.0, 0.2, x) * (v < 0.0 ? 1.0 : 0.6);
  float sd = max(abs(v) - w, max(-u, u - L));
  float cov = 1.0 - smoothstep(-px, px, sd);
  float barbs = smoothstep(0.35, 0.85, 0.5 + 0.5 * sin((abs(v) * 1.5 - u) * 560.0));
  float edge = exp(-abs(abs(v) - w) * 700.0);
  float shaft = exp(-abs(v) * 1500.0) * step(u, L * 0.96);
  return vec2(cov, (0.52 + 0.24 * barbs + 0.34 * edge + 0.25 * shaft) * (0.74 + 0.26 * x));
}

// A whole wing in its own frame (shoulder at the origin): four rows of feathers rooted along a curved
// leading edge, from the long flight feathers at the back to small coverts along the edge.
vec2 wWing(vec2 pa, float beat, float px) {
  vec2 W = vec2(0.24, 0.25);
  vec2 nrm = normalize(vec2(-W.y, W.x));
  float cov = 0.0;
  float wv = 0.0;
  for (int r = 0; r < 4; r++) {
    float fr = float(r);
    float n = r == 3 ? 14.0 : 11.0 - 1.5 * fr;
    for (int i = 0; i < 14; i++) {
      float fi = float(i);
      if (fi >= n) break;
      float k = fi / (n - 1.0);
      vec2 root = W * k * (1.0 - 0.04 * fr) + nrm * (0.05 * sin(3.14159 * k) - 0.006 * fr);
      float ang = mix(-0.95, 0.38, k) + 0.07 * beat * k;
      float len = r == 3 ? 0.07 + 0.012 * sin(fi * 2.7) : (mix(0.16, 0.46, pow(k, 0.85)) * (1.0 - 0.31 * fr) + 0.015 * sin(fi * 4.1));
      if (length(pa - root) > len + 0.04) continue;
      vec2 fe = wFeather(pa, root, ang, len, r == 3 ? 0.022 : 0.034 - 0.004 * fr, px);
      wv = mix(wv, fe.y * (0.84 + 0.05 * fr), fe.x);
      cov = max(cov, fe.x);
    }
  }
  return vec2(cov, wv);
}

float engine(vec2 p, float t) {
  float px = 1.2 / u_res.y;

  // Night sky lightening toward a horizon far below, faint stars smeared by speed.
  float v = 0.06 + 0.16 * smoothstep(0.55, -0.4, p.y) + 0.04 * fbm(p * 1.5 + vec2(t * 0.06, 0.0));
  v += 0.4 * stars(vec2(p.x * 0.35 + t * 0.02, p.y), 30.0, t, 4.0, 0.1) * smoothstep(-0.1, 0.3, p.y);

  // A floor of cloud far below, torn into long drifts by the speed, lit along its crests.
  float floorY = -0.3 + 0.025 * sin(p.x * 2.0 + t * 0.3);
  vec2 cq = vec2(p.x * 0.5 + t * 0.4, p.y * 9.0);
  float drift = fbm(cq) + 0.5 * fbm(cq * 2.3 + 4.0);
  float body = smoothstep(0.55, 0.95, drift + (floorY - p.y) * 4.0);
  float lines = smoothstep(0.5, 0.95, 0.5 + 0.5 * sin(p.y * 330.0 + drift * 7.0));
  v = mix(v, 0.12 + 0.3 * body * (0.5 + 0.5 * lines) + 0.25 * exp(-abs(drift - 0.7) * 30.0) * body, smoothstep(floorY + 0.03, floorY - 0.03, p.y));
  v += 0.22 * exp(-abs(p.y - floorY) * 50.0);

  // Wind rushing past.
  for (int l = 0; l < 2; l++) {
    float fl = float(l);
    float rows = 22.0 + fl * 18.0;
    float row = floor(p.y * rows);
    float h = hash(vec2(row, fl * 7.0 + 1.0));
    float seg = fract((p.x + t * (0.5 + 0.6 * h) * (1.0 + fl)) * (0.5 + 0.4 * h) + h * 13.0);
    float streak = smoothstep(0.0, 0.03, seg) * (1.0 - smoothstep(0.03, 0.35 + 0.3 * h, seg));
    float thick = 1.0 - smoothstep(0.05, 0.22, abs(fract(p.y * rows) - 0.5));
    v += (0.2 - 0.07 * fl) * streak * thick * step(h, 0.35 + 0.4 * u_density);
  }

  // A pair of wings beating slowly: the far one higher, smaller and dimmer, the near one in front.
  float beat = sin(t * 0.9);
  float rot = 0.09 * beat;
  mat2 R = mat2(cos(rot), -sin(rot), sin(rot), cos(rot));
  vec2 far = wWing(R * ((p - vec2(-0.06, 0.1)) / 0.8), beat, px / 0.8);
  v = mix(v, far.y * 0.5, far.x);
  vec2 near = wWing(R * (p - vec2(0.1, -0.06)), beat, px);
  v = mix(v, near.y, near.x);

  // Feathers torn loose by the wind, tumbling away behind.
  for (int f = 0; f < 6; f++) {
    float ff = float(f);
    float h = hash(vec2(ff, 3.3));
    float x = 0.75 - fract(h * 3.7 + t * (0.05 + 0.04 * h)) * 1.9;
    vec2 c = vec2(x, -0.2 + 0.55 * hash(vec2(ff, 8.1)) + 0.04 * sin(t * 0.8 + ff * 1.3));
    float ang = t * (0.6 + 0.8 * h) * (h > 0.5 ? 1.0 : -1.0) + ff;
    float len = 0.06 + 0.05 * hash(vec2(ff, 1.9));
    vec2 b = c - vec2(cos(ang), sin(ang)) * len * 0.5;
    vec2 fe = wFeather(p, b, ang, len, 0.009 + 0.006 * h, px);
    v = mix(v, fe.y, fe.x);
  }
  return clamp(v, 0.0, 1.0);
}`,
  horizon: `
float engine(vec2 p, float t) {
  float hz = -0.06;
  if (p.y < hz) {
    float z = 0.32 / (hz - p.y + 0.015);
    float x = p.x * z;
    float lx = 1.0 - smoothstep(0.0, 0.05, abs(fract(x * 1.3 + 0.5) - 0.5));
    float lz = 1.0 - smoothstep(0.0, 0.05, abs(fract(z * 0.8 - t * 0.3 + 0.5) - 0.5));
    float fog = smoothstep(19.0, 2.5, z);
    float glow = 0.4 * exp(-(hz - p.y) * 9.0);
    return clamp(max(lx, lz) * fog * 0.85 + glow + 0.05, 0.0, 1.0);
  }
  float sky = 0.08 + 0.3 * smoothstep(0.5, hz, p.y);
  vec2 sc = vec2(0.0, hz + 0.19);
  float r = length(p - sc);
  float sun = smoothstep(0.2, 0.193, r);
  float rise = clamp((p.y - hz) / 0.38, 0.0, 1.0);
  float stripe = step(0.5, fract(p.y * 26.0 + t * 0.25));
  float cut = mix(stripe, 1.0, smoothstep(0.32, 0.62, rise));
  float sunV = sun * cut * mix(0.62, 1.0, rise);
  float halo = 0.25 * exp(-r * 4.0);
  return clamp(max(sky + halo, sunV), 0.0, 1.0);
}`,
  rain: `
float engine(vec2 p, float t) {
  float cols = mix(26.0, 64.0, u_density);
  float cx = floor(p.x * cols);
  float h = hash(vec2(cx, 1.0));
  float h2 = hash(vec2(cx, 2.0));
  float speed = 0.25 + 0.6 * h;
  float y = p.y + 0.5;
  float head = fract(-t * speed * 0.22 + h2);
  float d = fract(y - head);
  float len = 0.2 + 0.45 * hash(vec2(cx, 3.0));
  float trail = 1.0 - smoothstep(0.0, len, d);
  float flick = 0.7 + 0.3 * hash(vec2(cx, floor(y * 38.0) + floor(t * 7.0)));
  float headGlow = smoothstep(0.025, 0.0, d);
  float on = step(0.12, hash(vec2(cx, 5.0)));
  return clamp((trail * 0.85 * flick + headGlow * 0.6) * on + 0.04, 0.0, 1.0);
}`,
  constellation: `
vec2 nodePos(vec2 id, float t) {
  float a = hash(id);
  float b = hash(id + 13.7);
  return id + 0.5 + 0.36 * vec2(sin(t * (0.25 + 0.35 * a) + b * 6.283), cos(t * (0.2 + 0.35 * b) + a * 6.283));
}
float engine(vec2 p, float t) {
  float cells = mix(3.5, 8.0, u_density);
  vec2 g = p * cells;
  vec2 id = floor(g);
  float v = 0.12 * smoothstep(0.3, 0.8, fbm(p * 1.4 + t * 0.015));
  vec2 pts[9];
  for (int j = 0; j < 3; j++) {
    for (int i = 0; i < 3; i++) {
      pts[j * 3 + i] = nodePos(id + vec2(float(i - 1), float(j - 1)), t);
    }
  }
  vec2 c = pts[4];
  for (int i = 0; i < 9; i++) {
    float d = length(g - pts[i]);
    float pulse = 0.75 + 0.25 * sin(t * 1.3 + hash(floor(pts[i])) * 20.0);
    v += (smoothstep(0.075, 0.0, d) * 0.95 + smoothstep(0.3, 0.0, d) * 0.12) * pulse;
    if (i != 4) {
      float L = length(pts[i] - c);
      v += (1.0 - smoothstep(0.012, 0.03, segDist(g, c, pts[i]))) * smoothstep(1.55, 0.55, L) * 0.55;
    }
  }
  float l1 = 1.0 - smoothstep(0.012, 0.03, segDist(g, pts[1], pts[3]));
  float l2 = 1.0 - smoothstep(0.012, 0.03, segDist(g, pts[1], pts[5]));
  float l3 = 1.0 - smoothstep(0.012, 0.03, segDist(g, pts[7], pts[3]));
  float l4 = 1.0 - smoothstep(0.012, 0.03, segDist(g, pts[7], pts[5]));
  v += (l1 * smoothstep(1.55, 0.55, length(pts[1] - pts[3])) + l2 * smoothstep(1.55, 0.55, length(pts[1] - pts[5]))
      + l3 * smoothstep(1.55, 0.55, length(pts[7] - pts[3])) + l4 * smoothstep(1.55, 0.55, length(pts[7] - pts[5]))) * 0.55;
  return clamp(v, 0.0, 1.0);
}`,
  marble: `
float engine(vec2 p, float t) {
  vec2 q = p * 1.35;
  float w = fbm(q * 1.2 + vec2(t * 0.02, -t * 0.015));
  float w2 = fbm(q * 2.6 - vec2(t * 0.012, 0.0) + w);
  float veins = abs(sin((q.x * 1.1 + q.y * 0.8) * 3.0 + w * 7.0 + w2 * 3.0));
  float fine = pow(1.0 - veins, 9.0);
  float thread = pow(1.0 - abs(sin((q.y - q.x * 0.4) * 5.0 + w2 * 6.0)), 16.0);
  return clamp(0.32 * w2 + fine * 0.85 + thread * 0.35, 0.0, 1.0);
}`,
  plasma: `
float engine(vec2 p, float t) {
  vec2 q = p * 2.4;
  float v = sin(q.x * 1.3 + t * 0.45) + sin(q.y * 1.7 - t * 0.38) + sin((q.x + q.y) * 1.1 + t * 0.3)
          + sin(length(q + vec2(sin(t * 0.21), cos(t * 0.27))) * 2.4 - t * 0.55);
  return 0.5 + 0.125 * v;
}`,
  svg: `
float engine(vec2 p, float t) {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec3 c = texture2D(u_tex, uv).rgb;
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}`
};
var FIELD = `
// One click ring: x, y and z = age in seconds. Returns the wave at p; dir is the outward direction.
float clickRing(vec2 p, vec3 c, out vec2 dir) {
  vec2 d = p - c.xy;
  float r = length(d) + 0.0001;
  dir = d / r;
  float life = clamp(1.0 - c.z / ${CLICK_LIFE.toFixed(1)}, 0.0, 1.0);
  float x = (r - c.z * 0.3) * 20.0;
  return exp(-x * x) * sin(x * 3.0) * life * life / (1.0 + r * 4.0);
}

// The pointer reaction. Every mode only moves where the scene is sampled (p) and nudges its value
// by a bounded amount; the caller clamps the value to 0..1 before the intensity, so no mode can
// make any pixel brighter than the scene's own brightest colour. Strength z fades to zero when the
// pointer rests, and click rings die on their own clock, so a still cursor changes nothing.
void interact(inout vec2 p, inout float lift) {
  if (u_pmode < -0.5) return;
  vec2 d = p - u_pointer.xy;
  float r2 = dot(d, d);
  float s = u_pointer.z;
  if (u_pmode < 0.5) {
    float pull = exp(-r2 * 16.0) * s;
    p -= d * pull * 0.32;
    lift += pull * 0.05;
  } else if (u_pmode < 1.5) {
    float r = sqrt(r2);
    float wake = sin(r * 46.0 - u_time * 5.0) * exp(-r * 4.5) * s;
    p += d / (r + 0.0001) * wake * 0.02;
    lift += wake * 0.14;
    vec2 k;
    float a = clickRing(p, u_click0, k); p += k * a * 0.03; lift += a * 0.2;
    a = clickRing(p, u_click1, k); p += k * a * 0.03; lift += a * 0.2;
    a = clickRing(p, u_click2, k); p += k * a * 0.03; lift += a * 0.2;
    a = clickRing(p, u_click3, k); p += k * a * 0.03; lift += a * 0.2;
  } else if (u_pmode < 2.5) {
    float g = exp(-r2 * 9.0) * s;
    float ang = g * 1.3;
    float cs = cos(ang);
    float sn = sin(ang);
    p += mat2(cs, sn, -sn, cs) * d * (1.0 + g * 0.6) - d;
    lift -= exp(-r2 * 55.0) * s * 0.3;
  } else if (u_pmode < 3.5) {
    float r = sqrt(r2);
    float push = exp(-r2 * 9.0) * s;
    p -= d / (r + 0.05) * push * 0.17;
    float cell = hash(floor(p * 70.0) + floor(u_time * 6.0));
    lift += (cell - 0.5) * push * 0.2;
    vec2 k;
    float a = clickRing(p, u_click0, k); p -= k * a * 0.08;
    a = clickRing(p, u_click1, k); p -= k * a * 0.08;
    a = clickRing(p, u_click2, k); p -= k * a * 0.08;
    a = clickRing(p, u_click3, k); p -= k * a * 0.08;
  } else {
    float g = exp(-r2 * 3.2) * s;
    float gust = 0.55 + 0.9 * noise(p * 4.0 + u_pvel * 0.3 + u_time * 0.6);
    float swirl = (noise(p * 7.0 - u_time * 0.4) - 0.5) * 2.0;
    p -= (u_pvel + vec2(-u_pvel.y, u_pvel.x) * swirl * 0.5) * g * gust * 0.11;
  }
}

float field(vec2 sp) {
  vec2 p = (sp - 0.5 * u_res) / u_res.y;
  float lift = 0.0;
  interact(p, lift);
  p /= u_scale;
  float t = u_time + u_seed * 7.31;
  float v = clamp(engine(p, t) + lift, 0.0, 1.0);
  return (u_invert > 0.5 ? 1.0 - v : v) * u_intensity;
}
`;
var FINISH_MAIN = {
  none: `
void main() { gl_FragColor = vec4(ramp(field(gl_FragCoord.xy)), 1.0); }`,
  grain: `
void main() {
  vec2 fc = gl_FragCoord.xy;
  float g = hash(fc + floor(u_time * 8.0) * 17.0) - 0.5;
  gl_FragColor = vec4(ramp(field(fc)) + g * 0.07, 1.0);
}`,
  pixel: `
void main() { gl_FragColor = vec4(ramp(field(gl_FragCoord.xy)), 1.0); }`,
  dither: `
void main() {
  vec2 fc = gl_FragCoord.xy;
  float t = field(fc);
  float levels = max(u_levels, 2.0);
  float th = u_pattern < 0.5 ? bayer4(fc) : (u_pattern < 1.5 ? bayer8(fc) : (u_pattern < 2.5 ? ign(fc) : bayer2s(fc)));
  float q = floor(t * (levels - 1.0) + th);
  gl_FragColor = vec4(ramp(q / (levels - 1.0)), 1.0);
}`,
  scanlines: `
void main() {
  vec2 fc = gl_FragCoord.xy;
  float s = sin(fc.y * 3.14159 / u_cell);
  gl_FragColor = vec4(ramp(field(fc)) * (0.8 + 0.2 * s * s), 1.0);
}`,
  halftone: `
void main() {
  vec2 fc = gl_FragCoord.xy;
  mat2 rot = mat2(0.7071, 0.7071, -0.7071, 0.7071);
  mat2 back = mat2(0.7071, -0.7071, 0.7071, 0.7071);
  vec2 rp = rot * fc;
  vec2 cid = floor(rp / u_cell);
  vec2 local = rp - (cid + 0.5) * u_cell;
  float t = field(back * ((cid + 0.5) * u_cell));
  float level = smoothstep(0.12, 0.95, t / max(u_intensity, 0.001));
  float r = sqrt(level) * u_cell * 0.7;
  float m = 1.0 - smoothstep(r - 0.7, r + 0.7, length(local));
  gl_FragColor = vec4(mix(u_c0, ramp(mix(0.35, 1.0, level)), m), 1.0);
}`,
  braille: `
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 cs = vec2(u_cell * 0.6, u_cell);
  vec2 cid = floor(fc / cs);
  vec2 local = (fc - cid * cs) / cs;
  vec2 sub = floor(local * vec2(2.0, 4.0));
  vec2 dotPx = (fract(local * vec2(2.0, 4.0)) - 0.5) * vec2(cs.x * 0.5, cs.y * 0.25);
  float t = field(cid * cs + (sub + 0.5) / vec2(2.0, 4.0) * cs);
  float level = t / max(u_intensity, 0.001);
  float on = step(bayer8(vec2(sub.x + cid.x * 2.0, sub.y + cid.y * 4.0)) * 0.92 + 0.04, level);
  float radius = 0.34 * min(cs.x * 0.5, cs.y * 0.25);
  float m = on * (1.0 - smoothstep(radius - 0.6, radius + 0.6, length(dotPx)));
  gl_FragColor = vec4(mix(u_c0, ramp(mix(0.45, 1.0, t)), m), 1.0);
}`,
  crt: `
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 cc = fc / u_res - 0.5;
  vec2 bent = (cc * (1.0 + 0.05 * dot(cc, cc)) + 0.5) * u_res;
  float split = 1.4;
  vec3 col = vec3(ramp(field(bent + vec2(split, 0.0))).r, ramp(field(bent)).g, ramp(field(bent - vec2(split, 0.0))).b);
  float s = sin(fc.y * 3.14159 / u_cell);
  float m = mod(fc.x, 3.0);
  vec3 mask = vec3(m < 1.0 ? 1.0 : 0.84, m >= 1.0 && m < 2.0 ? 1.0 : 0.84, m >= 2.0 ? 1.0 : 0.84);
  float vignette = 1.0 - 0.35 * smoothstep(0.35, 0.75, length(cc));
  gl_FragColor = vec4(col * (0.78 + 0.22 * s * s) * mask * vignette, 1.0);
}`,
  glitch: `
void main() {
  vec2 fc = gl_FragCoord.xy;
  float cycle = floor(u_time / 5.0);
  float phase = fract(u_time / 5.0);
  float active = step(0.46, phase) * step(phase, 0.58);
  float band = floor(fc.y / (u_res.y / (7.0 + 9.0 * hash(vec2(cycle, 2.0)))));
  float hit = active * step(0.62, hash(vec2(band, cycle)));
  float shift = (hash(vec2(band, cycle + 4.0)) - 0.5) * u_res.x * 0.06 * hit;
  vec2 at = fc + vec2(shift, 0.0);
  float split = 3.0 * hit;
  vec3 col = hit > 0.5
    ? vec3(ramp(field(at + vec2(split, 0.0))).r, ramp(field(at)).g, ramp(field(at - vec2(split, 0.0))).b)
    : ramp(field(at));
  float blocks = active * step(0.97, hash(floor(fc / 8.0) + cycle));
  gl_FragColor = vec4(mix(col, ramp(1.0 - field(at)), blocks), 1.0);
}`,
  ascii: `
void main() {
  vec2 fc = gl_FragCoord.xy;
  vec2 cs = vec2(u_cell * 0.62, u_cell);
  vec2 cid = floor(fc / cs);
  vec2 local = (fc - cid * cs) / cs;
  float t = field((cid + 0.5) * cs);
  float level = clamp(t / max(u_intensity, 0.001), 0.0, 0.999);
  float g = floor(level * u_glyphCount);
  float m = texture2D(u_glyphs, vec2((g + local.x) / u_glyphCount, 1.0 - local.y)).a;
  gl_FragColor = vec4(mix(u_c0, ramp(mix(0.45, 1.0, t)), m), 1.0);
}`
};
function fragmentSource(engine, finish) {
  const e = ENGINE_SRC[engine] ? engine : "nebula";
  const f = FINISH_MAIN[finish] ? finish : "none";
  return COMMON + ENGINE_SRC[e] + FIELD + FINISH_MAIN[f];
}
function finishSizing(finish) {
  if (finish === "dither" || finish === "pixel") return "pixel";
  if (["halftone", "ascii", "braille", "scanlines", "crt"].includes(finish)) return "cell";
  return "smooth";
}

// desktop-src/renderer.js
var GLYPHS = " .:-=+*xo#%@";
function hexToRgb(hex) {
  const h = String(hex || "#000000").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0").slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
}
function svgDataUrl(svg) {
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
function svgLooksSafe(svg) {
  return typeof svg === "string" && svg.length <= 131072 && !/<script|<foreignObject|\son\w+\s*=|javascript:/i.test(svg);
}
function cssFallback(scene) {
  const stops = scene && scene.colors || ["#101014", "#202030"];
  const angle = Math.round(scene && scene.direction || 0) + 90;
  return `linear-gradient(${angle}deg, ${stops.join(", ")})`;
}
function buildGlyphAtlas() {
  const cellW = 40;
  const cellH = 64;
  const canvas = document.createElement("canvas");
  canvas.width = cellW * GLYPHS.length;
  canvas.height = cellH;
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = "#ffffff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `600 ${Math.round(cellH * 0.78)}px "JetBrains Mono", ui-monospace, monospace`;
  for (let i = 0; i < GLYPHS.length; i++) g.fillText(GLYPHS[i], cellW * i + cellW / 2, cellH * 0.54);
  return canvas;
}
var SceneRenderer = class {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = null;
    this.programs = /* @__PURE__ */ new Map();
    this.lost = false;
    this.svgImage = null;
    this.svgCanvas = null;
    this.size = { w: 1, h: 1, scale: 1 };
    this.pointer = [0, 0, 0];
    this.mode = -1;
    this.pvel = [0, 0];
    this.clicks = new Float32Array(CLICK_SLOTS * 3).fill(0);
    for (let i = 0; i < CLICK_SLOTS; i++) this.clicks[i * 3 + 2] = 99;
    this.gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power"
    });
    if (!this.gl) return;
    const gl = this.gl;
    this.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    this.onLost = (event) => {
      event.preventDefault();
      this.lost = true;
      this.programs.clear();
    };
    canvas.addEventListener("webglcontextlost", this.onLost);
  }
  get ok() {
    return Boolean(this.gl) && !this.lost;
  }
  program(engine, finish) {
    const key = `${engine}:${finish}`;
    if (this.programs.has(key)) return this.programs.get(key);
    const gl = this.gl;
    const compile = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        gl.deleteShader(s);
        throw new Error(`aether shader ${key}: ${log}`);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragmentSource(engine, finish)));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`aether link ${key}: ${gl.getProgramInfoLog(p)}`);
    const names = [
      "u_res",
      "u_time",
      "u_c0",
      "u_c1",
      "u_c2",
      "u_c3",
      "u_c4",
      "u_n",
      "u_scale",
      "u_intensity",
      "u_density",
      "u_seed",
      "u_dir",
      "u_cell",
      "u_levels",
      "u_pattern",
      "u_glyphs",
      "u_glyphCount",
      "u_tex",
      "u_invert",
      "u_pointer",
      "u_pmode",
      "u_pvel",
      "u_click0",
      "u_click1",
      "u_click2",
      "u_click3"
    ];
    const loc = {};
    for (const n of names) loc[n] = gl.getUniformLocation(p, n);
    const entry = { program: p, loc, pos: gl.getAttribLocation(p, "a_pos") };
    this.programs.set(key, entry);
    return entry;
  }
  texture(source, flip) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, Boolean(flip));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    return tex;
  }
  setScene(scene) {
    this.scene = scene;
    if (!this.ok) return;
    const finish = scene.finish && scene.finish.style || "none";
    this.entry = this.program(scene.engine, finish);
    if (finish === "ascii" && !this.glyphTex) this.glyphTex = this.texture(buildGlyphAtlas(), false);
    if (scene.engine === "svg") this.loadSvg(scene.svg);
  }
  loadSvg(svg) {
    if (!svgLooksSafe(svg)) return;
    const img = new Image();
    img.decoding = "async";
    img.src = svgDataUrl(svg);
    this.svgImage = img;
    if (!this.svgCanvas) this.svgCanvas = document.createElement("canvas");
  }
  // cssW/cssH: the size the canvas is shown at. quality scales the 'smooth' finishes.
  resize(cssW, cssH, quality = 0.5) {
    const scene = this.scene;
    const finish = scene && scene.finish && scene.finish.style || "none";
    const cell = Math.max(1, scene && scene.finish && scene.finish.pixel || 1);
    const mode = finishSizing(finish);
    const scale = mode === "pixel" ? 1 / cell : mode === "cell" ? 1 : quality;
    const w = Math.max(1, Math.round(cssW * scale));
    const h = Math.max(1, Math.round(cssH * scale));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.size = { w, h, scale, mode };
    return this.size;
  }
  draw(time) {
    if (!this.ok || !this.entry || !this.scene) return false;
    const gl = this.gl;
    const { program, loc, pos } = this.entry;
    const scene = this.scene;
    const finish = scene.finish || {};
    const colors = (scene.colors || []).slice(0, 5);
    while (colors.length < 2) colors.push(colors[0] || "#000000");
    const rgb = colors.map(hexToRgb);
    const levels = finish.levels && finish.levels >= 2 ? finish.levels : colors.length;
    const rad = (scene.direction || 0) * Math.PI / 180;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(loc.u_res, this.canvas.width, this.canvas.height);
    gl.uniform1f(loc.u_time, time);
    for (let i = 0; i < 5; i++) {
      const c = rgb[Math.min(i, rgb.length - 1)];
      gl.uniform3f(loc[`u_c${i}`], c[0], c[1], c[2]);
    }
    gl.uniform1f(loc.u_n, rgb.length);
    gl.uniform1f(loc.u_scale, scene.scale || 1);
    gl.uniform1f(loc.u_intensity, scene.intensity == null ? 0.8 : scene.intensity);
    gl.uniform1f(loc.u_density, scene.density == null ? 0.5 : scene.density);
    gl.uniform1f(loc.u_seed, scene.seed || 0);
    gl.uniform2f(loc.u_dir, Math.cos(rad), Math.sin(rad));
    gl.uniform1f(loc.u_cell, Math.max(1, (finish.pixel || 1) * (this.size.mode === "cell" ? this.size.scale : 1)));
    gl.uniform1f(loc.u_levels, levels);
    gl.uniform1f(loc.u_pattern, { bayer8: 1, noise: 2, bayer2: 3 }[finish.pattern] || 0);
    gl.uniform1f(loc.u_invert, scene.invert ? 1 : 0);
    gl.uniform3f(loc.u_pointer, this.pointer[0], this.pointer[1], this.pointer[2]);
    gl.uniform1f(loc.u_pmode, this.mode);
    gl.uniform2f(loc.u_pvel, this.pvel[0], this.pvel[1]);
    const k = this.clicks;
    gl.uniform3f(loc.u_click0, k[0], k[1], k[2]);
    gl.uniform3f(loc.u_click1, k[3], k[4], k[5]);
    gl.uniform3f(loc.u_click2, k[6], k[7], k[8]);
    gl.uniform3f(loc.u_click3, k[9], k[10], k[11]);
    if (this.glyphTex && loc.u_glyphs) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.glyphTex);
      gl.uniform1i(loc.u_glyphs, 0);
      gl.uniform1f(loc.u_glyphCount, GLYPHS.length);
    }
    if (scene.engine === "svg" && loc.u_tex) {
      if (!this.rasterizeSvg()) return false;
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.svgTex);
      gl.uniform1i(loc.u_tex, 1);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return true;
  }
  // An SVG scene with a finish is drawn into a 2D canvas each frame (the browser advances its CSS
  // animation), then uploaded as a texture the finish reads brightness from.
  rasterizeSvg() {
    const img = this.svgImage;
    if (!img || !img.complete || !img.naturalWidth) return false;
    const c = this.svgCanvas;
    if (c.width !== this.canvas.width) c.width = this.canvas.width;
    if (c.height !== this.canvas.height) c.height = this.canvas.height;
    const g = c.getContext("2d");
    const s = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    g.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
    const gl = this.gl;
    if (this.svgTex) gl.deleteTexture(this.svgTex);
    this.svgTex = this.texture(c, true);
    return true;
  }
  /** Pointer position in CSS pixels of the canvas box (cssW x cssH), and its strength 0..1. */
  setPointer(x, y, strength, cssW, cssH) {
    const h = Math.max(1, cssH);
    this.pointer = [(x - cssW / 2) / h, (cssH - y - cssH / 2) / h, strength];
  }
  /** The pointer mode (see pointer.js; -1 is off) and the pointer's velocity in field units per second. */
  setInteraction(mode, vx, vy) {
    this.mode = mode;
    this.pvel[0] = vx;
    this.pvel[1] = vy;
  }
  /** One click ring slot: where it landed (CSS pixels) and its age in seconds (99 = none). */
  setClick(slot, x, y, age, cssW, cssH) {
    const h = Math.max(1, cssH);
    const i = slot * 3;
    this.clicks[i] = (x - cssW / 2) / h;
    this.clicks[i + 1] = (cssH - y - cssH / 2) / h;
    this.clicks[i + 2] = age;
  }
  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.onLost);
    const gl = this.gl;
    if (!gl) return;
    for (const { program } of this.programs.values()) gl.deleteProgram(program);
    this.programs.clear();
    const lose = gl.getExtension("WEBGL_lose_context");
    if (lose) lose.loseContext();
    this.gl = null;
  }
};

// desktop-src/loop.js
function makeLoop(paint, fps, pauseWhenUnfocused) {
  if (typeof sdk.createBudgetedLoop === "function") {
    return sdk.createBudgetedLoop(paint, { fps, pauseWhenUnfocused });
  }
  let raf = 0;
  let last = 0;
  let dead = false;
  const tick = (now) => {
    if (dead) return;
    raf = requestAnimationFrame(tick);
    if (document.hidden || now - last < 1e3 / fps) return;
    last = now;
    paint(now);
  };
  raf = requestAnimationFrame(tick);
  return { dispose: () => {
    dead = true;
    cancelAnimationFrame(raf);
  }, isDormant: () => false, wake: () => {
  } };
}

// desktop-src/presets.generated.js
var PRESETS = [
  {
    "slug": "aether-olympus",
    "label": "Olympus",
    "description": "A temple above the clouds, its roof lifted on the light of an engraved sun, in Nous blue and gold",
    "appearance": "dark",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-olympus",
      "label": "Olympus",
      "description": "A temple above the clouds, its roof lifted on the light of an engraved sun, in Nous blue and gold",
      "colors": {
        "background": "#0000f2",
        "foreground": "#ffffff",
        "card": "#002bf4",
        "cardForeground": "#ffffff",
        "muted": "#033cf6",
        "mutedForeground": "#b6d0ff",
        "popover": "#0138f5",
        "popoverForeground": "#ffffff",
        "primary": "#ffcd42",
        "primaryForeground": "#161616",
        "secondary": "#124ce5",
        "secondaryForeground": "#fff5dc",
        "accent": "#023dea",
        "accentForeground": "#ffffff",
        "border": "#144ff8",
        "input": "#225dfa",
        "ring": "#ffcd42",
        "midground": "#ffcd42",
        "midgroundForeground": "#161616",
        "composerRing": "#ffd463",
        "destructive": "#ff9a8f",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#0000ba",
        "sidebarBorder": "#144ff8",
        "userBubble": "#0b47e7",
        "userBubbleBorder": "#507bce"
      },
      "darkColors": {
        "background": "#0000f2",
        "foreground": "#ffffff",
        "card": "#002bf4",
        "cardForeground": "#ffffff",
        "muted": "#033cf6",
        "mutedForeground": "#b6d0ff",
        "popover": "#0138f5",
        "popoverForeground": "#ffffff",
        "primary": "#ffcd42",
        "primaryForeground": "#161616",
        "secondary": "#124ce5",
        "secondaryForeground": "#fff5dc",
        "accent": "#023dea",
        "accentForeground": "#ffffff",
        "border": "#144ff8",
        "input": "#225dfa",
        "ring": "#ffcd42",
        "midground": "#ffcd42",
        "midgroundForeground": "#161616",
        "composerRing": "#ffd463",
        "destructive": "#ff9a8f",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#0000ba",
        "sidebarBorder": "#144ff8",
        "userBubble": "#0b47e7",
        "userBubbleBorder": "#507bce"
      },
      "terminal": {
        "foreground": "#ffffff",
        "cursor": "#ffcd42",
        "red": "#ff9a8f",
        "brightRed": "#ff9a8f",
        "green": "#74c976",
        "brightGreen": "#87c487",
        "yellow": "#e4ac49",
        "brightYellow": "#d9af6b",
        "blue": "#82b9ff",
        "brightBlue": "#83b9fd",
        "magenta": "#c8a5ff",
        "brightMagenta": "#c7a7fa",
        "cyan": "#3bc7d1",
        "brightCyan": "#7ad4db",
        "black": "#306afc",
        "brightBlack": "#6696ff",
        "white": "#b6d0ff",
        "brightWhite": "#ffffff"
      },
      "darkTerminal": {
        "foreground": "#ffffff",
        "cursor": "#ffcd42",
        "red": "#ff9a8f",
        "brightRed": "#ff9a8f",
        "green": "#74c976",
        "brightGreen": "#87c487",
        "yellow": "#e4ac49",
        "brightYellow": "#d9af6b",
        "blue": "#82b9ff",
        "brightBlue": "#83b9fd",
        "magenta": "#c8a5ff",
        "brightMagenta": "#c7a7fa",
        "cyan": "#3bc7d1",
        "brightCyan": "#7ad4db",
        "black": "#306afc",
        "brightBlack": "#6696ff",
        "white": "#b6d0ff",
        "brightWhite": "#ffffff"
      }
    },
    "scene": {
      "engine": "temple",
      "colors": [
        "#000091",
        "#0000f2",
        "#7d8bff",
        "#f2f2f2",
        "#ffcd42"
      ],
      "speed": 0.6,
      "scale": 1,
      "intensity": 1,
      "density": 0.5,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "dither",
        "pixel": 1,
        "levels": 0,
        "pattern": "bayer8"
      },
      "glass": {
        "tint": 0.6,
        "focus": 0.18
      }
    },
    "order": 0
  },
  {
    "slug": "aether-cyanotype",
    "label": "Cyanotype",
    "description": "Nous blue ink stippled through paper, drifting like a print still developing",
    "appearance": "light",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-cyanotype",
      "label": "Cyanotype",
      "description": "Nous blue ink stippled through paper, drifting like a print still developing",
      "colors": {
        "background": "#f2f2f2",
        "foreground": "#000091",
        "card": "#e9ecf0",
        "cardForeground": "#000091",
        "muted": "#d8dfeb",
        "mutedForeground": "#3c60ae",
        "popover": "#eceef1",
        "popoverForeground": "#000091",
        "primary": "#0000f2",
        "primaryForeground": "#ffffff",
        "secondary": "#d7e1f6",
        "secondaryForeground": "#0000a6",
        "accent": "#e2e8f4",
        "accentForeground": "#000091",
        "border": "#cdd6e8",
        "input": "#c2cee5",
        "ring": "#0000f2",
        "midground": "#0000f2",
        "midgroundForeground": "#ffffff",
        "composerRing": "#0000e6",
        "destructive": "#cf222e",
        "destructiveForeground": "#ffffff",
        "sidebarBackground": "#f7f7f7",
        "sidebarBorder": "#cdd6e8",
        "userBubble": "#d1def6",
        "userBubbleBorder": "#acc6f9"
      },
      "darkColors": {
        "background": "#f2f2f2",
        "foreground": "#000091",
        "card": "#e9ecf0",
        "cardForeground": "#000091",
        "muted": "#d8dfeb",
        "mutedForeground": "#3c60ae",
        "popover": "#eceef1",
        "popoverForeground": "#000091",
        "primary": "#0000f2",
        "primaryForeground": "#ffffff",
        "secondary": "#d7e1f6",
        "secondaryForeground": "#0000a6",
        "accent": "#e2e8f4",
        "accentForeground": "#000091",
        "border": "#cdd6e8",
        "input": "#c2cee5",
        "ring": "#0000f2",
        "midground": "#0000f2",
        "midgroundForeground": "#ffffff",
        "composerRing": "#0000e6",
        "destructive": "#cf222e",
        "destructiveForeground": "#ffffff",
        "sidebarBackground": "#f7f7f7",
        "sidebarBorder": "#cdd6e8",
        "userBubble": "#d1def6",
        "userBubbleBorder": "#acc6f9"
      },
      "terminal": {
        "foreground": "#000091",
        "cursor": "#0000f2",
        "red": "#ca3935",
        "brightRed": "#b64e46",
        "green": "#287f2f",
        "brightGreen": "#417b43",
        "yellow": "#936600",
        "brightYellow": "#8e6821",
        "blue": "#266fc5",
        "brightBlue": "#3e70b0",
        "magenta": "#8558c1",
        "brightMagenta": "#7f5fad",
        "cyan": "#007b83",
        "brightCyan": "#107a81",
        "black": "#acbdde",
        "brightBlack": "#708cc5",
        "white": "#3c60ae",
        "brightWhite": "#000091"
      },
      "darkTerminal": {
        "foreground": "#000091",
        "cursor": "#0000f2",
        "red": "#ca3935",
        "brightRed": "#b64e46",
        "green": "#287f2f",
        "brightGreen": "#417b43",
        "yellow": "#936600",
        "brightYellow": "#8e6821",
        "blue": "#266fc5",
        "brightBlue": "#3e70b0",
        "magenta": "#8558c1",
        "brightMagenta": "#7f5fad",
        "cyan": "#007b83",
        "brightCyan": "#107a81",
        "black": "#acbdde",
        "brightBlack": "#708cc5",
        "white": "#3c60ae",
        "brightWhite": "#000091"
      }
    },
    "scene": {
      "engine": "nebula",
      "colors": [
        "#f2f2f2",
        "#cdd0f7",
        "#6a71f2",
        "#0000f2",
        "#000091"
      ],
      "speed": 0.5,
      "scale": 1.25,
      "intensity": 0.7,
      "density": 0.5,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "dither",
        "pixel": 2,
        "levels": 0,
        "pattern": "bayer8"
      },
      "glass": {
        "tint": 0.55,
        "focus": 0.25
      }
    },
    "order": 1
  },
  {
    "slug": "aether-aether",
    "label": "Aether",
    "description": "Northern lights pouring over a mountain lake, mirrored in still water",
    "appearance": "dark",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-aether",
      "label": "Aether",
      "description": "Northern lights pouring over a mountain lake, mirrored in still water",
      "colors": {
        "background": "#03060f",
        "foreground": "#edf2e9",
        "card": "#090e18",
        "cardForeground": "#edf2e9",
        "muted": "#10161f",
        "mutedForeground": "#8c9292",
        "popover": "#0e141d",
        "popoverForeground": "#edf2e9",
        "primary": "#5ef0b4",
        "primaryForeground": "#161616",
        "secondary": "#0c1f23",
        "secondaryForeground": "#d4f2dd",
        "accent": "#08161c",
        "accentForeground": "#edf2e9",
        "border": "#1c212a",
        "input": "#262c34",
        "ring": "#5ef0b4",
        "midground": "#5ef0b4",
        "midgroundForeground": "#161616",
        "composerRing": "#77f1ba",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#020309",
        "sidebarBorder": "#1c212a",
        "userBubble": "#151c36",
        "userBubbleBorder": "#27305a"
      },
      "darkColors": {
        "background": "#03060f",
        "foreground": "#edf2e9",
        "card": "#090e18",
        "cardForeground": "#edf2e9",
        "muted": "#10161f",
        "mutedForeground": "#8c9292",
        "popover": "#0e141d",
        "popoverForeground": "#edf2e9",
        "primary": "#5ef0b4",
        "primaryForeground": "#161616",
        "secondary": "#0c1f23",
        "secondaryForeground": "#d4f2dd",
        "accent": "#08161c",
        "accentForeground": "#edf2e9",
        "border": "#1c212a",
        "input": "#262c34",
        "ring": "#5ef0b4",
        "midground": "#5ef0b4",
        "midgroundForeground": "#161616",
        "composerRing": "#77f1ba",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#020309",
        "sidebarBorder": "#1c212a",
        "userBubble": "#151c36",
        "userBubbleBorder": "#27305a"
      },
      "terminal": {
        "foreground": "#edf2e9",
        "cursor": "#5ef0b4",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#30363e",
        "brightBlack": "#5d6368",
        "white": "#8c9292",
        "brightWhite": "#edf2e9"
      },
      "darkTerminal": {
        "foreground": "#edf2e9",
        "cursor": "#5ef0b4",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#30363e",
        "brightBlack": "#5d6368",
        "white": "#8c9292",
        "brightWhite": "#edf2e9"
      }
    },
    "scene": {
      "engine": "aurora",
      "colors": [
        "#03060f",
        "#0b2340",
        "#1f7a6e",
        "#5ef0b4",
        "#d8fff0"
      ],
      "speed": 0.7,
      "scale": 1,
      "intensity": 1,
      "density": 0.5,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "dither",
        "pixel": 2,
        "levels": 0,
        "pattern": "bayer8"
      },
      "glass": {
        "tint": 0.58,
        "focus": 0.18
      }
    },
    "order": 2
  },
  {
    "slug": "aether-alpenglow",
    "label": "Alpenglow",
    "description": "Ranges fading into a violet dusk, valley fog drifting between them",
    "appearance": "dark",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-alpenglow",
      "label": "Alpenglow",
      "description": "Ranges fading into a violet dusk, valley fog drifting between them",
      "colors": {
        "background": "#1a1033",
        "foreground": "#f5ede4",
        "card": "#221a3b",
        "cardForeground": "#f5ede4",
        "muted": "#2a2142",
        "mutedForeground": "#9d96a1",
        "popover": "#281f40",
        "popoverForeground": "#f5ede4",
        "primary": "#ff9a6b",
        "primaryForeground": "#161616",
        "secondary": "#34233e",
        "secondaryForeground": "#f9dbca",
        "accent": "#2a1c3a",
        "accentForeground": "#f5ede4",
        "border": "#352d4c",
        "input": "#3e3754",
        "ring": "#ff9a6b",
        "midground": "#ff9a6b",
        "midgroundForeground": "#161616",
        "composerRing": "#ffa57a",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#110925",
        "sidebarBorder": "#352d4c",
        "userBubble": "#3f334a",
        "userBubbleBorder": "#62515b"
      },
      "darkColors": {
        "background": "#1a1033",
        "foreground": "#f5ede4",
        "card": "#221a3b",
        "cardForeground": "#f5ede4",
        "muted": "#2a2142",
        "mutedForeground": "#9d96a1",
        "popover": "#281f40",
        "popoverForeground": "#f5ede4",
        "primary": "#ff9a6b",
        "primaryForeground": "#161616",
        "secondary": "#34233e",
        "secondaryForeground": "#f9dbca",
        "accent": "#2a1c3a",
        "accentForeground": "#f5ede4",
        "border": "#352d4c",
        "input": "#3e3754",
        "ring": "#ff9a6b",
        "midground": "#ff9a6b",
        "midgroundForeground": "#161616",
        "composerRing": "#ffa57a",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#110925",
        "sidebarBorder": "#352d4c",
        "userBubble": "#3f334a",
        "userBubbleBorder": "#62515b"
      },
      "terminal": {
        "foreground": "#f5ede4",
        "cursor": "#ff9a6b",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#48415d",
        "brightBlack": "#726b7f",
        "white": "#9d96a1",
        "brightWhite": "#f5ede4"
      },
      "darkTerminal": {
        "foreground": "#f5ede4",
        "cursor": "#ff9a6b",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#48415d",
        "brightBlack": "#726b7f",
        "white": "#9d96a1",
        "brightWhite": "#f5ede4"
      }
    },
    "scene": {
      "engine": "summit",
      "colors": [
        "#1a1033",
        "#3d1f4f",
        "#8a3b5c",
        "#e0795a",
        "#ffd29a"
      ],
      "speed": 0.6,
      "scale": 1,
      "intensity": 1,
      "density": 0.5,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "dither",
        "pixel": 3,
        "levels": 0,
        "pattern": "bayer4"
      },
      "glass": {
        "tint": 0.56,
        "focus": 0.18
      }
    },
    "order": 3
  },
  {
    "slug": "aether-event-horizon",
    "label": "Event Horizon",
    "description": "A black hole wearing its own light: the disk bent into a burning ring",
    "appearance": "dark",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-event-horizon",
      "label": "Event Horizon",
      "description": "A black hole wearing its own light: the disk bent into a burning ring",
      "colors": {
        "background": "#000000",
        "foreground": "#f5eee3",
        "card": "#000000",
        "cardForeground": "#f5eee3",
        "muted": "#020202",
        "mutedForeground": "#86827c",
        "popover": "#020101",
        "popoverForeground": "#f5eee3",
        "primary": "#ffb347",
        "primaryForeground": "#161616",
        "secondary": "#090401",
        "secondaryForeground": "#f8e2c5",
        "accent": "#020100",
        "accentForeground": "#f5eee3",
        "border": "#0a0a09",
        "input": "#151412",
        "ring": "#ffb347",
        "midground": "#ffb347",
        "midgroundForeground": "#161616",
        "composerRing": "#febb60",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#000000",
        "sidebarBorder": "#0a0a09",
        "userBubble": "#160c02",
        "userBubbleBorder": "#3d280a"
      },
      "darkColors": {
        "background": "#000000",
        "foreground": "#f5eee3",
        "card": "#000000",
        "cardForeground": "#f5eee3",
        "muted": "#020202",
        "mutedForeground": "#86827c",
        "popover": "#020101",
        "popoverForeground": "#f5eee3",
        "primary": "#ffb347",
        "primaryForeground": "#161616",
        "secondary": "#090401",
        "secondaryForeground": "#f8e2c5",
        "accent": "#020100",
        "accentForeground": "#f5eee3",
        "border": "#0a0a09",
        "input": "#151412",
        "ring": "#ffb347",
        "midground": "#ffb347",
        "midgroundForeground": "#161616",
        "composerRing": "#febb60",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#000000",
        "sidebarBorder": "#0a0a09",
        "userBubble": "#160c02",
        "userBubbleBorder": "#3d280a"
      },
      "terminal": {
        "foreground": "#f5eee3",
        "cursor": "#ffb347",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#201f1d",
        "brightBlack": "#5b5954",
        "white": "#86827c",
        "brightWhite": "#f5eee3"
      },
      "darkTerminal": {
        "foreground": "#f5eee3",
        "cursor": "#ffb347",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#201f1d",
        "brightBlack": "#5b5954",
        "white": "#86827c",
        "brightWhite": "#f5eee3"
      }
    },
    "scene": {
      "engine": "blackhole",
      "colors": [
        "#000000",
        "#2a1606",
        "#a8551a",
        "#ffb347",
        "#fff3d6"
      ],
      "speed": 0.7,
      "scale": 1,
      "intensity": 1,
      "density": 0.5,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "dither",
        "pixel": 2,
        "levels": 0,
        "pattern": "noise"
      },
      "glass": {
        "tint": 0.56,
        "focus": 0.18
      }
    },
    "order": 4
  },
  {
    "slug": "aether-earthrise",
    "label": "Earthrise",
    "description": "Dawn breaking over the edge of the world, city lights on the night side",
    "appearance": "dark",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-earthrise",
      "label": "Earthrise",
      "description": "Dawn breaking over the edge of the world, city lights on the night side",
      "colors": {
        "background": "#01030a",
        "foreground": "#edefed",
        "card": "#050913",
        "cardForeground": "#edefed",
        "muted": "#0b111a",
        "mutedForeground": "#898e92",
        "popover": "#090f18",
        "popoverForeground": "#edefed",
        "primary": "#7cc4ff",
        "primaryForeground": "#161616",
        "secondary": "#091625",
        "secondaryForeground": "#d5e6f2",
        "accent": "#050e1b",
        "accentForeground": "#edefed",
        "border": "#161c26",
        "input": "#212630",
        "ring": "#7cc4ff",
        "midground": "#7cc4ff",
        "midgroundForeground": "#161616",
        "composerRing": "#8bcafd",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#010206",
        "sidebarBorder": "#161c26",
        "userBubble": "#0f2032",
        "userBubbleBorder": "#223c56"
      },
      "darkColors": {
        "background": "#01030a",
        "foreground": "#edefed",
        "card": "#050913",
        "cardForeground": "#edefed",
        "muted": "#0b111a",
        "mutedForeground": "#898e92",
        "popover": "#090f18",
        "popoverForeground": "#edefed",
        "primary": "#7cc4ff",
        "primaryForeground": "#161616",
        "secondary": "#091625",
        "secondaryForeground": "#d5e6f2",
        "accent": "#050e1b",
        "accentForeground": "#edefed",
        "border": "#161c26",
        "input": "#212630",
        "ring": "#7cc4ff",
        "midground": "#7cc4ff",
        "midgroundForeground": "#161616",
        "composerRing": "#8bcafd",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#010206",
        "sidebarBorder": "#161c26",
        "userBubble": "#0f2032",
        "userBubbleBorder": "#223c56"
      },
      "terminal": {
        "foreground": "#edefed",
        "cursor": "#7cc4ff",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#2b313a",
        "brightBlack": "#595f65",
        "white": "#898e92",
        "brightWhite": "#edefed"
      },
      "darkTerminal": {
        "foreground": "#edefed",
        "cursor": "#7cc4ff",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#2b313a",
        "brightBlack": "#595f65",
        "white": "#898e92",
        "brightWhite": "#edefed"
      }
    },
    "scene": {
      "engine": "planet",
      "colors": [
        "#01030a",
        "#06173a",
        "#1f5fa8",
        "#7cc4ff",
        "#f2fbff"
      ],
      "speed": 0.6,
      "scale": 1,
      "intensity": 1,
      "density": 0.5,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "dither",
        "pixel": 2,
        "levels": 0,
        "pattern": "bayer8"
      },
      "glass": {
        "tint": 0.58,
        "focus": 0.18
      }
    },
    "order": 5
  },
  {
    "slug": "aether-selene",
    "label": "Selene",
    "description": "A full moon laying a road of light across a quiet night sea",
    "appearance": "dark",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-selene",
      "label": "Selene",
      "description": "A full moon laying a road of light across a quiet night sea",
      "colors": {
        "background": "#030712",
        "foreground": "#efefeb",
        "card": "#09101b",
        "cardForeground": "#efefeb",
        "muted": "#111722",
        "mutedForeground": "#8e9195",
        "popover": "#0f1520",
        "popoverForeground": "#efefeb",
        "primary": "#9db8e0",
        "primaryForeground": "#161616",
        "secondary": "#121b2a",
        "secondaryForeground": "#dde3e9",
        "accent": "#0b1321",
        "accentForeground": "#efefeb",
        "border": "#1c232d",
        "input": "#262d37",
        "ring": "#9db8e0",
        "midground": "#9db8e0",
        "midgroundForeground": "#161616",
        "composerRing": "#a7bfe2",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#02040b",
        "sidebarBorder": "#1c232d",
        "userBubble": "#1a2435",
        "userBubbleBorder": "#313e53"
      },
      "darkColors": {
        "background": "#030712",
        "foreground": "#efefeb",
        "card": "#09101b",
        "cardForeground": "#efefeb",
        "muted": "#111722",
        "mutedForeground": "#8e9195",
        "popover": "#0f1520",
        "popoverForeground": "#efefeb",
        "primary": "#9db8e0",
        "primaryForeground": "#161616",
        "secondary": "#121b2a",
        "secondaryForeground": "#dde3e9",
        "accent": "#0b1321",
        "accentForeground": "#efefeb",
        "border": "#1c232d",
        "input": "#262d37",
        "ring": "#9db8e0",
        "midground": "#9db8e0",
        "midgroundForeground": "#161616",
        "composerRing": "#a7bfe2",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#02040b",
        "sidebarBorder": "#1c232d",
        "userBubble": "#1a2435",
        "userBubbleBorder": "#313e53"
      },
      "terminal": {
        "foreground": "#efefeb",
        "cursor": "#9db8e0",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#313741",
        "brightBlack": "#5e636b",
        "white": "#8e9195",
        "brightWhite": "#efefeb"
      },
      "darkTerminal": {
        "foreground": "#efefeb",
        "cursor": "#9db8e0",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#313741",
        "brightBlack": "#5e636b",
        "white": "#8e9195",
        "brightWhite": "#efefeb"
      }
    },
    "scene": {
      "engine": "moonsea",
      "colors": [
        "#030712",
        "#0c1a33",
        "#2d4b7a",
        "#9db8e0",
        "#f4f7ff"
      ],
      "speed": 0.6,
      "scale": 1,
      "intensity": 1,
      "density": 0.5,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "dither",
        "pixel": 2,
        "levels": 0,
        "pattern": "bayer8"
      },
      "glass": {
        "tint": 0.59,
        "focus": 0.18
      }
    },
    "order": 6
  },
  {
    "slug": "aether-mirage",
    "label": "Mirage",
    "description": "Golden-hour dunes, sand streaming off their crests in the wind",
    "appearance": "dark",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-mirage",
      "label": "Mirage",
      "description": "Golden-hour dunes, sand streaming off their crests in the wind",
      "colors": {
        "background": "#2a0f1e",
        "foreground": "#f4ede4",
        "card": "#331826",
        "cardForeground": "#f4ede4",
        "muted": "#3a202d",
        "mutedForeground": "#a69596",
        "popover": "#381e2b",
        "popoverForeground": "#f4ede4",
        "primary": "#f0a35c",
        "primaryForeground": "#161616",
        "secondary": "#422128",
        "secondaryForeground": "#f4ddc7",
        "accent": "#391b25",
        "accentForeground": "#f4ede4",
        "border": "#452b37",
        "input": "#4f3540",
        "ring": "#f0a35c",
        "midground": "#f0a35c",
        "midgroundForeground": "#161616",
        "composerRing": "#f1ac6e",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#1e0914",
        "sidebarBorder": "#452b37",
        "userBubble": "#4d292c",
        "userBubbleBorder": "#6b4037"
      },
      "darkColors": {
        "background": "#2a0f1e",
        "foreground": "#f4ede4",
        "card": "#331826",
        "cardForeground": "#f4ede4",
        "muted": "#3a202d",
        "mutedForeground": "#a69596",
        "popover": "#381e2b",
        "popoverForeground": "#f4ede4",
        "primary": "#f0a35c",
        "primaryForeground": "#161616",
        "secondary": "#422128",
        "secondaryForeground": "#f4ddc7",
        "accent": "#391b25",
        "accentForeground": "#f4ede4",
        "border": "#452b37",
        "input": "#4f3540",
        "ring": "#f0a35c",
        "midground": "#f0a35c",
        "midgroundForeground": "#161616",
        "composerRing": "#f1ac6e",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#1e0914",
        "sidebarBorder": "#452b37",
        "userBubble": "#4d292c",
        "userBubbleBorder": "#6b4037"
      },
      "terminal": {
        "foreground": "#f4ede4",
        "cursor": "#f0a35c",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#583f49",
        "brightBlack": "#7f6a70",
        "white": "#a69596",
        "brightWhite": "#f4ede4"
      },
      "darkTerminal": {
        "foreground": "#f4ede4",
        "cursor": "#f0a35c",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#583f49",
        "brightBlack": "#7f6a70",
        "white": "#a69596",
        "brightWhite": "#f4ede4"
      }
    },
    "scene": {
      "engine": "dunes",
      "colors": [
        "#2a0f1e",
        "#6b2a2f",
        "#c4623a",
        "#f0a35c",
        "#ffe2a8"
      ],
      "speed": 0.6,
      "scale": 1,
      "intensity": 1,
      "density": 0.5,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "dither",
        "pixel": 3,
        "levels": 0,
        "pattern": "bayer4"
      },
      "glass": {
        "tint": 0.6,
        "focus": 0.18
      }
    },
    "order": 7
  },
  {
    "slug": "aether-above-the-clouds",
    "label": "Above the Clouds",
    "description": "A sea of cloud at first light, seen from the window seat",
    "appearance": "light",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-above-the-clouds",
      "label": "Above the Clouds",
      "description": "A sea of cloud at first light, seen from the window seat",
      "colors": {
        "background": "#fff6ea",
        "foreground": "#1d2347",
        "card": "#f7efe5",
        "cardForeground": "#1d2347",
        "muted": "#e8e1db",
        "mutedForeground": "#60647a",
        "popover": "#faf1e7",
        "popoverForeground": "#1d2347",
        "primary": "#3d4a9e",
        "primaryForeground": "#ffffff",
        "secondary": "#e9e4e4",
        "secondaryForeground": "#242b59",
        "accent": "#f2ebe6",
        "accentForeground": "#1d2347",
        "border": "#ded8d4",
        "input": "#d4cfcd",
        "ring": "#3d4a9e",
        "midground": "#3d4a9e",
        "midgroundForeground": "#ffffff",
        "composerRing": "#394593",
        "destructive": "#cf222e",
        "destructiveForeground": "#ffffff",
        "sidebarBackground": "#fff9f1",
        "sidebarBorder": "#ded8d4",
        "userBubble": "#e5e1e2",
        "userBubbleBorder": "#c8c9d9"
      },
      "darkColors": {
        "background": "#fff6ea",
        "foreground": "#1d2347",
        "card": "#f7efe5",
        "cardForeground": "#1d2347",
        "muted": "#e8e1db",
        "mutedForeground": "#60647a",
        "popover": "#faf1e7",
        "popoverForeground": "#1d2347",
        "primary": "#3d4a9e",
        "primaryForeground": "#ffffff",
        "secondary": "#e9e4e4",
        "secondaryForeground": "#242b59",
        "accent": "#f2ebe6",
        "accentForeground": "#1d2347",
        "border": "#ded8d4",
        "input": "#d4cfcd",
        "ring": "#3d4a9e",
        "midground": "#3d4a9e",
        "midgroundForeground": "#ffffff",
        "composerRing": "#394593",
        "destructive": "#cf222e",
        "destructiveForeground": "#ffffff",
        "sidebarBackground": "#fff9f1",
        "sidebarBorder": "#ded8d4",
        "userBubble": "#e5e1e2",
        "userBubbleBorder": "#c8c9d9"
      },
      "terminal": {
        "foreground": "#1d2347",
        "cursor": "#3d4a9e",
        "red": "#ce3d38",
        "brightRed": "#b95149",
        "green": "#2c8233",
        "brightGreen": "#447e46",
        "yellow": "#976900",
        "brightYellow": "#926b25",
        "blue": "#2a72c9",
        "brightBlue": "#4173b3",
        "magenta": "#895bc4",
        "brightMagenta": "#8262b0",
        "cyan": "#007e86",
        "brightCyan": "#177e85",
        "black": "#c0bdc0",
        "brightBlack": "#8e8e9c",
        "white": "#60647a",
        "brightWhite": "#1d2347"
      },
      "darkTerminal": {
        "foreground": "#1d2347",
        "cursor": "#3d4a9e",
        "red": "#ce3d38",
        "brightRed": "#b95149",
        "green": "#2c8233",
        "brightGreen": "#447e46",
        "yellow": "#976900",
        "brightYellow": "#926b25",
        "blue": "#2a72c9",
        "brightBlue": "#4173b3",
        "magenta": "#895bc4",
        "brightMagenta": "#8262b0",
        "cyan": "#007e86",
        "brightCyan": "#177e85",
        "black": "#c0bdc0",
        "brightBlack": "#8e8e9c",
        "white": "#60647a",
        "brightWhite": "#1d2347"
      }
    },
    "scene": {
      "engine": "clouds",
      "colors": [
        "#fff6ea",
        "#f6d9b8",
        "#e3a88a",
        "#9097cc",
        "#3d4a86"
      ],
      "speed": 0.6,
      "scale": 1,
      "intensity": 0.8,
      "density": 0.5,
      "direction": 0,
      "seed": 7,
      "invert": true,
      "svg": null,
      "finish": {
        "style": "dither",
        "pixel": 2,
        "levels": 0,
        "pattern": "noise"
      },
      "glass": {
        "tint": 0.5,
        "focus": 0.25
      }
    },
    "order": 8
  },
  {
    "slug": "aether-after-hours",
    "label": "After Hours",
    "description": "A neon city in the rain, its windows doubled in the wet street",
    "appearance": "dark",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-after-hours",
      "label": "After Hours",
      "description": "A neon city in the rain, its windows doubled in the wet street",
      "colors": {
        "background": "#07040f",
        "foreground": "#f7e9e8",
        "card": "#0f0b18",
        "cardForeground": "#f7e9e8",
        "muted": "#17121f",
        "mutedForeground": "#958b92",
        "popover": "#15101d",
        "popoverForeground": "#f7e9e8",
        "primary": "#ff3fa4",
        "primaryForeground": "#161616",
        "secondary": "#230c21",
        "secondaryForeground": "#fec9d9",
        "accent": "#18091a",
        "accentForeground": "#f7e9e8",
        "border": "#231e2a",
        "input": "#2d2834",
        "ring": "#ff3fa4",
        "midground": "#ff3fa4",
        "midgroundForeground": "#161616",
        "composerRing": "#ff5cac",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#040209",
        "sidebarBorder": "#231e2a",
        "userBubble": "#1d2a37",
        "userBubbleBorder": "#304e5a"
      },
      "darkColors": {
        "background": "#07040f",
        "foreground": "#f7e9e8",
        "card": "#0f0b18",
        "cardForeground": "#f7e9e8",
        "muted": "#17121f",
        "mutedForeground": "#958b92",
        "popover": "#15101d",
        "popoverForeground": "#f7e9e8",
        "primary": "#ff3fa4",
        "primaryForeground": "#161616",
        "secondary": "#230c21",
        "secondaryForeground": "#fec9d9",
        "accent": "#18091a",
        "accentForeground": "#f7e9e8",
        "border": "#231e2a",
        "input": "#2d2834",
        "ring": "#ff3fa4",
        "midground": "#ff3fa4",
        "midgroundForeground": "#161616",
        "composerRing": "#ff5cac",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#040209",
        "sidebarBorder": "#231e2a",
        "userBubble": "#1d2a37",
        "userBubbleBorder": "#304e5a"
      },
      "terminal": {
        "foreground": "#f7e9e8",
        "cursor": "#ff3fa4",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#38323e",
        "brightBlack": "#665e67",
        "white": "#958b92",
        "brightWhite": "#f7e9e8"
      },
      "darkTerminal": {
        "foreground": "#f7e9e8",
        "cursor": "#ff3fa4",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#38323e",
        "brightBlack": "#665e67",
        "white": "#958b92",
        "brightWhite": "#f7e9e8"
      },
      "typography": {
        "fontSans": '"Space Grotesk", "Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        "fontUrl": "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"
      }
    },
    "scene": {
      "engine": "skyline",
      "colors": [
        "#07040f",
        "#1c0f33",
        "#7b1e6b",
        "#ff3fa4",
        "#7df9ff"
      ],
      "speed": 0.7,
      "scale": 1,
      "intensity": 1,
      "density": 0.5,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "scanlines",
        "pixel": 3,
        "levels": 0,
        "pattern": "bayer4"
      },
      "glass": {
        "tint": 0.55,
        "focus": 0.18
      }
    },
    "order": 9
  },
  {
    "slug": "aether-hanami",
    "label": "Hanami",
    "description": "Cherry boughs overhead and petals drifting down through spring light",
    "appearance": "light",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-hanami",
      "label": "Hanami",
      "description": "Cherry boughs overhead and petals drifting down through spring light",
      "colors": {
        "background": "#fff6f8",
        "foreground": "#3a1626",
        "card": "#f9eef1",
        "cardForeground": "#3a1626",
        "muted": "#ecdfe3",
        "mutedForeground": "#7a5d68",
        "popover": "#fbf1f3",
        "popoverForeground": "#3a1626",
        "primary": "#c4456f",
        "primaryForeground": "#ffffff",
        "secondary": "#fbe5e9",
        "secondaryForeground": "#562035",
        "accent": "#fdecef",
        "accentForeground": "#3a1626",
        "border": "#e4d5d9",
        "input": "#dbccd0",
        "ring": "#c4456f",
        "midground": "#c4456f",
        "midgroundForeground": "#ffffff",
        "composerRing": "#b23f66",
        "destructive": "#cf222e",
        "destructiveForeground": "#ffffff",
        "sidebarBackground": "#fff9fa",
        "sidebarBorder": "#e4d5d9",
        "userBubble": "#fae1e7",
        "userBubbleBorder": "#f4c9d3"
      },
      "darkColors": {
        "background": "#fff6f8",
        "foreground": "#3a1626",
        "card": "#f9eef1",
        "cardForeground": "#3a1626",
        "muted": "#ecdfe3",
        "mutedForeground": "#7a5d68",
        "popover": "#fbf1f3",
        "popoverForeground": "#3a1626",
        "primary": "#c4456f",
        "primaryForeground": "#ffffff",
        "secondary": "#fbe5e9",
        "secondaryForeground": "#562035",
        "accent": "#fdecef",
        "accentForeground": "#3a1626",
        "border": "#e4d5d9",
        "input": "#dbccd0",
        "ring": "#c4456f",
        "midground": "#c4456f",
        "midgroundForeground": "#ffffff",
        "composerRing": "#b23f66",
        "destructive": "#cf222e",
        "destructiveForeground": "#ffffff",
        "sidebarBackground": "#fff9fa",
        "sidebarBorder": "#e4d5d9",
        "userBubble": "#fae1e7",
        "userBubbleBorder": "#f4c9d3"
      },
      "terminal": {
        "foreground": "#3a1626",
        "cursor": "#c4456f",
        "red": "#cf3d38",
        "brightRed": "#ba524a",
        "green": "#2c8233",
        "brightGreen": "#457f47",
        "yellow": "#986a00",
        "brightYellow": "#926c26",
        "blue": "#2a73c9",
        "brightBlue": "#4274b4",
        "magenta": "#895bc5",
        "brightMagenta": "#8363b1",
        "cyan": "#007f87",
        "brightCyan": "#187e85",
        "black": "#cbb8be",
        "brightBlack": "#a38992",
        "white": "#7a5d68",
        "brightWhite": "#3a1626"
      },
      "darkTerminal": {
        "foreground": "#3a1626",
        "cursor": "#c4456f",
        "red": "#cf3d38",
        "brightRed": "#ba524a",
        "green": "#2c8233",
        "brightGreen": "#457f47",
        "yellow": "#986a00",
        "brightYellow": "#926c26",
        "blue": "#2a73c9",
        "brightBlue": "#4274b4",
        "magenta": "#895bc5",
        "brightMagenta": "#8363b1",
        "cyan": "#007f87",
        "brightCyan": "#187e85",
        "black": "#cbb8be",
        "brightBlack": "#a38992",
        "white": "#7a5d68",
        "brightWhite": "#3a1626"
      }
    },
    "scene": {
      "engine": "sakura",
      "colors": [
        "#fff6f8",
        "#fbe3ea",
        "#f4b6c8",
        "#e58aa6",
        "#9c3d62"
      ],
      "speed": 0.7,
      "scale": 1,
      "intensity": 0.95,
      "density": 0.5,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "dither",
        "pixel": 2,
        "levels": 0,
        "pattern": "noise"
      },
      "glass": {
        "tint": 0.45,
        "focus": 0.25
      }
    },
    "order": 10
  },
  {
    "slug": "aether-helios",
    "label": "Helios",
    "description": "A striped sun over an endless grid, dithered like an old arcade cabinet",
    "appearance": "dark",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-helios",
      "label": "Helios",
      "description": "A striped sun over an endless grid, dithered like an old arcade cabinet",
      "colors": {
        "background": "#120a24",
        "foreground": "#f6ebe3",
        "card": "#1b132c",
        "cardForeground": "#f6ebe3",
        "muted": "#221b33",
        "mutedForeground": "#9a919a",
        "popover": "#201932",
        "popoverForeground": "#f6ebe3",
        "primary": "#ff7a59",
        "primaryForeground": "#161616",
        "secondary": "#2d1a2e",
        "secondaryForeground": "#fbd4c5",
        "accent": "#23142b",
        "accentForeground": "#f6ebe3",
        "border": "#2d263e",
        "input": "#373047",
        "ring": "#ff7a59",
        "midground": "#ff7a59",
        "midgroundForeground": "#161616",
        "composerRing": "#ff896b",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#0b0619",
        "sidebarBorder": "#2d263e",
        "userBubble": "#38303b",
        "userBubbleBorder": "#5b4f4c"
      },
      "darkColors": {
        "background": "#120a24",
        "foreground": "#f6ebe3",
        "card": "#1b132c",
        "cardForeground": "#f6ebe3",
        "muted": "#221b33",
        "mutedForeground": "#9a919a",
        "popover": "#201932",
        "popoverForeground": "#f6ebe3",
        "primary": "#ff7a59",
        "primaryForeground": "#161616",
        "secondary": "#2d1a2e",
        "secondaryForeground": "#fbd4c5",
        "accent": "#23142b",
        "accentForeground": "#f6ebe3",
        "border": "#2d263e",
        "input": "#373047",
        "ring": "#ff7a59",
        "midground": "#ff7a59",
        "midgroundForeground": "#161616",
        "composerRing": "#ff896b",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#0b0619",
        "sidebarBorder": "#2d263e",
        "userBubble": "#38303b",
        "userBubbleBorder": "#5b4f4c"
      },
      "terminal": {
        "foreground": "#f6ebe3",
        "cursor": "#ff7a59",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#423b50",
        "brightBlack": "#6d6675",
        "white": "#9a919a",
        "brightWhite": "#f6ebe3"
      },
      "darkTerminal": {
        "foreground": "#f6ebe3",
        "cursor": "#ff7a59",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#423b50",
        "brightBlack": "#6d6675",
        "white": "#9a919a",
        "brightWhite": "#f6ebe3"
      },
      "typography": {
        "fontSans": '"Space Grotesk", "Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        "fontUrl": "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap"
      }
    },
    "scene": {
      "engine": "horizon",
      "colors": [
        "#120a24",
        "#4a1b5c",
        "#d9426b",
        "#ff9b45",
        "#ffe08a"
      ],
      "speed": 0.6,
      "scale": 1,
      "intensity": 0.9,
      "density": 0.5,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "dither",
        "pixel": 3,
        "levels": 0,
        "pattern": "bayer4"
      },
      "glass": {
        "tint": 0.58,
        "focus": 0.18
      }
    },
    "order": 11
  },
  {
    "slug": "aether-talaria",
    "label": "Talaria",
    "description": "Silver wings at full speed over a sea of cloud, feathers torn loose by the wind",
    "appearance": "dark",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-talaria",
      "label": "Talaria",
      "description": "Silver wings at full speed over a sea of cloud, feathers torn loose by the wind",
      "colors": {
        "background": "#060a1f",
        "foreground": "#edeeee",
        "card": "#0e1328",
        "cardForeground": "#edeeee",
        "muted": "#151b2f",
        "mutedForeground": "#8f939d",
        "popover": "#13192d",
        "popoverForeground": "#edeeee",
        "primary": "#7fa6ff",
        "primaryForeground": "#161616",
        "secondary": "#131c39",
        "secondaryForeground": "#d4dff3",
        "accent": "#0e1530",
        "accentForeground": "#edeeee",
        "border": "#20263a",
        "input": "#2a3044",
        "ring": "#7fa6ff",
        "midground": "#7fa6ff",
        "midgroundForeground": "#161616",
        "composerRing": "#8caffe",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#030615",
        "sidebarBorder": "#20263a",
        "userBubble": "#1a2445",
        "userBubbleBorder": "#2c3c67"
      },
      "darkColors": {
        "background": "#060a1f",
        "foreground": "#edeeee",
        "card": "#0e1328",
        "cardForeground": "#edeeee",
        "muted": "#151b2f",
        "mutedForeground": "#8f939d",
        "popover": "#13192d",
        "popoverForeground": "#edeeee",
        "primary": "#7fa6ff",
        "primaryForeground": "#161616",
        "secondary": "#131c39",
        "secondaryForeground": "#d4dff3",
        "accent": "#0e1530",
        "accentForeground": "#edeeee",
        "border": "#20263a",
        "input": "#2a3044",
        "ring": "#7fa6ff",
        "midground": "#7fa6ff",
        "midgroundForeground": "#161616",
        "composerRing": "#8caffe",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#030615",
        "sidebarBorder": "#20263a",
        "userBubble": "#1a2445",
        "userBubbleBorder": "#2c3c67"
      },
      "terminal": {
        "foreground": "#edeeee",
        "cursor": "#7fa6ff",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#353b4d",
        "brightBlack": "#616675",
        "white": "#8f939d",
        "brightWhite": "#edeeee"
      },
      "darkTerminal": {
        "foreground": "#edeeee",
        "cursor": "#7fa6ff",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#353b4d",
        "brightBlack": "#616675",
        "white": "#8f939d",
        "brightWhite": "#edeeee"
      }
    },
    "scene": {
      "engine": "wings",
      "colors": [
        "#050816",
        "#101c4a",
        "#3b6cf0",
        "#cdd9ff",
        "#ffcd42"
      ],
      "speed": 1,
      "scale": 1,
      "intensity": 1,
      "density": 0.5,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "dither",
        "pixel": 2,
        "levels": 0,
        "pattern": "bayer8"
      },
      "glass": {
        "tint": 0.53,
        "focus": 0.18
      }
    },
    "order": 12
  },
  {
    "slug": "aether-styx",
    "label": "Styx",
    "description": "Dark river contours drifting slowly, Hermes guiding the way across",
    "appearance": "dark",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-styx",
      "label": "Styx",
      "description": "Dark river contours drifting slowly, Hermes guiding the way across",
      "colors": {
        "background": "#03100f",
        "foreground": "#ebf0e9",
        "card": "#0a1917",
        "cardForeground": "#ebf0e9",
        "muted": "#12201f",
        "mutedForeground": "#8d9692",
        "popover": "#101e1d",
        "popoverForeground": "#ebf0e9",
        "primary": "#3fd1bd",
        "primaryForeground": "#161616",
        "secondary": "#082623",
        "secondaryForeground": "#cdeadf",
        "accent": "#061e1c",
        "accentForeground": "#ebf0e9",
        "border": "#1e2b2a",
        "input": "#283533",
        "ring": "#3fd1bd",
        "midground": "#3fd1bd",
        "midgroundForeground": "#161616",
        "composerRing": "#5fd5c2",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#020909",
        "sidebarBorder": "#1e2b2a",
        "userBubble": "#0c302c",
        "userBubbleBorder": "#154d46"
      },
      "darkColors": {
        "background": "#03100f",
        "foreground": "#ebf0e9",
        "card": "#0a1917",
        "cardForeground": "#ebf0e9",
        "muted": "#12201f",
        "mutedForeground": "#8d9692",
        "popover": "#101e1d",
        "popoverForeground": "#ebf0e9",
        "primary": "#3fd1bd",
        "primaryForeground": "#161616",
        "secondary": "#082623",
        "secondaryForeground": "#cdeadf",
        "accent": "#061e1c",
        "accentForeground": "#ebf0e9",
        "border": "#1e2b2a",
        "input": "#283533",
        "ring": "#3fd1bd",
        "midground": "#3fd1bd",
        "midgroundForeground": "#161616",
        "composerRing": "#5fd5c2",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#020909",
        "sidebarBorder": "#1e2b2a",
        "userBubble": "#0c302c",
        "userBubbleBorder": "#154d46"
      },
      "terminal": {
        "foreground": "#ebf0e9",
        "cursor": "#3fd1bd",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#323f3d",
        "brightBlack": "#5f6a67",
        "white": "#8d9692",
        "brightWhite": "#ebf0e9"
      },
      "darkTerminal": {
        "foreground": "#ebf0e9",
        "cursor": "#3fd1bd",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#323f3d",
        "brightBlack": "#5f6a67",
        "white": "#8d9692",
        "brightWhite": "#ebf0e9"
      }
    },
    "scene": {
      "engine": "tides",
      "colors": [
        "#03100f",
        "#0a2b2a",
        "#1e7f78",
        "#7de3d1"
      ],
      "speed": 0.6,
      "scale": 1,
      "intensity": 0.8,
      "density": 0.6,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "none",
        "pixel": 2,
        "levels": 0,
        "pattern": "bayer4"
      },
      "glass": {
        "tint": 0.45,
        "focus": 0.18
      }
    },
    "order": 13
  },
  {
    "slug": "aether-phosphor",
    "label": "Phosphor",
    "description": "The classic Hermes amber terminal, raining in text characters",
    "appearance": "dark",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-phosphor",
      "label": "Phosphor",
      "description": "The classic Hermes amber terminal, raining in text characters",
      "colors": {
        "background": "#0d0a05",
        "foreground": "#f5efe2",
        "card": "#16130c",
        "cardForeground": "#f5efe2",
        "muted": "#1d1a13",
        "mutedForeground": "#989388",
        "popover": "#1b1811",
        "popoverForeground": "#f5efe2",
        "primary": "#ffbf00",
        "primaryForeground": "#161616",
        "secondary": "#281f0b",
        "secondaryForeground": "#f8e5c0",
        "accent": "#1e1709",
        "accentForeground": "#f5efe2",
        "border": "#29251e",
        "input": "#332f28",
        "ring": "#ffbf00",
        "midground": "#ffbf00",
        "midgroundForeground": "#161616",
        "composerRing": "#fec543",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#070603",
        "sidebarBorder": "#29251e",
        "userBubble": "#35280d",
        "userBubbleBorder": "#584312"
      },
      "darkColors": {
        "background": "#0d0a05",
        "foreground": "#f5efe2",
        "card": "#16130c",
        "cardForeground": "#f5efe2",
        "muted": "#1d1a13",
        "mutedForeground": "#989388",
        "popover": "#1b1811",
        "popoverForeground": "#f5efe2",
        "primary": "#ffbf00",
        "primaryForeground": "#161616",
        "secondary": "#281f0b",
        "secondaryForeground": "#f8e5c0",
        "accent": "#1e1709",
        "accentForeground": "#f5efe2",
        "border": "#29251e",
        "input": "#332f28",
        "ring": "#ffbf00",
        "midground": "#ffbf00",
        "midgroundForeground": "#161616",
        "composerRing": "#fec543",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#070603",
        "sidebarBorder": "#29251e",
        "userBubble": "#35280d",
        "userBubbleBorder": "#584312"
      },
      "terminal": {
        "foreground": "#f5efe2",
        "cursor": "#ffbf00",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#3e3a32",
        "brightBlack": "#6a655c",
        "white": "#989388",
        "brightWhite": "#f5efe2"
      },
      "darkTerminal": {
        "foreground": "#f5efe2",
        "cursor": "#ffbf00",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#3e3a32",
        "brightBlack": "#6a655c",
        "white": "#989388",
        "brightWhite": "#f5efe2"
      },
      "typography": {
        "fontSans": '"JetBrains Mono", "Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
      }
    },
    "scene": {
      "engine": "rain",
      "colors": [
        "#0d0a05",
        "#3a2606",
        "#c98a00",
        "#ffbf00",
        "#ffe7a3"
      ],
      "speed": 0.8,
      "scale": 1,
      "intensity": 0.95,
      "density": 0.7,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "ascii",
        "pixel": 13,
        "levels": 0,
        "pattern": "bayer4"
      },
      "glass": {
        "tint": 0.6,
        "focus": 0.18
      }
    },
    "order": 14
  },
  {
    "slug": "aether-caduceus-gold",
    "label": "Caduceus Gold",
    "description": "Sparks rising in the gold-to-bronze of the Hermes banner, pixel dithered",
    "appearance": "dark",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-caduceus-gold",
      "label": "Caduceus Gold",
      "description": "Sparks rising in the gold-to-bronze of the Hermes banner, pixel dithered",
      "colors": {
        "background": "#0f0d0a",
        "foreground": "#f5f0e4",
        "card": "#181612",
        "cardForeground": "#f5f0e4",
        "muted": "#1f1d19",
        "mutedForeground": "#99958c",
        "popover": "#1d1b17",
        "popoverForeground": "#f5f0e4",
        "primary": "#ffcd42",
        "primaryForeground": "#161616",
        "secondary": "#2a2314",
        "secondaryForeground": "#f7e9c6",
        "accent": "#201b10",
        "accentForeground": "#f5f0e4",
        "border": "#2b2824",
        "input": "#35322e",
        "ring": "#ffcd42",
        "midground": "#ffcd42",
        "midgroundForeground": "#161616",
        "composerRing": "#fed25e",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#090706",
        "sidebarBorder": "#2b2824",
        "userBubble": "#2f2114",
        "userBubbleBorder": "#4c321b"
      },
      "darkColors": {
        "background": "#0f0d0a",
        "foreground": "#f5f0e4",
        "card": "#181612",
        "cardForeground": "#f5f0e4",
        "muted": "#1f1d19",
        "mutedForeground": "#99958c",
        "popover": "#1d1b17",
        "popoverForeground": "#f5f0e4",
        "primary": "#ffcd42",
        "primaryForeground": "#161616",
        "secondary": "#2a2314",
        "secondaryForeground": "#f7e9c6",
        "accent": "#201b10",
        "accentForeground": "#f5f0e4",
        "border": "#2b2824",
        "input": "#35322e",
        "ring": "#ffcd42",
        "midground": "#ffcd42",
        "midgroundForeground": "#161616",
        "composerRing": "#fed25e",
        "destructive": "#f85149",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#090706",
        "sidebarBorder": "#2b2824",
        "userBubble": "#2f2114",
        "userBubbleBorder": "#4c321b"
      },
      "terminal": {
        "foreground": "#f5f0e4",
        "cursor": "#ffcd42",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#3f3d37",
        "brightBlack": "#6b6861",
        "white": "#99958c",
        "brightWhite": "#f5f0e4"
      },
      "darkTerminal": {
        "foreground": "#f5f0e4",
        "cursor": "#ffcd42",
        "red": "#e5534b",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#3f3d37",
        "brightBlack": "#6b6861",
        "white": "#99958c",
        "brightWhite": "#f5f0e4"
      },
      "typography": {
        "fontSans": '"Courier Prime", "Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        "fontUrl": "https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap"
      }
    },
    "scene": {
      "engine": "embers",
      "colors": [
        "#0f0d0a",
        "#3a2408",
        "#cd7f32",
        "#ffbf00",
        "#ffe48a"
      ],
      "speed": 0.8,
      "scale": 1,
      "intensity": 0.9,
      "density": 0.55,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "dither",
        "pixel": 3,
        "levels": 0,
        "pattern": "bayer4"
      },
      "glass": {
        "tint": 0.53,
        "focus": 0.18
      }
    },
    "order": 15
  },
  {
    "slug": "aether-folio",
    "label": "Folio",
    "description": "Mountains in one-bit ink on paper, like a page from an old field journal",
    "appearance": "light",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-folio",
      "label": "Folio",
      "description": "Mountains in one-bit ink on paper, like a page from an old field journal",
      "colors": {
        "background": "#f2efe6",
        "foreground": "#16161a",
        "card": "#eae8df",
        "cardForeground": "#16161a",
        "muted": "#dbd9d1",
        "mutedForeground": "#5c5b5b",
        "popover": "#edeae1",
        "popoverForeground": "#16161a",
        "primary": "#1b1b1f",
        "primaryForeground": "#ffffff",
        "secondary": "#dad7d0",
        "secondaryForeground": "#17171b",
        "accent": "#e3e1d9",
        "accentForeground": "#16161a",
        "border": "#d1cfc8",
        "input": "#c8c5bf",
        "ring": "#1b1b1f",
        "midground": "#1b1b1f",
        "midgroundForeground": "#ffffff",
        "composerRing": "#1a1a1e",
        "destructive": "#cf222e",
        "destructiveForeground": "#ffffff",
        "sidebarBackground": "#f7f5ef",
        "sidebarBorder": "#d1cfc8",
        "userBubble": "#d5d2cb",
        "userBubbleBorder": "#b4b2ad"
      },
      "darkColors": {
        "background": "#f2efe6",
        "foreground": "#16161a",
        "card": "#eae8df",
        "cardForeground": "#16161a",
        "muted": "#dbd9d1",
        "mutedForeground": "#5c5b5b",
        "popover": "#edeae1",
        "popoverForeground": "#16161a",
        "primary": "#1b1b1f",
        "primaryForeground": "#ffffff",
        "secondary": "#dad7d0",
        "secondaryForeground": "#17171b",
        "accent": "#e3e1d9",
        "accentForeground": "#16161a",
        "border": "#d1cfc8",
        "input": "#c8c5bf",
        "ring": "#1b1b1f",
        "midground": "#1b1b1f",
        "midgroundForeground": "#ffffff",
        "composerRing": "#1a1a1e",
        "destructive": "#cf222e",
        "destructiveForeground": "#ffffff",
        "sidebarBackground": "#f7f5ef",
        "sidebarBorder": "#d1cfc8",
        "userBubble": "#d5d2cb",
        "userBubbleBorder": "#b4b2ad"
      },
      "terminal": {
        "foreground": "#16161a",
        "cursor": "#1b1b1f",
        "red": "#c83733",
        "brightRed": "#b44c44",
        "green": "#267d2e",
        "brightGreen": "#3f7941",
        "yellow": "#906500",
        "brightYellow": "#8d661f",
        "blue": "#246dc3",
        "brightBlue": "#3c6ead",
        "magenta": "#8356bf",
        "brightMagenta": "#7d5eaa",
        "cyan": "#007981",
        "brightCyan": "#0b797f",
        "black": "#b4b2ad",
        "brightBlack": "#868482",
        "white": "#5c5b5b",
        "brightWhite": "#16161a"
      },
      "darkTerminal": {
        "foreground": "#16161a",
        "cursor": "#1b1b1f",
        "red": "#c83733",
        "brightRed": "#b44c44",
        "green": "#267d2e",
        "brightGreen": "#3f7941",
        "yellow": "#906500",
        "brightYellow": "#8d661f",
        "blue": "#246dc3",
        "brightBlue": "#3c6ead",
        "magenta": "#8356bf",
        "brightMagenta": "#7d5eaa",
        "cyan": "#007981",
        "brightCyan": "#0b797f",
        "black": "#b4b2ad",
        "brightBlack": "#868482",
        "white": "#5c5b5b",
        "brightWhite": "#16161a"
      },
      "typography": {
        "fontSans": '"Courier Prime", "Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
        "fontUrl": "https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=swap"
      }
    },
    "scene": {
      "engine": "summit",
      "colors": [
        "#f2efe6",
        "#1b1b1f"
      ],
      "speed": 0.5,
      "scale": 1,
      "intensity": 1,
      "density": 0.5,
      "direction": 0,
      "seed": 7,
      "invert": true,
      "svg": null,
      "finish": {
        "style": "dither",
        "pixel": 2,
        "levels": 2,
        "pattern": "bayer8"
      },
      "glass": {
        "tint": 0.6,
        "focus": 0.25
      }
    },
    "order": 16
  },
  {
    "slug": "aether-pocket",
    "label": "Pocket",
    "description": "Moonlit sea in four shades of handheld green, chunky and nostalgic",
    "appearance": "dark",
    "source": "preset",
    "created_at": 0,
    "updated_at": 0,
    "theme": {
      "name": "aether-pocket",
      "label": "Pocket",
      "description": "Moonlit sea in four shades of handheld green, chunky and nostalgic",
      "colors": {
        "background": "#0f380f",
        "foreground": "#eeefe2",
        "card": "#1b4019",
        "cardForeground": "#eeefe2",
        "muted": "#234721",
        "mutedForeground": "#9eaf95",
        "popover": "#21451f",
        "popoverForeground": "#eeefe2",
        "primary": "#9bbc0f",
        "primaryForeground": "#161616",
        "secondary": "#234912",
        "secondaryForeground": "#dbe4be",
        "accent": "#1c4311",
        "accentForeground": "#eeefe2",
        "border": "#30512c",
        "input": "#3a5936",
        "ring": "#9bbc0f",
        "midground": "#9bbc0f",
        "midgroundForeground": "#161616",
        "composerRing": "#a4c340",
        "destructive": "#ff6358",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#092909",
        "sidebarBorder": "#30512c",
        "userBubble": "#2b5013",
        "userBubbleBorder": "#406515"
      },
      "darkColors": {
        "background": "#0f380f",
        "foreground": "#eeefe2",
        "card": "#1b4019",
        "cardForeground": "#eeefe2",
        "muted": "#234721",
        "mutedForeground": "#9eaf95",
        "popover": "#21451f",
        "popoverForeground": "#eeefe2",
        "primary": "#9bbc0f",
        "primaryForeground": "#161616",
        "secondary": "#234912",
        "secondaryForeground": "#dbe4be",
        "accent": "#1c4311",
        "accentForeground": "#eeefe2",
        "border": "#30512c",
        "input": "#3a5936",
        "ring": "#9bbc0f",
        "midground": "#9bbc0f",
        "midgroundForeground": "#161616",
        "composerRing": "#a4c340",
        "destructive": "#ff6358",
        "destructiveForeground": "#161616",
        "sidebarBackground": "#092909",
        "sidebarBorder": "#30512c",
        "userBubble": "#2b5013",
        "userBubbleBorder": "#406515"
      },
      "terminal": {
        "foreground": "#eeefe2",
        "cursor": "#9bbc0f",
        "red": "#fb675d",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#446240",
        "brightBlack": "#6f8668",
        "white": "#9eaf95",
        "brightWhite": "#eeefe2"
      },
      "darkTerminal": {
        "foreground": "#eeefe2",
        "cursor": "#9bbc0f",
        "red": "#fb675d",
        "brightRed": "#f18378",
        "green": "#57ab5a",
        "brightGreen": "#83c084",
        "yellow": "#c69026",
        "brightYellow": "#d5ac68",
        "blue": "#539bf5",
        "brightBlue": "#80b5f9",
        "magenta": "#b083f0",
        "brightMagenta": "#c3a3f6",
        "cyan": "#39c5cf",
        "brightCyan": "#7ad4db",
        "black": "#446240",
        "brightBlack": "#6f8668",
        "white": "#9eaf95",
        "brightWhite": "#eeefe2"
      },
      "typography": {
        "fontSans": '"JetBrains Mono", "Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, sans-serif'
      }
    },
    "scene": {
      "engine": "moonsea",
      "colors": [
        "#0f380f",
        "#306230",
        "#8bac0f",
        "#9bbc0f"
      ],
      "speed": 0.6,
      "scale": 1,
      "intensity": 1,
      "density": 0.5,
      "direction": 0,
      "seed": 7,
      "invert": false,
      "svg": null,
      "finish": {
        "style": "dither",
        "pixel": 4,
        "levels": 0,
        "pattern": "bayer4"
      },
      "glass": {
        "tint": 0.55,
        "focus": 0.18
      }
    },
    "order": 17
  }
];
var FINISHES = [
  {
    "style": "none",
    "description": "smooth colour",
    "pixel": 2
  },
  {
    "style": "dither",
    "description": "ordered (Bayer) dithering to the scene colours, crisp pixels",
    "pixel": 3
  },
  {
    "style": "halftone",
    "description": "printed dots sized by brightness",
    "pixel": 7
  },
  {
    "style": "ascii",
    "description": "the scene drawn in text characters",
    "pixel": 12
  },
  {
    "style": "grain",
    "description": "smooth colour with film grain",
    "pixel": 2
  },
  {
    "style": "braille",
    "description": "the scene drawn in braille dots, dithered",
    "pixel": 12
  },
  {
    "style": "scanlines",
    "description": "smooth colour with scanlines",
    "pixel": 3
  },
  {
    "style": "crt",
    "description": "an old monitor: scanlines, phosphor mask, colour fringing, curved glass",
    "pixel": 3
  },
  {
    "style": "glitch",
    "description": "clean, with brief signal-loss bursts every few seconds",
    "pixel": 2
  },
  {
    "style": "pixel",
    "description": "chunky mosaic pixels without dithering",
    "pixel": 6
  }
];

// desktop-src/state.js
var SETTINGS_KEY = "settings.v1";
var SAVED_KEY = "saved.v1";
var PREVIOUS_KEY = "previous.v1";
var SEEN_PENDING_KEY = "pending-seen.v1";
var UNDO_KEY = "undo.v1";
var RECOLOURS_KEY = "recolours.v1";
var DEFAULT_SETTINGS = {
  motion: "full",
  // full | calm | still
  followReducedMotion: true,
  pauseUnfocused: false,
  pointer: true,
  // false keeps meaning Off (older saves)
  pointerMode: "auto",
  // auto | lens | ripples | well | repel | wind | off: how the scene reacts to the pointer
  strength: "balanced",
  // calm | balanced | vivid: how much the glass veil covers the scene
  quality: "balanced",
  // battery | balanced | high
  toast: true
};
var presetMap = Object.fromEntries(PRESETS.map((r) => [r.slug, r]));
var $saved = sdk.atom({});
var $settings = sdk.atom({ ...DEFAULT_SETTINGS });
var $themeName = sdk.atom("");
var $paintedName = sdk.atom("");
var $agentHalf = sdk.atom(null);
var $editing = sdk.atom("");
var $themeList = sdk.atom([]);
var $community = sdk.atom({ themes: {}, plugins: {} });
var $recolours = sdk.atom({});
var $recolouring = sdk.atom(null);
function openEditor(slug) {
  $editing.set(typeof slug === "string" ? slug : "");
}
function closeEditor() {
  $editing.set("");
}
var $catalog = sdk.computed($saved, (saved) => ({ ...presetMap, ...saved }));
var $active = sdk.computed([$catalog, $paintedName], (catalog, name) => catalog[name] || null);
var storage = null;
function bindStorage(ctxStorage) {
  storage = ctxStorage;
  const settings = storage.get(SETTINGS_KEY, null);
  $settings.set({ ...DEFAULT_SETTINGS, ...settings && typeof settings === "object" ? settings : {} });
  const saved = storage.get(SAVED_KEY, {});
  $saved.set(saved && typeof saved === "object" ? sanitizeSaved(saved) : {});
  const recolours = storage.get(RECOLOURS_KEY, {});
  $recolours.set(recolours && typeof recolours === "object" ? sanitizeRecolours(recolours) : {});
}
var ACCENT_NAME = /^(.+)-accent-([0-9a-f]{6})$/;
function accentParts(name) {
  const match = ACCENT_NAME.exec(typeof name === "string" ? name : "");
  return match ? { base: match[1], hex: `#${match[2]}` } : null;
}
function isRecolour(theme) {
  const parts = theme && accentParts(theme.name);
  const colors = theme && theme.colors;
  return Boolean(parts) && theme.accentOf === parts.base && typeof theme.label === "string" && colors && ["background", "foreground", "primary"].every((key) => typeof colors[key] === "string");
}
function sanitizeRecolours(map) {
  const out = {};
  for (const [name, theme] of Object.entries(map)) if (isRecolour(theme) && theme.name === name) out[name] = theme;
  return out;
}
function rememberRecolour(theme) {
  if (!isRecolour(theme)) return false;
  const next = { ...$recolours.get(), [theme.name]: theme };
  $recolours.set(next);
  if (storage) storage.set(RECOLOURS_KEY, next);
  return true;
}
function forgetRecolour(name) {
  const next = { ...$recolours.get() };
  if (!next[name]) return;
  delete next[name];
  $recolours.set(next);
  if (storage) storage.set(RECOLOURS_KEY, next);
}
function isRecord(r) {
  return r && typeof r === "object" && typeof r.slug === "string" && r.slug.startsWith("aether-") && r.theme && r.theme.colors && r.scene && typeof r.scene.engine === "string";
}
function sanitizeSaved(saved) {
  const out = {};
  for (const [slug, r] of Object.entries(saved)) if (isRecord(r) && !presetMap[slug]) out[slug] = r;
  return out;
}
function updateSettings(patch) {
  const next = { ...$settings.get(), ...patch };
  $settings.set(next);
  if (storage) storage.set(SETTINGS_KEY, next);
}
function rememberRecords(records) {
  const next = { ...$saved.get() };
  let changed = false;
  for (const r of records || []) {
    if (!isRecord(r) || presetMap[r.slug]) continue;
    const prev = next[r.slug];
    if (!prev || prev.updated_at !== r.updated_at) {
      next[r.slug] = r;
      changed = true;
    }
  }
  if (changed) {
    $saved.set(next);
    if (storage) storage.set(SAVED_KEY, next);
  }
  return changed;
}
function forgetRecord(slug) {
  const next = { ...$saved.get() };
  if (!next[slug]) return;
  delete next[slug];
  $saved.set(next);
  if (storage) storage.set(SAVED_KEY, next);
}
function isAetherName(name) {
  return typeof name === "string" && Boolean($catalog.get()[name]);
}
function previousTheme() {
  return storage && storage.get(PREVIOUS_KEY, "") || "";
}
function setPreviousTheme(name) {
  if (storage && name && !isAetherName(name)) storage.set(PREVIOUS_KEY, name);
}
function rememberReplaced(slug, replaced) {
  if (!storage || !slug || !replaced || replaced === slug) return;
  const map = storage.get(UNDO_KEY, {});
  const next = { ...map && typeof map === "object" ? map : {}, [slug]: replaced };
  const keys = Object.keys(next);
  for (const key of keys.slice(0, Math.max(0, keys.length - 60))) delete next[key];
  storage.set(UNDO_KEY, next);
}
function undoTarget(slug) {
  const map = storage && storage.get(UNDO_KEY, {}) || {};
  const target = map[slug];
  return target && target !== slug && target || previousTheme() || "nous";
}
function seenPending(id) {
  const seen = storage && storage.get(SEEN_PENDING_KEY, []) || [];
  return Array.isArray(seen) && seen.includes(id);
}
function markPendingSeen(id) {
  if (!storage) return;
  const seen = storage.get(SEEN_PENDING_KEY, []);
  const next = [...Array.isArray(seen) ? seen : [], id].slice(-20);
  storage.set(SEEN_PENDING_KEY, next);
}
function reducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}
function effectiveMotion(settings) {
  if (settings.followReducedMotion && reducedMotion()) return "still";
  return settings.motion;
}
var QUALITY = {
  battery: { fps: 12, scale: 0.35 },
  balanced: { fps: 24, scale: 0.5 },
  high: { fps: 30, scale: 0.75 }
};

// desktop-src/backdrop.js
var LAYER_ID = "aether-backdrop";
var STYLE_ID = "aether-backdrop-style";
var ATTR = "data-aether-backdrop";
var STILL_TIME = 23.7;
var STRENGTH = {
  calm: { tint: 1.18, focus: 1.6 },
  balanced: { tint: 1, focus: 1 },
  vivid: { tint: 0.7, focus: 0 }
};
var CSS = `
:root[${ATTR}] {
  background-color: transparent !important;
  --ui-chat-surface-background: transparent;
  --ui-sidebar-surface-background: transparent;
  --ui-editor-surface-background: transparent;
  --ui-terminal-surface-background: var(--ui-bg-chrome);
}
:root[${ATTR}] body { background: transparent !important; }
:root[${ATTR}] [data-contrib-shell],
:root[${ATTR}] :has([data-contrib-shell]) { background-color: transparent !important; }
:root[${ATTR}] [data-glass-opaque] {
  --ui-chat-surface-background: var(--ui-bg-chrome);
  --ui-editor-surface-background: var(--ui-bg-chrome);
  --ui-sidebar-surface-background: var(--ui-bg-sidebar);
}
:root[${ATTR}] [data-glass-raised] {
  --ui-chat-surface-background: color-mix(in srgb, var(--ui-bg-chrome) 94%, transparent);
  --ui-sidebar-surface-background: color-mix(in srgb, var(--ui-bg-sidebar) 94%, transparent);
  --ui-editor-surface-background: var(--ui-bg-chrome);
}
#${LAYER_ID} {
  position: fixed; inset: 0; z-index: -1; pointer-events: none; overflow: hidden; contain: strict;
  background: var(--ui-bg-chrome);
}
#${LAYER_ID} > .aether-scene {
  position: absolute; inset: 0; width: 100%; height: 100%; display: block; object-fit: cover;
  opacity: 0; transition: opacity 600ms cubic-bezier(0.22, 1, 0.36, 1);
}
#${LAYER_ID} > .aether-scene[data-ready] { opacity: 1; }
#${LAYER_ID} > .aether-scene[data-leaving] { transition: none; }
#${LAYER_ID} > canvas.aether-scene[data-crisp] { image-rendering: pixelated; }
#${LAYER_ID} > .aether-veil {
  position: absolute; inset: 0;
  /* Calm edges for the title bar and status bar (small, dimmer text), the focus area behind the
     conversation column, then the even veil the readability floor is computed against. */
  background:
    linear-gradient(to bottom, color-mix(in srgb, var(--ui-bg-chrome) 70%, transparent) 0, transparent 56px),
    linear-gradient(to top, color-mix(in srgb, var(--ui-bg-chrome) 82%, transparent) 0, transparent 64px),
    radial-gradient(ellipse 62% 78% at 52% 54%,
      color-mix(in srgb, var(--ui-bg-chrome) var(--aether-focus, 30%), transparent), transparent 72%),
    color-mix(in srgb, var(--ui-bg-chrome) var(--aether-tint, 60%), transparent);
  transition: background 400ms ease;
}
@media (prefers-reduced-motion: reduce) {
  #${LAYER_ID} > .aether-scene { transition: none; }
}
`;
var Backdrop = class {
  constructor() {
    this.record = null;
    this.key = "";
    this.layer = null;
    this.style = null;
    this.scene = null;
    this.renderer = null;
    this.loop = null;
    this.time = STILL_TIME;
    this.lastNow = 0;
    this.settings = null;
    this.ctx = null;
    this.offResize = null;
    this.offPointer = null;
    this.offClick = null;
    this.mode = -1;
    this.clicksOn = false;
    this.onResize = () => this.resize();
    this.pointerTarget = { x: -1, y: -1, at: 0 };
    this.pointerNow = { x: -1, y: -1, s: 0, vx: 0, vy: 0 };
    this.clickX = new Float32Array(CLICK_SLOTS);
    this.clickY = new Float32Array(CLICK_SLOTS);
    this.clickAt = new Float64Array(CLICK_SLOTS);
    this.clickNext = 0;
    this.onClick = (event) => {
      if (!this.clicksOn) return;
      const i = this.clickNext;
      this.clickNext = (i + 1) % CLICK_SLOTS;
      this.clickX[i] = event.clientX;
      this.clickY[i] = event.clientY;
      this.clickAt[i] = performance.now();
    };
    this.onPointer = (event) => {
      this.pointerTarget = { x: event.clientX, y: event.clientY, at: performance.now() };
      if (this.pointerNow.x < 0) this.pointerNow = { x: event.clientX, y: event.clientY, s: 0, vx: 0, vy: 0 };
    };
  }
  /** Listeners and timers go through ctx so the plugin host retires them on unload. */
  attach(ctx) {
    this.ctx = ctx;
  }
  show(record, settings) {
    const key = `${record.slug}:${record.updated_at}:${JSON.stringify(settings)}`;
    if (key === this.key && this.layer) return;
    const sceneChanged = !this.record || this.record.slug !== record.slug || this.record.updated_at !== record.updated_at;
    this.key = key;
    this.record = record;
    this.settings = settings;
    this.mount();
    const glass = record.scene.glass || {};
    const strength = STRENGTH[settings.strength] || STRENGTH.balanced;
    const tint = Math.min(0.95, (glass.tint ?? 0.6) * strength.tint);
    const focus = Math.min(0.9, (glass.focus ?? 0.3) * strength.focus);
    this.layer.style.setProperty("--aether-tint", `${Math.round(tint * 100)}%`);
    this.layer.style.setProperty("--aether-focus", `${Math.round(focus * 100)}%`);
    if (sceneChanged || !this.scene) this.buildScene(record.scene);
    this.mode = modeIndex(settings, record.scene.engine);
    this.clicksOn = this.mode >= 0 && settings.quality !== "battery";
    if (!this.clicksOn) this.clickAt.fill(0);
    this.restartLoop();
  }
  mount() {
    if (!this.style || !this.style.isConnected) {
      this.style = document.createElement("style");
      this.style.id = STYLE_ID;
      this.style.textContent = CSS;
      document.head.appendChild(this.style);
    }
    if (!this.layer || !this.layer.isConnected) {
      this.layer = document.createElement("div");
      this.layer.id = LAYER_ID;
      this.layer.setAttribute("aria-hidden", "true");
      const veil = document.createElement("div");
      veil.className = "aether-veil";
      this.layer.append(veil);
      document.body.prepend(this.layer);
      this.offResize = this.ctx ? this.ctx.addEventListener(window, "resize", this.onResize) : null;
      this.offPointer = this.ctx ? this.ctx.addEventListener(window, "pointermove", this.onPointer, { passive: true }) : null;
      this.offClick = this.ctx ? this.ctx.addEventListener(window, "pointerdown", this.onClick, { passive: true, capture: true }) : null;
    }
    document.documentElement.setAttribute(ATTR, "");
  }
  buildScene(scene) {
    this.retireScene();
    const finish = scene.finish && scene.finish.style || "none";
    let node;
    if (scene.engine === "svg" && finish === "none" && svgLooksSafe(scene.svg)) {
      node = document.createElement("img");
      node.alt = "";
      node.decoding = "async";
      node.onload = () => node.setAttribute("data-ready", "");
      node.src = svgDataUrl(scene.svg);
    } else {
      node = document.createElement("canvas");
      const renderer = new SceneRenderer(node);
      if (renderer.ok) {
        try {
          renderer.setScene(scene);
          this.renderer = renderer;
        } catch (error) {
          console.warn("[aether] scene failed to compile, using a gradient", error);
          renderer.dispose();
        }
      }
      if (!this.renderer) {
        node = document.createElement("div");
        node.style.background = cssFallback(scene);
        node.setAttribute("data-ready", "");
      } else if (finish === "dither" || finish === "pixel") {
        node.setAttribute("data-crisp", "");
      }
    }
    node.className = "aether-scene";
    this.layer.insertBefore(node, this.layer.querySelector(".aether-veil"));
    this.scene = node;
    this.time = STILL_TIME;
    this.resize();
  }
  resize() {
    if (!this.renderer || !this.settings) return;
    const q = QUALITY[this.settings.quality] || QUALITY.balanced;
    this.renderer.resize(window.innerWidth, window.innerHeight, q.scale);
    this.paintOnce();
  }
  paintOnce() {
    if (this.renderer && this.renderer.draw(this.time)) this.scene.setAttribute("data-ready", "");
  }
  restartLoop() {
    if (this.loop) this.loop.dispose();
    this.loop = null;
    if (!this.renderer) return;
    const motion = effectiveMotion(this.settings);
    const q = QUALITY[this.settings.quality] || QUALITY.balanced;
    const speed = (this.record.scene.speed ?? 1) * (motion === "calm" ? 0.45 : 1);
    if (motion === "still" || speed === 0) {
      this.paintOnce();
      if (this.record.scene.engine === "svg" && this.ctx) this.ctx.setTimeout(() => this.paintOnce(), 300);
      return;
    }
    const fps = motion === "calm" ? Math.min(15, q.fps) : q.fps;
    this.lastNow = 0;
    this.loop = makeLoop((now) => {
      const dt = this.lastNow ? Math.min(0.25, (now - this.lastNow) / 1e3) : 0;
      this.lastNow = now;
      this.time += dt * speed;
      this.stepPointer(dt);
      if (this.renderer && this.renderer.draw(this.time)) this.scene.setAttribute("data-ready", "");
    }, fps, Boolean(this.settings.pauseUnfocused));
  }
  /** Hand the current scene off to fade out under the new one, then free it. */
  retireScene() {
    if (this.loop) this.loop.dispose();
    this.loop = null;
    const node = this.scene;
    const renderer = this.renderer;
    this.scene = null;
    this.renderer = null;
    if (!node) return;
    node.setAttribute("data-leaving", "");
    const free = () => {
      node.remove();
      if (renderer) renderer.dispose();
    };
    if (this.ctx) this.ctx.setTimeout(free, 900);
    else free();
  }
  stepPointer(dt) {
    if (!this.renderer) return;
    const now = performance.now();
    const enabled = this.mode >= 0;
    const fresh = now - this.pointerTarget.at < 2200;
    const want = enabled && fresh && this.pointerTarget.x >= 0 ? 1 : 0;
    const p = this.pointerNow;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const px = p.x;
    const py = p.y;
    p.x += (this.pointerTarget.x - p.x) * 0.14;
    p.y += (this.pointerTarget.y - p.y) * 0.14;
    p.s += (want - p.s) * (want ? 0.08 : 0.03);
    if (dt > 0 && px >= 0) {
      const k = Math.max(1, h) * dt;
      p.vx += ((p.x - px) / k - p.vx) * 0.3;
      p.vy += (-(p.y - py) / k - p.vy) * 0.3;
      const m = Math.hypot(p.vx, p.vy);
      if (m > 1.4) {
        p.vx *= 1.4 / m;
        p.vy *= 1.4 / m;
      }
    }
    this.renderer.setPointer(p.x, p.y, p.s < 2e-3 ? 0 : p.s, w, h);
    this.renderer.setInteraction(this.mode, p.vx, p.vy);
    for (let i = 0; i < CLICK_SLOTS; i++) {
      const at = this.clickAt[i];
      this.renderer.setClick(i, this.clickX[i], this.clickY[i], at ? (now - at) / 1e3 : 99, w, h);
    }
  }
  disposeScene() {
    if (this.loop) this.loop.dispose();
    this.loop = null;
    if (this.renderer) this.renderer.dispose();
    this.renderer = null;
    if (this.scene) this.scene.remove();
    this.scene = null;
  }
  hide() {
    this.disposeScene();
    if (this.layer) this.layer.remove();
    if (this.style) this.style.remove();
    if (this.offResize) this.offResize();
    if (this.offPointer) this.offPointer();
    if (this.offClick) this.offClick();
    document.documentElement.removeAttribute(ATTR);
    this.offResize = null;
    this.offPointer = null;
    this.offClick = null;
    this.layer = null;
    this.style = null;
    this.record = null;
    this.key = "";
  }
};
var backdrop = new Backdrop();

// desktop-src/sync.js
var PLUGIN_ID = "aether";
var registered = /* @__PURE__ */ new Map();
var ctxRef = null;
function bindSync(ctx) {
  ctxRef = ctx;
}
function later(fn, ms) {
  return ctxRef ? ctxRef.setTimeout(fn, ms) : () => {
  };
}
function registerThemes(catalog) {
  if (!ctxRef) return;
  for (const [slug, record] of Object.entries(catalog)) {
    const seen = registered.get(slug);
    if (seen && seen.updated_at === record.updated_at) continue;
    if (seen) seen.dispose();
    const dispose = ctxRef.register({ id: `theme-${slug}`, area: sdk.THEMES_AREA, data: record.theme });
    registered.set(slug, { updated_at: record.updated_at, dispose });
  }
  for (const [slug, entry] of registered) {
    if (!catalog[slug]) {
      entry.dispose();
      registered.delete(slug);
    }
  }
}
function request(name, theme, attempt = 0) {
  if (sdk.requestTheme(name)) return true;
  if (attempt < 8 && ctxRef) ctxRef.setTimeout(() => request(name, theme, attempt + 1), 40);
  return false;
}
function applyRecord(record, { origin = "user", toast = true } = {}) {
  if (!record || !record.slug) return;
  const current = $themeName.get();
  if (current && !isAetherName(current)) setPreviousTheme(current);
  if (current && current !== record.slug) rememberReplaced(record.slug, current);
  rememberRecords([record]);
  registerThemes($catalog.get());
  request(record.slug);
  if (toast && $settings.get().toast && origin !== "user") {
    const back = undoTarget(record.slug);
    sdk.host.notify({
      kind: "info",
      icon: "sparkle",
      title: "Aether",
      message: `${record.label} is on`,
      meta: record.description,
      durationMs: 7e3,
      action: { label: "Undo", onClick: () => request(back) },
      secondaryAction: { label: "Gallery", onClick: () => sdk.host.navigate("/aether") }
    });
  }
}
function undo(slug) {
  request(undoTarget(slug));
}
function turnOff() {
  const back = previousTheme() || "nous";
  if (isAetherName($themeName.get())) request(back);
}
async function deleteSaved(slug) {
  if (!slug || !$catalog.get()[slug] || $catalog.get()[slug].source === "preset") return;
  if ($themeName.get() === slug) turnOff();
  forgetRecord(slug);
  registerThemes($catalog.get());
  try {
    await sdk.host.request(`plugin.${PLUGIN_ID}.delete`, { slug });
  } catch {
  }
}
function previewColours(params) {
  return sdk.host.request(`plugin.${PLUGIN_ID}.preview`, params);
}
async function saveColours(params) {
  const out = await sdk.host.request(`plugin.${PLUGIN_ID}.save`, params);
  if (out && out.ok && out.record) applyRecord(out.record, { origin: "editor" });
  return out;
}
function handleEvent(event) {
  const payload = event && event.payload || {};
  if (payload.action === "apply" && payload.record) applyRecord(payload.record, { origin: payload.origin || "agent" });
  else if (payload.action === "off") turnOff();
}
var syncing = null;
var retryCtx = null;
var retries = 0;
var MAX_RETRIES = 6;
function sync() {
  if (syncing) return syncing;
  syncing = (async () => {
    try {
      const state = await sdk.host.request(`plugin.${PLUGIN_ID}.state`, {});
      $agentHalf.set(true);
      retries = 0;
      if (state && Array.isArray(state.themes)) {
        rememberRecords(state.themes);
        registerThemes($catalog.get());
      }
      const pending2 = state && state.pending;
      if (pending2 && pending2.id && !seenPending(pending2.id)) {
        markPendingSeen(pending2.id);
        if (pending2.action === "off") turnOff();
        else if (pending2.slug && $catalog.get()[pending2.slug]) applyRecord($catalog.get()[pending2.slug], { origin: "pending" });
        sdk.host.request(`plugin.${PLUGIN_ID}.ack`, { id: pending2.id }).catch(() => {
        });
      }
    } catch {
      $agentHalf.set(false);
      if (retryCtx && retries < MAX_RETRIES) {
        retries += 1;
        retryCtx.setTimeout(() => sync(), 700 * retries);
      }
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}
function wireSync(ctx) {
  retryCtx = ctx;
  retries = 0;
  ctx.onEvent(`plugin.${PLUGIN_ID}.theme`, handleEvent);
  ctx.onEvent("tool.complete", (event) => {
    const p = event && event.payload || {};
    const name = p.name || p.tool_name || p.tool || "";
    if (typeof name === "string" && name.startsWith("aether_")) ctx.setTimeout(() => sync(), 150);
  });
  let lastGateway = "";
  let lastProfile = "";
  const unGateway = sdk.host.state.gateway.subscribe((state) => {
    if (state === "open" && lastGateway !== "open") sync();
    lastGateway = state;
  });
  const unProfile = sdk.host.state.profile.subscribe((profile) => {
    if (lastProfile && profile !== lastProfile) sync();
    lastProfile = profile;
  });
  ctx.onDispose(unGateway);
  ctx.onDispose(unProfile);
  ctx.onDispose(() => {
    retryCtx = null;
    for (const entry of registered.values()) entry.dispose();
    registered.clear();
  });
}
function openSettings() {
  sdk.host.navigate(sdk.pluginSettingsHref ? sdk.pluginSettingsHref(PLUGIN_ID) : "/settings");
}

// desktop-src/community.js
var PLUGIN_ID2 = "aether";
var HERMES_THEMES = /* @__PURE__ */ new Set([
  "nous",
  "nous-alt",
  "github",
  "catppuccin",
  "everforest",
  "solarized",
  "classic",
  "midnight",
  "ember",
  "mono",
  "cyberpunk",
  "slate"
]);
var EMPTY = { themes: {}, plugins: {} };
var ours = (name) => HERMES_THEMES.has(name) || isAetherName(name);
function candidateNames(list) {
  const out = [];
  for (const { name } of list) {
    if (!name || ours(name)) continue;
    const parts = accentParts(name);
    if (parts && ours(parts.base)) continue;
    out.push(name);
  }
  return out;
}
var asked = "";
var pending = null;
function lookUp({ force = false } = {}) {
  if (pending) return;
  pending = later(() => {
    pending = null;
    const names = candidateNames($themeList.get());
    const key = [...names].sort().join("\n");
    if (!force && key === asked) return;
    asked = key;
    if (!names.length) {
      $community.set(EMPTY);
      return;
    }
    sdk.host.request(`plugin.${PLUGIN_ID2}.community`, { names }).then((out) => {
      if (out && out.ok) $community.set({ themes: out.themes || {}, plugins: out.plugins || {} });
    }).catch(() => {
      asked = "";
    });
  }, 250);
}
var $communityThemes = sdk.computed([$themeList, $community, $recolours], (list, community, recolours) => {
  const listed = new Map(list.map((t) => [t.name, t]));
  const bases = [];
  const variants = /* @__PURE__ */ new Map();
  for (const [name, pluginId] of Object.entries(community.themes || {})) {
    const plugin = (community.plugins || {})[pluginId];
    const theme = listed.get(name);
    if (!plugin || !theme) continue;
    const parts = accentParts(name);
    if (parts) continue;
    bases.push({ name, label: theme.label, description: theme.description, plugin });
  }
  const known = new Set(bases.map((b) => b.name));
  const addVariant = (name, label, mine) => {
    const parts = accentParts(name);
    if (!parts || !known.has(parts.base)) return;
    const row = variants.get(parts.base) || [];
    if (row.some((v) => v.name === name)) return;
    row.push({ name, label, hex: parts.hex, mine });
    variants.set(parts.base, row);
  };
  for (const theme of Object.values(recolours)) addVariant(theme.name, theme.label, true);
  for (const theme of list) addVariant(theme.name, theme.label, false);
  bases.sort((a, b) => (a.plugin.author || "").localeCompare(b.plugin.author || "") || a.label.localeCompare(b.label));
  const out = [];
  for (const base of bases) {
    out.push(base);
    for (const v of (variants.get(base.name) || []).sort((a, b) => a.label.localeCompare(b.label))) {
      out.push({ ...v, base: base.name, description: base.description, plugin: base.plugin });
    }
  }
  return out;
});
function openRecolour(name, hex = null) {
  $recolouring.set(name ? { name, hex } : null);
}
function closeRecolour() {
  $recolouring.set(null);
}
function switchTo(name) {
  request(name);
}
var registered2 = /* @__PURE__ */ new Map();
var ctxRef2 = null;
function registerRecolours() {
  if (!ctxRef2) return;
  const list = $themeList.get();
  const names = new Set(list.map((t) => t.name));
  for (const [name, theme] of Object.entries($recolours.get())) {
    const wanted = !list.length || names.has(theme.accentOf);
    const seen = registered2.get(name);
    if (seen && (!wanted || seen.theme !== theme)) {
      seen.dispose();
      registered2.delete(name);
    }
    if (wanted && !registered2.has(name)) {
      registered2.set(name, { theme, dispose: ctxRef2.register({ id: `recolour-${name}`, area: sdk.THEMES_AREA, data: theme }) });
    }
  }
  for (const [name, entry] of registered2) {
    if (!$recolours.get()[name]) {
      entry.dispose();
      registered2.delete(name);
    }
  }
}
function saveRecolour(theme) {
  if (!rememberRecolour(theme)) return false;
  registerRecolours();
  request(theme.name);
  return true;
}
function deleteRecolour(name, current) {
  const theme = $recolours.get()[name];
  if (!theme) return;
  if (current === name) request(theme.accentOf);
  forgetRecolour(name);
  registerRecolours();
}
function refreshFromBase(painted, baseName2) {
  if (!painted || painted.accentOf) return;
  const next = {};
  let changed = false;
  for (const [name, theme] of Object.entries($recolours.get())) {
    if (theme.accentOf !== baseName2) continue;
    const fresh = { ...theme };
    for (const key of ["customCSS", "typography", "terminal", "darkTerminal"]) {
      if (painted[key] === void 0) delete fresh[key];
      else fresh[key] = painted[key];
    }
    if (JSON.stringify(fresh) !== JSON.stringify(theme)) {
      next[name] = fresh;
      changed = true;
    }
  }
  if (changed) for (const theme of Object.values(next)) rememberRecolour(theme);
}
function openCreator(url) {
  if (ctxRef2 && ctxRef2.os && typeof ctxRef2.os.openExternal === "function" && /^https:\/\//.test(url)) {
    ctxRef2.os.openExternal(url);
  }
}
function wireCommunity(ctx) {
  ctxRef2 = ctx;
  registerRecolours();
  const unList = $themeList.subscribe(() => {
    registerRecolours();
    lookUp();
  });
  const unRecolours = $recolours.subscribe(() => registerRecolours());
  const unAgent = $agentHalf.subscribe((on) => {
    if (on) lookUp({ force: true });
  });
  ctx.onDispose(unList);
  ctx.onDispose(unRecolours);
  ctx.onDispose(unAgent);
  ctx.onDispose(() => {
    if (sdk.setAccentOverride) sdk.setAccentOverride(null);
    for (const entry of registered2.values()) entry.dispose();
    registered2.clear();
    ctxRef2 = null;
  });
}

// desktop-src/ui/preview.jsx
import { useEffect, useRef, useState } from "react";
import { jsx } from "react/jsx-runtime";
var STILL_TIME2 = 23.7;
var shared = null;
function sharedRenderer() {
  if (shared && shared.ok) return shared;
  shared = new SceneRenderer(document.createElement("canvas"));
  return shared;
}
function previewScene(scene) {
  const finish = { ...scene.finish || {} };
  const px = finish.pixel || 1;
  if (finish.style === "dither" || finish.style === "pixel") finish.pixel = Math.max(1, Math.round(px * 0.67));
  if (finish.style === "halftone") finish.pixel = Math.max(4, Math.round(px * 0.7));
  if (finish.style === "ascii") finish.pixel = Math.max(7, Math.round(px * 0.62));
  if (finish.style === "scanlines") finish.pixel = Math.max(2, Math.round(px * 0.7));
  return { ...scene, finish };
}
var svgImages = /* @__PURE__ */ new Map();
function svgImage(svg, onReady) {
  if (!svgLooksSafe(svg)) return null;
  let img = svgImages.get(svg);
  if (!img) {
    img = new Image();
    img.decoding = "async";
    img.src = svgDataUrl(svg);
    svgImages.set(svg, img);
  }
  if (!img.complete) img.addEventListener("load", onReady, { once: true });
  return img;
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function paintMock(g, w, h, record) {
  const c = record.theme.colors;
  const glass = record.scene.glass || {};
  const tint = glass.tint ?? 0.6;
  g.globalAlpha = tint;
  g.fillStyle = c.background;
  g.fillRect(0, 0, w, h);
  const focus = glass.focus ?? 0.3;
  const grad = g.createRadialGradient(w * 0.56, h * 0.54, 0, w * 0.56, h * 0.54, Math.max(w, h) * 0.5);
  grad.addColorStop(0, c.background);
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.globalAlpha = focus;
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 1;
  const u = h / 100;
  const side = w * 0.22;
  g.fillStyle = c.border;
  g.fillRect(side, 0, Math.max(1, u * 0.25), h);
  g.fillStyle = c.mutedForeground;
  for (let i = 0; i < 6; i++) {
    g.globalAlpha = i === 1 ? 1 : 0.7;
    roundRect(g, side * 0.14, u * (14 + i * 9), side * (0.5 + i * 37 % 30 / 100), u * 2.6, u * 1.2);
    g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = c.primary;
  roundRect(g, side * 0.08, u * 21.5, u * 1.1, u * 5.6, u * 0.5);
  g.fill();
  const col = side + (w - side) * 0.12;
  const colW = (w - side) * 0.76;
  g.fillStyle = c.userBubble;
  roundRect(g, col + colW * 0.45, u * 12, colW * 0.55, u * 11, u * 3);
  g.fill();
  g.strokeStyle = c.userBubbleBorder;
  g.lineWidth = Math.max(1, u * 0.25);
  g.stroke();
  g.fillStyle = c.foreground;
  roundRect(g, col + colW * 0.5, u * 16.2, colW * 0.4, u * 2.6, u * 1.2);
  g.fill();
  for (let i = 0; i < 4; i++) {
    g.globalAlpha = 0.92;
    roundRect(g, col, u * (32 + i * 7.5), colW * [0.92, 0.84, 0.95, 0.55][i], u * 2.8, u * 1.3);
    g.fill();
  }
  g.globalAlpha = 1;
  g.fillStyle = c.primary;
  roundRect(g, col, u * 63, colW * 0.18, u * 2.8, u * 1.3);
  g.fill();
  g.fillStyle = c.card;
  roundRect(g, col, h - u * 20, colW, u * 13, u * 3.5);
  g.fill();
  g.strokeStyle = c.border;
  g.stroke();
  g.fillStyle = c.mutedForeground;
  roundRect(g, col + u * 3, h - u * 15.5, colW * 0.35, u * 2.6, u * 1.2);
  g.fill();
  g.fillStyle = c.primary;
  g.beginPath();
  g.arc(col + colW - u * 6, h - u * 13.5, u * 3, 0, Math.PI * 2);
  g.fill();
}
function draw(canvas, record, time, mock, onSvgReady) {
  const g = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const scene = previewScene(record.scene);
  g.imageSmoothingEnabled = !["dither", "pixel", "halftone", "ascii"].includes(scene.finish.style);
  g.fillStyle = record.theme.colors.background;
  g.fillRect(0, 0, w, h);
  if (scene.engine === "svg" && scene.finish.style === "none") {
    const img = svgImage(scene.svg, onSvgReady);
    if (img && img.complete && img.naturalWidth) {
      const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
      g.drawImage(img, (w - img.naturalWidth * s) / 2, (h - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
    }
  } else {
    const r = sharedRenderer();
    if (r.ok) {
      try {
        r.setScene(scene);
        r.resize(w, h, 0.75);
        if (r.draw(time)) g.drawImage(r.canvas, 0, 0, w, h);
      } catch (error) {
        console.warn("[aether] preview failed", error);
      }
    }
  }
  if (mock) paintMock(g, w, h, record);
}
function ScenePreview({ record, animate = false, mock = true, ratio = 0.625, className, style }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return void 0;
    const observer = new ResizeObserver((entries) => setWidth(Math.round(entries[0].contentRect.width)));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !width || !record) return void 0;
    canvas.width = width;
    canvas.height = Math.round(width * ratio);
    let time = STILL_TIME2;
    const repaint = () => draw(canvas, record, time, mock, repaint);
    repaint();
    if (!animate || !record.scene.speed) return void 0;
    let last = 0;
    const loop = makeLoop((now) => {
      const dt = last ? Math.min(0.25, (now - last) / 1e3) : 0;
      last = now;
      time += dt * record.scene.speed;
      repaint();
    }, 24, false);
    return () => loop.dispose();
  }, [record, animate, mock, width, ratio]);
  return /* @__PURE__ */ jsx("canvas", { "aria-hidden": true, className, ref, style: { display: "block", width: "100%", aspectRatio: `${1 / ratio}`, ...style } });
}

// desktop-src/ui/styles.js
import { jsx as jsx2 } from "react/jsx-runtime";
var CSS2 = `
.ae-page { height: 100%; overflow: auto; color: var(--ui-text-primary); }
.ae-wrap { max-width: 1120px; margin: 0 auto; padding: 28px 28px 48px; display: flex; flex-direction: column; gap: 28px; }
.ae-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.ae-title { font-size: 1.5rem; font-weight: 650; letter-spacing: -0.01em; margin: 0; }
.ae-sub { margin: 6px 0 0; color: var(--ui-text-secondary); font-size: 0.875rem; max-width: 60ch; line-height: 1.5; }
.ae-head-side { display: flex; align-items: center; gap: 12px; }
.ae-note { margin: -4px 0 0; font-size: 0.8125rem; line-height: 1.5; color: var(--ui-text-secondary); max-width: 72ch; }
.ae-shot { position: relative; display: block; width: 100%; aspect-ratio: 1.6; overflow: hidden; background: var(--ui-bg-quaternary); }
.ae-shot > img { display: block; width: 100%; height: 100%; object-fit: cover; }
.ae-shot-mark { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  font-size: 2.25rem; font-weight: 600; color: var(--ui-text-quaternary); }
.ae-shot-accent { position: absolute; left: 8px; bottom: 8px; display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px 3px 4px;
  border-radius: 99px; font-size: 0.6875rem; font-weight: 600; color: var(--ui-text-primary);
  background: color-mix(in srgb, var(--ui-bg-chrome) 86%, transparent); box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); }
.ae-shot-dot { width: 14px; height: 14px; border-radius: 99px; box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.35); }
.ae-card-by { font-size: 0.75rem; color: var(--ui-text-tertiary); }
.ae-pop-settings { align-self: flex-start; }
.ae-rc-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.ae-rc-exp { font-size: 0.6875rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; line-height: 1;
  padding: 4px 8px; border-radius: 99px; color: var(--ui-text-secondary); background: var(--ui-bg-quaternary);
  box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); }
.ae-rc { display: flex; flex-direction: column; gap: 16px; width: min(440px, 84vw); text-align: left; }
.ae-rc-swatches { display: flex; flex-wrap: wrap; gap: 10px; }
.ae-rc-sw { width: 32px; height: 32px; border-radius: 99px; border: 0; cursor: pointer; padding: 0;
  box-shadow: inset 0 0 0 1px rgb(127 127 127 / 0.45); transition: transform 120ms ease; }
.ae-rc-sw:hover { transform: scale(1.08); }
.ae-rc-sw[data-on] { box-shadow: 0 0 0 2px var(--ui-bg-elevated), 0 0 0 4px var(--ui-text-primary); }
.ae-rc-sw:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 3px; }
.ae-rc-custom { display: flex; flex-direction: column; gap: 6px; }
.ae-rc-sample { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border-radius: 12px;
  background: var(--ui-bg-quaternary); font-size: 0.8125rem; }
.ae-rc-btn { padding: 5px 12px; border-radius: 8px; font-weight: 600; background: var(--ui-accent); color: var(--dt-midground-foreground, #fff); }
.ae-rc-link { color: var(--ui-accent); text-decoration: underline; text-underline-offset: 3px; }
.ae-status { display: inline-flex; align-items: center; gap: 6px; font-size: 0.75rem; color: var(--ui-text-tertiary); }
.ae-dot { width: 7px; height: 7px; border-radius: 99px; background: var(--ui-text-quaternary); }
.ae-dot[data-on] { background: var(--ui-accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--ui-accent) 22%, transparent); }
.ae-ask { display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 14px;
  background: var(--ui-bg-elevated); box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); }
.ae-ask-row { display: flex; gap: 10px; align-items: stretch; }
.ae-ask-row > textarea { flex: 1; min-height: 44px; resize: none; }
.ae-ideas { display: flex; flex-wrap: wrap; gap: 6px; }
.ae-idea { font-size: 0.75rem; padding: 4px 10px; border-radius: 99px; cursor: pointer; border: 0;
  background: var(--ui-bg-quaternary); color: var(--ui-text-secondary); }
.ae-idea:hover { color: var(--ui-text-primary); }
.ae-section { display: flex; flex-direction: column; gap: 12px; }
.ae-section-head { display: flex; align-items: baseline; justify-content: space-between; }
.ae-h2 { margin: 0; font-size: 0.8125rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ui-text-tertiary); }
.ae-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 16px; }
.ae-card { position: relative; display: flex; flex-direction: column; text-align: left; padding: 0; cursor: pointer;
  border: 0; border-radius: 14px; overflow: hidden; background: var(--ui-bg-elevated); color: inherit;
  box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); transition: transform 160ms ease, box-shadow 160ms ease; }
.ae-card:hover { transform: translateY(-2px); box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary), 0 10px 28px -14px rgb(0 0 0 / 0.5); }
.ae-card:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
.ae-card[data-active] { box-shadow: inset 0 0 0 2px var(--ui-accent); }
.ae-card-body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 4px; }
.ae-card-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-weight: 600; font-size: 0.875rem; }
.ae-card-desc { font-size: 0.75rem; line-height: 1.4; color: var(--ui-text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.ae-tags { display: flex; gap: 4px; margin-top: 4px; flex-wrap: wrap; }
.ae-tag { font-size: 0.6875rem; padding: 1px 7px; border-radius: 99px; background: var(--ui-bg-quaternary); color: var(--ui-text-tertiary); }
.ae-on { font-size: 0.6875rem; font-weight: 600; padding: 1px 8px; border-radius: 99px; background: var(--ui-accent); color: var(--dt-midground-foreground, #fff); }
.ae-cardwrap { position: relative; display: flex; flex-direction: column; }
.ae-cardwrap > .ae-card { flex: 1; }
.ae-card-actions { position: absolute; top: 8px; right: 8px; display: flex; gap: 4px; opacity: 0; transition: opacity 120ms ease; }
.ae-cardwrap:hover .ae-card-actions, .ae-cardwrap:focus-within .ae-card-actions { opacity: 1; }
.ae-act { width: 26px; height: 26px; border-radius: 8px; border: 0; cursor: pointer; display: inline-flex; align-items: center;
  justify-content: center; background: color-mix(in srgb, var(--ui-bg-chrome) 82%, transparent); color: var(--ui-text-secondary);
  box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); }
.ae-act:hover { color: var(--ui-text-primary); }
.ae-empty { font-size: 0.8125rem; color: var(--ui-text-tertiary); padding: 6px 0; }
.ae-foot { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; font-size: 0.75rem; color: var(--ui-text-tertiary); }
.ae-settings { display: flex; flex-direction: column; gap: 4px; }
.ae-inline { display: flex; flex-direction: column; gap: 10px; max-width: 560px; margin: 6px 0; padding: 12px; border-radius: 14px;
  background: var(--ui-widget-surface-background, var(--ui-bg-elevated)); box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); }
.ae-inline-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ae-inline canvas { border-radius: 10px; }
.ae-chip { display: inline-flex; align-items: center; gap: 6px; height: 100%; padding: 0 6px; border: 0; background: transparent;
  color: var(--ui-text-tertiary); font-size: 0.6875rem; cursor: pointer; }
.ae-chip:hover { color: var(--ui-text-primary); }
.ae-pop { display: flex; flex-direction: column; gap: 10px; width: 260px; padding: 4px; }
.ae-pop-title { font-weight: 600; font-size: 0.8125rem; }
.ae-ed { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; width: min(680px, 84vw); text-align: left; }
.ae-ed-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.ae-ed-side canvas { border-radius: 10px; box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); }
.ae-ed-notes { display: flex; flex-direction: column; gap: 6px; min-height: 2.5em; }
.ae-ed-note { font-size: 0.75rem; line-height: 1.45; color: var(--ui-text-secondary); padding: 6px 9px; border-radius: 8px;
  background: var(--ui-bg-quaternary); }
.ae-ed-note[data-tone="ok"], .ae-ed-note[data-tone="quiet"] { background: transparent; padding: 0; color: var(--ui-text-tertiary); }
.ae-ed-note[data-tone="error"] { color: var(--ui-text-primary); box-shadow: inset 2px 0 0 var(--destructive, #cf222e); }
.ae-ed-fields { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.ae-ed-name { display: flex; flex-direction: column; gap: 6px; }
.ae-ed-group { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; border: 0; min-width: 0; }
.ae-ed-group > button { align-self: flex-start; }
.ae-ed-legend { font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ui-text-tertiary); padding: 0; margin-bottom: 2px; }
.ae-sw { display: grid; grid-template-columns: 28px minmax(0, 1fr) 84px 22px; align-items: center; gap: 8px; }
.ae-sw-pick { width: 28px; height: 28px; padding: 0; border: 0; border-radius: 8px; cursor: pointer; background: transparent;
  box-shadow: inset 0 0 0 1px var(--ui-stroke-secondary); }
.ae-sw-pick::-webkit-color-swatch-wrapper { padding: 2px; }
.ae-sw-pick::-webkit-color-swatch { border: 0; border-radius: 6px; }
.ae-sw-pick:focus-visible, .ae-sw-x:focus-visible, .ae-act:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
.ae-sw-label { font-size: 0.8125rem; color: var(--ui-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ae-sw-hex { font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.75rem; }
.ae-sw-x { grid-column: 4; width: 22px; height: 22px; border: 0; border-radius: 6px; cursor: pointer; display: inline-flex;
  align-items: center; justify-content: center; background: transparent; color: var(--ui-text-tertiary); }
.ae-sw-x:hover { color: var(--ui-text-primary); background: var(--ui-bg-quaternary); }
.ae-ed-roll { align-self: flex-start; }
.ae-fin { display: flex; flex-wrap: wrap; gap: 4px; }
.ae-fin-opt { font: inherit; font-size: 0.75rem; line-height: 1; padding: 6px 9px; border-radius: 999px; cursor: pointer;
  color: var(--ui-text-secondary); background: transparent; border: 1px solid var(--ui-stroke-secondary); }
.ae-fin-opt:hover:not(:disabled) { color: var(--ui-text-primary); background: var(--ui-bg-quaternary); }
.ae-fin-opt[aria-pressed="true"] { color: var(--ui-text-primary); border-color: var(--ui-accent);
  background: color-mix(in srgb, var(--ui-accent) 20%, transparent); }
.ae-fin-opt:disabled { cursor: default; opacity: 0.6; }
.ae-fin-opt:focus-visible, .ae-fin-range:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
.ae-fin-row { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; align-items: center; gap: 8px; }
.ae-fin-range { width: 100%; accent-color: var(--ui-accent); }
.ae-select { font: inherit; font-size: 0.8125rem; padding: 6px 10px; border-radius: 8px; cursor: pointer; min-width: 9.5rem;
  color: var(--ui-text-primary); background: var(--ui-bg-secondary, transparent); border: 1px solid var(--ui-stroke-secondary); }
.ae-select:hover { background: var(--ui-bg-quaternary); }
.ae-select option { color: var(--ui-text-primary); background: var(--ui-bg-elevated, var(--ui-bg-chrome, Canvas)); }
.ae-select-trigger { min-width: 9.5rem; }
.ae-select:focus-visible { outline: 2px solid var(--ui-accent); outline-offset: 2px; }
.ae-fin-val { font-family: var(--font-mono, ui-monospace, monospace); font-size: 0.75rem; color: var(--ui-text-tertiary); min-width: 3.2em; text-align: right; }
@media (max-width: 720px) { .ae-ed { grid-template-columns: minmax(0, 1fr); } }
@keyframes ae-breathe { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }
.ae-chip .ae-dot[data-on] { animation: ae-breathe 3.2s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .ae-card, .ae-card-actions, .ae-rc-sw { transition: none; } .ae-chip .ae-dot[data-on] { animation: none; } }
`;
function Styles() {
  return /* @__PURE__ */ jsx2("style", { children: CSS2 });
}

// desktop-src/ui/card.jsx
import { jsx as jsx3, jsxs } from "react/jsx-runtime";
function ThemeCardDirective({ attrs }) {
  const catalog = sdk.useValue($catalog);
  const current = sdk.useValue($themeName);
  const slug = attrs && typeof attrs.name === "string" ? attrs.name.trim() : "";
  const record = slug ? catalog[slug] : null;
  if (!record) return null;
  const on = current === record.slug;
  return /* @__PURE__ */ jsxs("div", { className: "ae-inline", children: [
    /* @__PURE__ */ jsx3(Styles, {}),
    /* @__PURE__ */ jsx3(ScenePreview, { animate: on, record }),
    /* @__PURE__ */ jsxs("div", { className: "ae-inline-row", children: [
      /* @__PURE__ */ jsx3("strong", { style: { fontSize: "0.875rem" }, children: record.label }),
      /* @__PURE__ */ jsx3("span", { style: { fontSize: "0.75rem", color: "var(--ui-text-tertiary)" }, children: record.description })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "ae-inline-row", children: [
      on ? /* @__PURE__ */ jsx3(sdk.Button, { onClick: () => undo(record.slug), size: "sm", variant: "secondary", children: "Undo" }) : /* @__PURE__ */ jsx3(sdk.Button, { onClick: () => applyRecord(record, { origin: "user" }), size: "sm", children: "Apply" }),
      /* @__PURE__ */ jsx3(sdk.Button, { onClick: () => sdk.host.navigate("/aether"), size: "sm", variant: "ghost", children: "Gallery" }),
      on ? /* @__PURE__ */ jsx3("span", { style: { fontSize: "0.75rem", color: "var(--ui-text-tertiary)" }, children: "On now" }) : null
    ] })
  ] });
}

// desktop-src/ui/chip.jsx
import { useState as useState2 } from "react";

// desktop-src/ui/settings.jsx
import { jsx as jsx4, jsxs as jsxs2 } from "react/jsx-runtime";
var MOTION = [
  { id: "full", label: "Full" },
  { id: "calm", label: "Calm" },
  { id: "still", label: "Still" }
];
var STRENGTH2 = [
  { id: "calm", label: "Calm" },
  { id: "balanced", label: "Balanced" },
  { id: "vivid", label: "Vivid" }
];
var QUALITY2 = [
  { id: "battery", label: "Battery" },
  { id: "balanced", label: "Balanced" },
  { id: "high", label: "High" }
];
function MotionControl({ compact = false }) {
  const settings = sdk.useValue($settings);
  return /* @__PURE__ */ jsx4(
    sdk.SegmentedControl,
    {
      onChange: (motion) => updateSettings({ motion }),
      options: MOTION,
      sizing: compact ? "equal" : "content",
      value: settings.motion
    }
  );
}
function StrengthControl() {
  const settings = sdk.useValue($settings);
  return /* @__PURE__ */ jsx4(
    sdk.SegmentedControl,
    {
      onChange: (strength) => updateSettings({ strength }),
      options: STRENGTH2,
      sizing: "equal",
      value: settings.strength || "balanced"
    }
  );
}
function PointerSelect() {
  const settings = sdk.useValue($settings);
  const choice = pointerChoice(settings);
  const pick = (id) => updateSettings({ pointer: id !== "off", pointerMode: id === "off" ? settings.pointerMode || "auto" : id });
  if (sdk.Select && sdk.SelectTrigger && sdk.SelectContent && sdk.SelectItem && sdk.SelectValue) {
    return /* @__PURE__ */ jsxs2(sdk.Select, { onValueChange: pick, value: choice, children: [
      /* @__PURE__ */ jsx4(sdk.SelectTrigger, { "aria-label": "Pointer reaction", className: "ae-select-trigger", children: /* @__PURE__ */ jsx4(sdk.SelectValue, {}) }),
      /* @__PURE__ */ jsx4(sdk.SelectContent, { children: POINTER_CHOICES.map((c) => /* @__PURE__ */ jsx4(sdk.SelectItem, { value: c.id, children: c.label }, c.id)) })
    ] });
  }
  return /* @__PURE__ */ jsx4("select", { "aria-label": "Pointer reaction", className: "ae-select", onChange: (event) => pick(event.target.value), value: choice, children: POINTER_CHOICES.map((c) => /* @__PURE__ */ jsx4("option", { value: c.id, children: c.label }, c.id)) });
}
function SettingsPage() {
  const settings = sdk.useValue($settings);
  const osReduced = reducedMotion();
  return /* @__PURE__ */ jsxs2("div", { className: "ae-settings", children: [
    /* @__PURE__ */ jsx4(Styles, {}),
    /* @__PURE__ */ jsx4(
      sdk.ListRow,
      {
        action: /* @__PURE__ */ jsx4(MotionControl, {}),
        description: "Full animates at the quality below. Calm is slower and lighter. Still paints one frame and stops.",
        title: "Motion"
      }
    ),
    /* @__PURE__ */ jsx4(
      sdk.ListRow,
      {
        action: /* @__PURE__ */ jsx4(
          sdk.SegmentedControl,
          {
            onChange: (strength) => updateSettings({ strength }),
            options: STRENGTH2,
            sizing: "content",
            value: settings.strength || "balanced"
          }
        ),
        description: "Balanced keeps every theme's text contrast guarantee. Vivid lets more of the scene through, so text over the brightest spots (a moon, a sun) can be harder to read. Calm suits long reading.",
        title: "Scene strength"
      }
    ),
    /* @__PURE__ */ jsx4(
      sdk.ToggleRow,
      {
        checked: settings.followReducedMotion,
        description: osReduced ? "Your system asks for reduced motion, so scenes are held still." : "Hold scenes still whenever your system asks for reduced motion.",
        label: "Follow the system's reduced motion",
        onChange: (value) => updateSettings({ followReducedMotion: value })
      }
    ),
    /* @__PURE__ */ jsx4(
      sdk.ToggleRow,
      {
        checked: settings.pauseUnfocused,
        description: "Scenes always sleep while Hermes is hidden or minimised. This also pauses them while another app has focus.",
        label: "Pause when Hermes is in the background",
        onChange: (value) => updateSettings({ pauseUnfocused: value })
      }
    ),
    /* @__PURE__ */ jsx4(
      sdk.ListRow,
      {
        action: /* @__PURE__ */ jsx4(PointerSelect, {}),
        description: "How the scene reacts while your pointer moves, then settles when you stop to read. Auto picks one for each scene: " + POINTER_MODES.map((m) => `${m.label.toLowerCase()} (${m.note})`).join(", ") + ". Off keeps the scene still.",
        title: "Pointer reaction"
      }
    ),
    /* @__PURE__ */ jsx4(
      sdk.ListRow,
      {
        action: /* @__PURE__ */ jsx4(
          sdk.SegmentedControl,
          {
            onChange: (quality) => updateSettings({ quality }),
            options: QUALITY2,
            sizing: "content",
            value: settings.quality
          }
        ),
        description: "Frame rate and render resolution for smooth scenes. Dithered and pixel scenes are crisp at every level.",
        title: "Quality"
      }
    ),
    /* @__PURE__ */ jsx4(
      sdk.ToggleRow,
      {
        checked: settings.toast,
        description: "A short notice with Undo when Hermes or /aether changes your theme.",
        label: "Announce theme changes",
        onChange: (value) => updateSettings({ toast: value })
      }
    ),
    /* @__PURE__ */ jsx4(
      sdk.ListRow,
      {
        action: /* @__PURE__ */ jsx4(sdk.Button, { onClick: () => sdk.host.navigate("/aether"), size: "sm", variant: "secondary", children: "Open gallery" }),
        description: "Presets, themes Hermes made for you, themes from other creators you have installed, and a box to describe a new one.",
        title: "Theme gallery"
      }
    )
  ] });
}

// desktop-src/ui/chip.jsx
import { jsx as jsx5, jsxs as jsxs3 } from "react/jsx-runtime";
function StatusChip() {
  const active = sdk.useValue($active);
  const [open, setOpen] = useState2(false);
  if (!active) return null;
  const run = (fn) => () => {
    setOpen(false);
    fn();
  };
  return /* @__PURE__ */ jsxs3(sdk.Popover, { onOpenChange: setOpen, open, children: [
    /* @__PURE__ */ jsx5(sdk.PopoverTrigger, { asChild: true, children: /* @__PURE__ */ jsxs3("button", { "aria-label": `Aether theme: ${active.label}`, className: "ae-chip", type: "button", children: [
      /* @__PURE__ */ jsx5(Styles, {}),
      /* @__PURE__ */ jsx5("span", { className: "ae-dot", "data-on": "" }),
      active.label
    ] }) }),
    /* @__PURE__ */ jsx5(sdk.PopoverContent, { align: "end", side: "top", children: /* @__PURE__ */ jsxs3("div", { className: "ae-pop", children: [
      /* @__PURE__ */ jsx5("div", { className: "ae-pop-title", children: active.label }),
      /* @__PURE__ */ jsx5("div", { style: { fontSize: "0.75rem", color: "var(--ui-text-secondary)" }, children: active.description }),
      /* @__PURE__ */ jsx5(MotionControl, { compact: true }),
      /* @__PURE__ */ jsx5(StrengthControl, {}),
      /* @__PURE__ */ jsxs3("div", { style: { display: "flex", gap: 6 }, children: [
        /* @__PURE__ */ jsx5(sdk.Button, { onClick: run(() => openEditor(active.slug)), size: "sm", variant: "secondary", children: "Customise" }),
        /* @__PURE__ */ jsx5(sdk.Button, { onClick: run(() => sdk.host.navigate("/aether")), size: "sm", variant: "secondary", children: "Gallery" }),
        /* @__PURE__ */ jsx5(sdk.Button, { onClick: run(() => turnOff()), size: "sm", variant: "ghost", children: "Off" })
      ] }),
      /* @__PURE__ */ jsxs3(sdk.Button, { className: "ae-pop-settings", onClick: run(openSettings), size: "sm", variant: "ghost", children: [
        /* @__PURE__ */ jsx5(sdk.Codicon, { name: "settings-gear" }),
        " All Aether settings"
      ] })
    ] }) })
  ] });
}

// desktop-src/ui/editor.jsx
import { useEffect as useEffect2, useMemo, useRef as useRef2, useState as useState3 } from "react";

// desktop-src/harmony.js
var HARMONIES = [
  { id: "analogous", label: "Analogous", weight: 3, offsets: (rng) => {
    const s = 24 + rng() * 16;
    return [0, s, -s];
  } },
  { id: "complementary", label: "Complementary", weight: 3, offsets: () => [0, 180] },
  { id: "split", label: "Split complementary", weight: 2, offsets: (rng) => {
    const s = 24 + rng() * 12;
    return [0, 180 - s, 180 + s];
  } },
  { id: "triadic", label: "Triadic", weight: 2, offsets: () => [0, 120, 240] },
  { id: "monochrome", label: "Monochrome", weight: 1, offsets: () => [0] }
];
var HUE_NAMES = [
  [12, "pink"],
  [40, "red"],
  [65, "orange"],
  [95, "gold"],
  [120, "yellow"],
  [160, "green"],
  [185, "teal"],
  [225, "cyan"],
  [275, "blue"],
  [310, "violet"],
  [345, "magenta"],
  [361, "pink"]
];
var ACCENT_MIN_CHROMA = 0.12;
var ACCENT_NEEDED_CHROMA = 0.18;
var INNER_MIN_CHROMA = 0.05;
var JITTER = 12;
var toLinear = (c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
var toGamma = (c) => c <= 31308e-7 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
var wrap = (h) => (h % 360 + 360) % 360;
function oklabToLinear(L, a, b) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
}
var inGamut = (lin) => lin.every((c) => c >= -1e-4 && c <= 1 + 1e-4);
function linearAt(L, C, h) {
  const rad = h * Math.PI / 180;
  return oklabToLinear(L, C * Math.cos(rad), C * Math.sin(rad));
}
function hexToOklch(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => toLinear(v / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), h: wrap(Math.atan2(B, A) * 180 / Math.PI) };
}
function maxChroma(L, h) {
  let lo = 0;
  let hi = 0.4;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(linearAt(L, mid, h))) lo = mid;
    else hi = mid;
  }
  return lo;
}
function oklchToHex(L, C, h) {
  const lightness = Math.min(1, Math.max(0, L));
  const chroma = Math.min(Math.max(0, C), maxChroma(lightness, wrap(h)));
  return "#" + linearAt(lightness, chroma, wrap(h)).map((c) => Math.round(toGamma(Math.min(1, Math.max(0, c))) * 255)).map((v) => v.toString(16).padStart(2, "0")).join("");
}
function hueName(h) {
  const hue = wrap(h);
  return HUE_NAMES.find(([top]) => hue < top)[1];
}
function pickHarmony(rng) {
  const total = HARMONIES.reduce((sum, h) => sum + h.weight, 0);
  let roll = rng() * total;
  for (const harmony of HARMONIES) {
    roll -= harmony.weight;
    if (roll < 0) return harmony;
  }
  return HARMONIES[0];
}
function fit(colour, h) {
  if (colour.C < 0.03) return 1;
  const kept = Math.min(1, maxChroma(colour.L, h) / colour.C);
  const hue = wrap(h);
  return hue > 60 && hue < 130 && colour.L < 0.62 ? kept * 0.5 : kept;
}
var sameHex = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
function randomHarmony(current, rng = Math.random) {
  const bg = hexToOklch(current.background);
  const acc = hexToOklch(current.accent);
  const accChroma = Math.max(acc.C, ACCENT_MIN_CHROMA);
  const harmony = pickHarmony(rng);
  const offsets = harmony.offsets(rng);
  const accentOffset = offsets.length > 1 ? offsets[1] : 0;
  let best = null;
  for (let i = 0; i < 48; i++) {
    const h0 = rng() * 360;
    const score = Math.min(fit(bg, h0), fit({ L: acc.L, C: Math.min(accChroma, ACCENT_NEEDED_CHROMA) }, h0 + accentOffset));
    if (!best || score > best.score) best = { h0, score };
    if (score >= 0.92) break;
  }
  const anchors = offsets.map((o) => wrap(best.h0 + o));
  const background = oklchToHex(bg.L, bg.C, anchors[0]);
  const accent = oklchToHex(acc.L, accChroma, wrap(best.h0 + accentOffset));
  const n = current.stops.length;
  const stops = current.stops.map((hex, i) => {
    if (sameHex(hex, current.background)) return background;
    if (sameHex(hex, current.accent)) return accent;
    const stop = hexToOklch(hex);
    const t = n > 1 ? i / (n - 1) : 0;
    const k = Math.min(anchors.length - 1, Math.floor(t ** 1.5 * anchors.length));
    const midTone = i > 0 && i < n - 1 && stop.L > 0.25 && stop.L < 0.85;
    const chroma = midTone ? Math.max(stop.C, INNER_MIN_CHROMA) : stop.C;
    return oklchToHex(stop.L, chroma, anchors[k] + (rng() - 0.5) * JITTER);
  });
  return { harmony: harmony.id, label: harmony.label, hue: hueName(anchors[0]), anchors, background, accent, stops };
}

// desktop-src/ui/editor.jsx
import { jsx as jsx6, jsxs as jsxs4 } from "react/jsx-runtime";
var HEX = /^#[0-9a-f]{6}$/;
var MAX_STOPS = 5;
var MIN_STOPS = 2;
var FINISH_NAMES = {
  none: "Smooth",
  dither: "Dither",
  halftone: "Halftone",
  ascii: "ASCII",
  braille: "Braille",
  grain: "Grain",
  scanlines: "Scanlines",
  crt: "CRT",
  glitch: "Glitch",
  pixel: "Pixel"
};
var PICKER_ORDER = ["none", "dither", "halftone", "ascii", "braille", "pixel", "crt", "scanlines", "glitch", "grain"];
var SIZED = /* @__PURE__ */ new Set(["dither", "pixel", "halftone", "ascii", "braille", "scanlines", "crt"]);
var PATTERNS = [["bayer2", "Bayer 2"], ["bayer4", "Bayer 4"], ["bayer8", "Bayer 8"], ["noise", "Blue noise"]];
var FINISH_BY_STYLE = Object.fromEntries(FINISHES.map((f) => [f.style, f]));
function startingColours(record) {
  const c = record.theme.colors;
  return { background: c.background, accent: c.primary, foreground: c.foreground, stops: [...record.scene.colors] };
}
function startingFinish(record) {
  const f = record.scene.finish || {};
  return { style: f.style || "none", pixel: f.pixel || 2, pattern: f.pattern || "bayer4" };
}
var sameFinish = (a, b) => a.style === b.style && a.pixel === b.pixel && a.pattern === b.pattern;
function finishWord(style) {
  const name = FINISH_NAMES[style] || style;
  return name === name.toUpperCase() ? name : name.toLowerCase();
}
function autoLabel(record, coloursChanged, finishChanged, style) {
  if (record.source !== "preset") return record.label;
  if (finishChanged && !coloursChanged) return `${record.label}, ${finishWord(style)}`;
  return `${record.label} (custom)`;
}
var sentence = (text) => text.charAt(0).toUpperCase() + text.slice(1) + ".";
function asHex(text) {
  const raw = String(text || "").trim().toLowerCase();
  const hex = raw.startsWith("#") ? raw : `#${raw}`;
  return HEX.test(hex) ? hex : null;
}
function Swatch({ disabled, label, onChange, onRemove, value }) {
  const [text, setText] = useState3(value);
  useEffect2(() => setText(value), [value]);
  return /* @__PURE__ */ jsxs4("div", { className: "ae-sw", children: [
    /* @__PURE__ */ jsx6(
      "input",
      {
        "aria-label": `${label}: pick a colour`,
        className: "ae-sw-pick",
        disabled,
        onChange: (event) => onChange(event.target.value.toLowerCase()),
        type: "color",
        value
      }
    ),
    /* @__PURE__ */ jsx6("span", { className: "ae-sw-label", children: label }),
    /* @__PURE__ */ jsx6(
      sdk.Input,
      {
        "aria-label": `${label}: hex value`,
        className: "ae-sw-hex",
        disabled,
        onBlur: () => setText(value),
        onChange: (event) => {
          setText(event.target.value);
          const hex = asHex(event.target.value);
          if (hex) onChange(hex);
        },
        spellCheck: false,
        value: text
      }
    ),
    onRemove ? /* @__PURE__ */ jsx6("button", { "aria-label": `Remove ${label.toLowerCase()}`, className: "ae-sw-x", disabled, onClick: onRemove, type: "button", children: /* @__PURE__ */ jsx6(sdk.Codicon, { name: "close" }) }) : null
  ] });
}
function FinishPicker({ disabled, finish, onChange, start }) {
  const pick = (style) => {
    if (style === finish.style) return;
    if (style === start.style) onChange(start);
    else onChange({ style, pixel: (FINISH_BY_STYLE[style] || {}).pixel || 2, pattern: "bayer4" });
  };
  return /* @__PURE__ */ jsxs4("fieldset", { className: "ae-ed-group", disabled, children: [
    /* @__PURE__ */ jsx6("legend", { className: "ae-ed-legend", children: "Finish" }),
    /* @__PURE__ */ jsx6("div", { "aria-label": "Finish", className: "ae-fin", role: "group", children: PICKER_ORDER.filter((style) => FINISH_BY_STYLE[style]).map((style) => /* @__PURE__ */ jsx6(
      "button",
      {
        "aria-pressed": finish.style === style,
        className: "ae-fin-opt",
        disabled,
        onClick: () => pick(style),
        title: sentence(FINISH_BY_STYLE[style].description),
        type: "button",
        children: FINISH_NAMES[style] || style
      },
      style
    )) }),
    SIZED.has(finish.style) ? /* @__PURE__ */ jsxs4("label", { className: "ae-fin-row", children: [
      /* @__PURE__ */ jsx6("span", { className: "ae-sw-label", children: "Size" }),
      /* @__PURE__ */ jsx6(
        "input",
        {
          "aria-label": "Finish size",
          className: "ae-fin-range",
          disabled,
          max: 24,
          min: 1,
          onChange: (event) => onChange({ ...finish, pixel: Number(event.target.value) }),
          step: 1,
          type: "range",
          value: finish.pixel
        }
      ),
      /* @__PURE__ */ jsxs4("span", { className: "ae-fin-val", children: [
        finish.pixel,
        "px"
      ] })
    ] }) : null,
    finish.style === "dither" ? /* @__PURE__ */ jsxs4("div", { className: "ae-fin-row", children: [
      /* @__PURE__ */ jsx6("span", { className: "ae-sw-label", children: "Pattern" }),
      /* @__PURE__ */ jsx6("div", { "aria-label": "Dither pattern", className: "ae-fin", role: "group", children: PATTERNS.map(([id, name]) => /* @__PURE__ */ jsx6(
        "button",
        {
          "aria-pressed": finish.pattern === id,
          className: "ae-fin-opt",
          disabled,
          onClick: () => onChange({ ...finish, pattern: id }),
          type: "button",
          children: name
        },
        id
      )) })
    ] }) : null
  ] });
}
function Editor({ base }) {
  const agent = sdk.useValue($agentHalf);
  const start = useMemo(() => startingColours(base), [base]);
  const startFinish = useMemo(() => startingFinish(base), [base]);
  const [colours, setColours] = useState3(start);
  const [finish, setFinish] = useState3(startFinish);
  const [textChosen, setTextChosen] = useState3(false);
  const [label, setLabel] = useState3(null);
  const [harmony, setHarmony] = useState3("");
  const [result, setResult] = useState3(null);
  const [status, setStatus] = useState3("checking");
  const [error, setError] = useState3("");
  const ticket = useRef2(0);
  const coloursChanged = textChosen || JSON.stringify(colours) !== JSON.stringify(start);
  const finishChanged = !sameFinish(finish, startFinish);
  const name = label ?? autoLabel(base, coloursChanged, finishChanged, finish.style);
  const params = useMemo(() => {
    const out = { base: base.slug, background: colours.background, accent: colours.accent, scene_colors: colours.stops };
    if (name.trim()) out.label = name.trim();
    if (textChosen) out.foreground = colours.foreground;
    if (finishChanged) out.finish = { ...finish };
    return out;
  }, [base, colours, name, textChosen, finish, finishChanged]);
  const key = JSON.stringify(params);
  const readOnly = status === "unavailable" || agent === false;
  useEffect2(() => {
    if (agent === false) {
      setStatus("unavailable");
      return void 0;
    }
    const mine = ++ticket.current;
    setStatus((current) => current === "unavailable" ? current : "checking");
    return later(async () => {
      try {
        const out = await previewColours(params);
        if (mine !== ticket.current) return;
        if (out && out.ok) {
          setResult({ key, ...out });
          setError("");
          setStatus("ready");
        } else {
          setError(out && out.error || "These colours could not be checked.");
          setStatus("error");
        }
      } catch {
        if (mine === ticket.current) setStatus("unavailable");
      }
    }, 220);
  }, [agent, key]);
  const fresh = result && result.key === key ? result.record : null;
  const draft = useMemo(() => {
    if (fresh) return fresh;
    const known = result && result.record || base;
    const colors = { ...known.theme.colors, background: colours.background, primary: colours.accent };
    if (textChosen) colors.foreground = colours.foreground;
    const levels = finish.style === startFinish.style ? (base.scene.finish || {}).levels || 0 : 0;
    const sceneFinish = finishChanged ? { ...base.scene.finish || {}, ...finish, levels } : base.scene.finish;
    return {
      ...base,
      theme: { ...base.theme, colors },
      scene: { ...base.scene, glass: known.scene.glass, colors: colours.stops, finish: sceneFinish }
    };
  }, [fresh, result, base, colours, textChosen, finish, finishChanged, startFinish]);
  const set = (patch) => {
    setHarmony("");
    setColours((current) => ({ ...current, ...patch }));
  };
  const randomize = () => {
    const roll = randomHarmony({ background: start.background, accent: start.accent, stops: start.stops });
    setColours((current) => ({ ...current, background: roll.background, accent: roll.accent, stops: roll.stops }));
    setTextChosen(false);
    setHarmony(`${roll.label} colours around ${roll.hue}.`);
  };
  const setStop = (index, hex) => set({ stops: colours.stops.map((stop, i) => i === index ? hex : stop) });
  const removeStop = (index) => set({ stops: colours.stops.filter((_, i) => i !== index) });
  const addStop = () => set({ stops: [...colours.stops, colours.stops[colours.stops.length - 1]] });
  const reset = () => {
    setColours(start);
    setFinish(startFinish);
    setTextChosen(false);
    setLabel(null);
    setHarmony("");
  };
  const save = async () => {
    setStatus("saving");
    try {
      const out = await saveColours(params);
      if (out && out.ok) closeEditor();
      else {
        setError(out && out.error || "The theme could not be saved.");
        setStatus("error");
      }
    } catch {
      setStatus("unavailable");
    }
  };
  const notes = fresh && result.notes || [];
  const changed = coloursChanged || finishChanged || label !== null;
  const updating = Boolean(fresh && result.replaces);
  const banner = readOnly ? "Saving needs the Agent half of Aether on this profile (Capabilities, Plugins, Aether). Turn it on to edit and save." : null;
  return /* @__PURE__ */ jsxs4(sdk.DialogContent, { banner, bannerTone: "warn", fitContent: true, children: [
    /* @__PURE__ */ jsx6(Styles, {}),
    /* @__PURE__ */ jsxs4(sdk.DialogHeader, { children: [
      /* @__PURE__ */ jsxs4(sdk.DialogTitle, { children: [
        "Customise: ",
        base.label
      ] }),
      /* @__PURE__ */ jsx6(sdk.DialogDescription, { children: "Change any colour or the finish. Aether keeps text readable over the moving scene and tells you what it had to move." })
    ] }),
    /* @__PURE__ */ jsxs4("div", { className: "ae-ed", children: [
      /* @__PURE__ */ jsxs4("div", { className: "ae-ed-side", children: [
        /* @__PURE__ */ jsx6(ScenePreview, { animate: !readOnly, record: draft }),
        /* @__PURE__ */ jsx6(FinishPicker, { disabled: readOnly, finish, onChange: setFinish, start: startFinish }),
        /* @__PURE__ */ jsxs4("div", { "aria-live": "polite", className: "ae-ed-notes", children: [
          harmony ? /* @__PURE__ */ jsx6("div", { className: "ae-ed-note", "data-tone": "quiet", children: harmony }) : null,
          status === "error" ? /* @__PURE__ */ jsx6("div", { className: "ae-ed-note", "data-tone": "error", role: "alert", children: error }) : notes.length ? notes.map((note) => /* @__PURE__ */ jsx6("div", { className: "ae-ed-note", children: note }, note)) : status === "ready" ? /* @__PURE__ */ jsx6("div", { className: "ae-ed-note", "data-tone": "ok", children: "Readable as it is: nothing had to move." }) : status === "checking" && !readOnly ? /* @__PURE__ */ jsx6("div", { className: "ae-ed-note", "data-tone": "quiet", children: "Checking readability..." }) : null
        ] })
      ] }),
      /* @__PURE__ */ jsxs4("div", { className: "ae-ed-fields", children: [
        /* @__PURE__ */ jsxs4("label", { className: "ae-ed-name", children: [
          /* @__PURE__ */ jsx6("span", { className: "ae-ed-legend", children: "Name" }),
          /* @__PURE__ */ jsx6(sdk.Input, { disabled: readOnly, maxLength: 40, onChange: (event) => setLabel(event.target.value), value: name })
        ] }),
        /* @__PURE__ */ jsxs4(
          sdk.Button,
          {
            className: "ae-ed-roll",
            disabled: readOnly,
            onClick: randomize,
            size: "sm",
            title: `New colours for ${base.label} from one colour harmony, keeping its light and dark`,
            variant: "secondary",
            children: [
              /* @__PURE__ */ jsx6(sdk.Codicon, { name: "sparkle" }),
              " Randomize colours"
            ]
          }
        ),
        /* @__PURE__ */ jsxs4("fieldset", { className: "ae-ed-group", disabled: readOnly, children: [
          /* @__PURE__ */ jsx6("legend", { className: "ae-ed-legend", children: "Theme" }),
          /* @__PURE__ */ jsx6(Swatch, { disabled: readOnly, label: "Background", onChange: (hex) => set({ background: hex }), value: colours.background }),
          /* @__PURE__ */ jsx6(Swatch, { disabled: readOnly, label: "Accent", onChange: (hex) => set({ accent: hex }), value: colours.accent }),
          /* @__PURE__ */ jsx6(
            Swatch,
            {
              disabled: readOnly,
              label: textChosen ? "Text" : "Text (automatic)",
              onChange: (hex) => {
                setTextChosen(true);
                set({ foreground: hex });
              },
              value: fresh && fresh.theme.colors.foreground || colours.foreground
            }
          )
        ] }),
        /* @__PURE__ */ jsxs4("fieldset", { className: "ae-ed-group", disabled: readOnly, children: [
          /* @__PURE__ */ jsx6("legend", { className: "ae-ed-legend", children: "Scene, calm to bright" }),
          colours.stops.map((stop, i) => /* @__PURE__ */ jsx6(
            Swatch,
            {
              disabled: readOnly,
              label: `Scene colour ${i + 1}`,
              onChange: (hex) => setStop(i, hex),
              onRemove: colours.stops.length > MIN_STOPS ? () => removeStop(i) : null,
              value: stop
            },
            i
          )),
          colours.stops.length < MAX_STOPS ? /* @__PURE__ */ jsxs4(sdk.Button, { disabled: readOnly, onClick: addStop, size: "sm", variant: "ghost", children: [
            /* @__PURE__ */ jsx6(sdk.Codicon, { name: "add" }),
            " Add a scene colour"
          ] }) : null
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsxs4(sdk.DialogFooter, { children: [
      /* @__PURE__ */ jsx6(sdk.Button, { disabled: readOnly || !changed, onClick: reset, variant: "ghost", children: "Reset" }),
      /* @__PURE__ */ jsx6(sdk.Button, { onClick: () => closeEditor(), variant: "secondary", children: "Cancel" }),
      /* @__PURE__ */ jsx6(sdk.Button, { disabled: readOnly || status === "saving" || status === "error", onClick: save, children: status === "saving" ? "Saving..." : updating ? "Update and apply" : "Save and apply" })
    ] })
  ] });
}
function EditorHost() {
  const slug = sdk.useValue($editing);
  const catalog = sdk.useValue($catalog);
  const base = slug ? catalog[slug] : null;
  if (!sdk.Dialog || !sdk.DialogContent) return null;
  return /* @__PURE__ */ jsx6(sdk.Dialog, { onOpenChange: (open) => open ? null : closeEditor(), open: Boolean(base), children: base ? /* @__PURE__ */ jsx6(Editor, { base }, base.slug) : null });
}

// desktop-src/ui/gallery.jsx
import { useMemo as useMemo2, useState as useState4 } from "react";
import { jsx as jsx7, jsxs as jsxs5 } from "react/jsx-runtime";
var IDEAS = [
  "a slow dithered sunset over the sea",
  "my terminal, but amber and raining",
  "deep space, quiet stars, cyanotype blue",
  "gold leaf on black marble",
  "rainy Tokyo at night, neon reflections",
  "a calm forest at dawn, soft halftone"
];
function askHermes(text) {
  const want = String(text || "").trim();
  if (!want) return false;
  const prompt = `Make me an Aether theme for Hermes Desktop: ${want}`;
  if (sdk.host.composer.submit(null, prompt)) return true;
  sdk.host.newChat();
  let tries = 0;
  const attempt = () => {
    if (sdk.host.composer.submit(null, prompt)) return;
    if (++tries < 16) {
      later(attempt, 150);
      return;
    }
    if (sdk.host.composer.setDraft) sdk.host.composer.setDraft(null, prompt);
    sdk.host.notify({ kind: "info", title: "Aether", message: "Your request is in the composer: press Enter to send it to Hermes." });
  };
  later(attempt, 150);
  return true;
}
function ThemeCard({ record, active, onDelete }) {
  const [hover, setHover] = useState4(false);
  const scene = record.scene;
  return /* @__PURE__ */ jsxs5(
    "div",
    {
      className: "ae-cardwrap",
      onBlur: () => setHover(false),
      onFocus: () => setHover(true),
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
      children: [
        /* @__PURE__ */ jsxs5(
          "button",
          {
            "aria-pressed": active,
            className: "ae-card",
            "data-active": active ? "" : void 0,
            onClick: () => applyRecord(record, { origin: "user" }),
            title: `Apply ${record.label}`,
            type: "button",
            children: [
              /* @__PURE__ */ jsx7(ScenePreview, { animate: hover || active, record }),
              /* @__PURE__ */ jsxs5("div", { className: "ae-card-body", children: [
                /* @__PURE__ */ jsxs5("div", { className: "ae-card-title", children: [
                  sdk.DecodeText ? /* @__PURE__ */ jsx7(sdk.DecodeText, { active: hover, text: record.label }, hover ? "on" : "off") : /* @__PURE__ */ jsx7("span", { children: record.label }),
                  active ? /* @__PURE__ */ jsx7("span", { className: "ae-on", children: "On" }) : null
                ] }),
                /* @__PURE__ */ jsx7("div", { className: "ae-card-desc", children: record.description }),
                /* @__PURE__ */ jsxs5("div", { className: "ae-tags", children: [
                  /* @__PURE__ */ jsx7("span", { className: "ae-tag", children: scene.engine }),
                  scene.finish.style !== "none" ? /* @__PURE__ */ jsx7("span", { className: "ae-tag", children: scene.finish.style }) : null,
                  /* @__PURE__ */ jsx7("span", { className: "ae-tag", children: record.appearance })
                ] })
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsxs5("div", { className: "ae-card-actions", children: [
          /* @__PURE__ */ jsx7("button", { "aria-label": `Customise ${record.label}`, className: "ae-act", onClick: () => openEditor(record.slug), title: "Customise colours and finish", type: "button", children: /* @__PURE__ */ jsx7(sdk.Codicon, { name: "symbol-color" }) }),
          onDelete ? /* @__PURE__ */ jsx7("button", { "aria-label": `Delete ${record.label}`, className: "ae-act", onClick: () => onDelete(record), title: "Delete", type: "button", children: /* @__PURE__ */ jsx7(sdk.Codicon, { name: "close" }) }) : null
        ] })
      ]
    }
  );
}
function CommunityCard({ entry, active, current }) {
  const { name, label, description, plugin, hex, mine } = entry;
  const by = plugin.author || plugin.name;
  return /* @__PURE__ */ jsxs5("div", { className: "ae-cardwrap", children: [
    /* @__PURE__ */ jsxs5(
      "button",
      {
        "aria-pressed": active,
        className: "ae-card",
        "data-active": active ? "" : void 0,
        onClick: () => switchTo(name),
        title: `Switch to ${label}`,
        type: "button",
        children: [
          /* @__PURE__ */ jsxs5("div", { className: "ae-shot", children: [
            plugin.image ? /* @__PURE__ */ jsx7("img", { alt: "", draggable: false, src: plugin.image }) : /* @__PURE__ */ jsx7("span", { className: "ae-shot-mark", children: label.slice(0, 1) }),
            hex ? /* @__PURE__ */ jsxs5("span", { className: "ae-shot-accent", children: [
              /* @__PURE__ */ jsx7("span", { className: "ae-shot-dot", style: { background: hex } }),
              "Your accent"
            ] }) : null
          ] }),
          /* @__PURE__ */ jsxs5("div", { className: "ae-card-body", children: [
            /* @__PURE__ */ jsxs5("div", { className: "ae-card-title", children: [
              /* @__PURE__ */ jsx7("span", { children: label }),
              active ? /* @__PURE__ */ jsx7("span", { className: "ae-on", children: "On" }) : null
            ] }),
            /* @__PURE__ */ jsxs5("div", { className: "ae-card-by", children: [
              "by ",
              by,
              hex ? mine ? ", recoloured by you" : ", recoloured" : ""
            ] }),
            /* @__PURE__ */ jsx7("div", { className: "ae-card-desc", children: description })
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsxs5("div", { className: "ae-card-actions", children: [
      /* @__PURE__ */ jsx7(
        "button",
        {
          "aria-label": `Recolour ${label}`,
          className: "ae-act",
          onClick: () => openRecolour(entry.base || name, hex || null),
          title: "Recolour the accent",
          type: "button",
          children: /* @__PURE__ */ jsx7(sdk.Codicon, { name: "symbol-color" })
        }
      ),
      plugin.repo ? /* @__PURE__ */ jsx7(
        "button",
        {
          "aria-label": `Open ${by}'s page for ${plugin.name}`,
          className: "ae-act",
          onClick: () => openCreator(plugin.repo),
          title: `${by}'s page`,
          type: "button",
          children: /* @__PURE__ */ jsx7(sdk.Codicon, { name: "link-external" })
        }
      ) : null,
      mine ? /* @__PURE__ */ jsx7("button", { "aria-label": `Delete ${label}`, className: "ae-act", onClick: () => deleteRecolour(name, current), title: "Delete this recolour", type: "button", children: /* @__PURE__ */ jsx7(sdk.Codicon, { name: "close" }) }) : null
    ] })
  ] });
}
function Ask() {
  const [text, setText] = useState4("");
  const agent = sdk.useValue($agentHalf);
  const submit = (value) => {
    if (askHermes(value)) setText("");
  };
  return /* @__PURE__ */ jsxs5("div", { className: "ae-ask", children: [
    /* @__PURE__ */ jsxs5("div", { className: "ae-ask-row", children: [
      /* @__PURE__ */ jsx7(
        sdk.Textarea,
        {
          "aria-label": "Describe a theme",
          onChange: (event) => setText(event.target.value),
          onKeyDown: (event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit(text);
            }
          },
          placeholder: "Describe a theme and Hermes will paint it. A mood, a place, a palette, a texture...",
          rows: 1,
          value: text
        }
      ),
      /* @__PURE__ */ jsx7(sdk.Button, { disabled: !text.trim(), onClick: () => submit(text), children: "Make it" })
    ] }),
    /* @__PURE__ */ jsx7("div", { className: "ae-ideas", children: IDEAS.map((idea) => /* @__PURE__ */ jsx7("button", { className: "ae-idea", onClick: () => submit(idea), type: "button", children: idea }, idea)) }),
    agent === false ? /* @__PURE__ */ jsx7("div", { className: "ae-empty", children: "The agent half is not enabled for this profile, so Hermes cannot paint new themes yet. Presets work either way." }) : null
  ] });
}
function Gallery() {
  const saved = sdk.useValue($saved);
  const committed = sdk.useValue($themeName);
  const painted = sdk.useValue($paintedName);
  const agent = sdk.useValue($agentHalf);
  const community = sdk.useValue($communityThemes);
  const active = painted || committed;
  const mine = useMemo2(() => Object.values(saved).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0)), [saved]);
  const onDelete = (record) => deleteSaved(record.slug);
  return /* @__PURE__ */ jsxs5("div", { className: "ae-page", children: [
    /* @__PURE__ */ jsx7(Styles, {}),
    /* @__PURE__ */ jsxs5("div", { className: "ae-wrap", children: [
      /* @__PURE__ */ jsxs5("div", { className: "ae-head", children: [
        /* @__PURE__ */ jsxs5("div", { children: [
          /* @__PURE__ */ jsx7("h1", { className: "ae-title", children: "Aether" }),
          /* @__PURE__ */ jsx7("p", { className: "ae-sub", children: "Living themes for Hermes. Pick one, or describe the look you want and Hermes paints a palette and a moving scene behind your chats." })
        ] }),
        /* @__PURE__ */ jsxs5("div", { className: "ae-head-side", children: [
          /* @__PURE__ */ jsxs5("span", { className: "ae-status", children: [
            /* @__PURE__ */ jsx7("span", { className: "ae-dot", "data-on": agent ? "" : void 0 }),
            agent ? "Hermes can paint themes" : agent === false ? "Presets only on this profile" : "Connecting"
          ] }),
          /* @__PURE__ */ jsxs5(sdk.Button, { "aria-label": "Aether settings", onClick: openSettings, size: "sm", variant: "secondary", children: [
            /* @__PURE__ */ jsx7(sdk.Codicon, { name: "settings-gear" }),
            " Settings"
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx7(Ask, {}),
      /* @__PURE__ */ jsxs5("section", { className: "ae-section", children: [
        /* @__PURE__ */ jsx7("div", { className: "ae-section-head", children: /* @__PURE__ */ jsx7("h2", { className: "ae-h2", children: "Your themes" }) }),
        mine.length ? /* @__PURE__ */ jsx7("div", { className: "ae-grid", children: mine.map((record) => /* @__PURE__ */ jsx7(ThemeCard, { active: active === record.slug, onDelete, record }, record.slug)) }) : /* @__PURE__ */ jsx7("div", { className: "ae-empty", children: "Nothing yet. Describe a theme above, tell Hermes what you want in any chat, or change a preset's colours." })
      ] }),
      community.length ? /* @__PURE__ */ jsxs5("section", { className: "ae-section", children: [
        /* @__PURE__ */ jsx7("div", { className: "ae-section-head", children: /* @__PURE__ */ jsx7("h2", { className: "ae-h2", children: "From other creators" }) }),
        /* @__PURE__ */ jsx7("p", { className: "ae-note", children: "Themes from other plugins you have installed. Click one to switch to it, or recolour its accent. They stay their creators' work: the scenes and styles are theirs." }),
        /* @__PURE__ */ jsx7("div", { className: "ae-grid", children: community.map((entry) => /* @__PURE__ */ jsx7(CommunityCard, { active: active === entry.name, current: committed, entry }, entry.name)) })
      ] }) : null,
      /* @__PURE__ */ jsxs5("section", { className: "ae-section", children: [
        /* @__PURE__ */ jsx7("div", { className: "ae-section-head", children: /* @__PURE__ */ jsx7("h2", { className: "ae-h2", children: "Presets" }) }),
        /* @__PURE__ */ jsx7("div", { className: "ae-grid", children: PRESETS.map((record) => /* @__PURE__ */ jsx7(ThemeCard, { active: active === record.slug, record }, record.slug)) })
      ] }),
      /* @__PURE__ */ jsxs5("div", { className: "ae-foot", children: [
        /* @__PURE__ */ jsx7(sdk.Button, { onClick: () => turnOff(), size: "sm", variant: "secondary", children: "Turn the backdrop off" }),
        /* @__PURE__ */ jsx7(sdk.Button, { onClick: openSettings, size: "sm", variant: "ghost", children: "Motion and pointer settings" }),
        /* @__PURE__ */ jsx7("span", { children: "Motion pauses while Hermes is hidden and follows your system's reduced-motion setting." })
      ] })
    ] })
  ] });
}

// desktop-src/ui/recolour.jsx
import { useEffect as useEffect3, useLayoutEffect, useRef as useRef3, useState as useState5 } from "react";
import { jsx as jsx8, jsxs as jsxs6 } from "react/jsx-runtime";
var SWATCHES = [
  { name: "Mono", light: "#000000", dark: "#ffffff" },
  { name: "GitHub green", light: "#2ea043", dark: "#2ea043" },
  { name: "Cyber cyan", light: "#00d5ff", dark: "#00d5ff" },
  { name: "Nous blue", light: "#0053fd", dark: "#0053fd" },
  { name: "Ultraviolet", light: "#8a2be2", dark: "#8a2be2" },
  { name: "Barbie pink", light: "#e0218a", dark: "#e0218a" },
  { name: "Electric red", light: "#ff073a", dark: "#ff073a" },
  { name: "Safety orange", light: "#ff6a00", dark: "#ff6a00" }
];
var normalize = (value) => {
  if (sdk.normalizeHex) return sdk.normalizeHex(value) || null;
  const hex = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : null;
};
var modeOf = (theme) => String(theme && theme.name || "").endsWith("-light") ? "light" : "dark";
var baseOf = (name) => String(name || "").replace(/-(light|dark)$/, "");
function swatchName(hex) {
  const found = SWATCHES.find((s) => s.light === hex || s.dark === hex);
  return found ? found.name : hex;
}
function Recolour({ name, start }) {
  const { theme, themeName, previewTheme, clearThemePreview } = sdk.useTheme();
  const list = sdk.useValue($themeList);
  const base = list.find((t) => t.name === name) || { name, label: name, description: "" };
  const [hex, setHex] = useState5(start);
  const [text, setText] = useState5(start || "");
  const [own, setOwn] = useState5(null);
  const [phase, setPhase] = useState5("idle");
  const previous = useRef3(themeName);
  const previewed = useRef3(false);
  const saved = useRef3(false);
  const mode = modeOf(theme);
  const painted = baseOf(theme && theme.name);
  const onBase = themeName === name;
  useEffect3(() => {
    if (themeName !== name) request(name);
    return () => {
      if (sdk.setAccentOverride) sdk.setAccentOverride(null);
      if (!saved.current && previous.current && previous.current !== name) request(previous.current);
    };
  }, []);
  useEffect3(() => {
    if (!own && theme && !theme.accentOf && painted === name) setOwn(normalize(theme.colors.primary));
  }, [own, theme, painted, name]);
  useEffect3(() => {
    if (!sdk.setAccentOverride || !onBase || phase !== "idle") return;
    sdk.setAccentOverride(hex && hex !== own ? hex : null);
  }, [hex, own, onBase, phase]);
  useLayoutEffect(() => {
    if (phase !== "capture" || !theme || modeOf(theme) !== "light" || !theme.accentOf) return;
    const light = theme;
    if (previewed.current && clearThemePreview) clearThemePreview();
    setPhase("done");
    const { name: paintedName, label: _label, description: _description, colors, darkColors, ...rest } = light;
    const recolour = {
      ...rest,
      name: baseOf(paintedName),
      label: `${base.label} \xB7 ${swatchName(hex)}`,
      description: base.description || "",
      accentOf: name,
      colors,
      darkColors: darkColors || colors
    };
    if (sdk.setAccentOverride) sdk.setAccentOverride(null);
    saved.current = saveRecolour(recolour);
    closeRecolour();
  }, [phase, theme, hex, name, base.label, base.description, clearThemePreview]);
  const save = () => {
    if (!hex || hex === own || !onBase) return;
    previewed.current = mode !== "light";
    setPhase("capture");
    if (previewed.current && previewTheme) previewTheme(name, "light");
  };
  const cancel = () => closeRecolour();
  const pick = (value) => {
    const next = normalize(value);
    if (!next) return;
    setHex(next);
    setText(next);
  };
  const dark = mode === "dark";
  const ready = Boolean(hex) && hex !== own && onBase && phase === "idle";
  return /* @__PURE__ */ jsxs6(
    sdk.DialogContent,
    {
      fitContent: true,
      onOpenAutoFocus: (event) => {
        event.preventDefault();
      },
      children: [
        /* @__PURE__ */ jsx8(Styles, {}),
        /* @__PURE__ */ jsxs6(sdk.DialogHeader, { children: [
          /* @__PURE__ */ jsxs6(sdk.DialogTitle, { className: "ae-rc-title", children: [
            "Recolour: ",
            base.label,
            /* @__PURE__ */ jsx8("span", { className: "ae-rc-exp", title: "Recolouring other creators' themes is experimental", children: "Experimental" })
          ] }),
          /* @__PURE__ */ jsx8(sdk.DialogDescription, { children: "Pick a new accent for buttons, links and highlights. Everything else stays as its creator made it, and the recolour is saved only on this computer. Recolouring other creators' themes is experimental: if anything looks off, delete the recolour to go back to the original." })
        ] }),
        /* @__PURE__ */ jsxs6("div", { className: "ae-rc", children: [
          /* @__PURE__ */ jsx8("div", { "aria-label": "Accent colours", className: "ae-rc-swatches", role: "radiogroup", children: SWATCHES.map((s) => {
            const value = dark ? s.dark : s.light;
            const on = hex === value;
            return /* @__PURE__ */ jsx8(
              "button",
              {
                "aria-checked": on,
                "aria-label": s.name,
                className: "ae-rc-sw",
                "data-on": on ? "" : void 0,
                onClick: () => pick(value),
                role: "radio",
                style: { background: value },
                title: s.name,
                type: "button"
              },
              s.name
            );
          }) }),
          /* @__PURE__ */ jsxs6("div", { className: "ae-rc-custom", children: [
            /* @__PURE__ */ jsx8("span", { className: "ae-ed-legend", children: "Any colour" }),
            /* @__PURE__ */ jsxs6("div", { className: "ae-sw", style: { gridTemplateColumns: "28px 96px" }, children: [
              /* @__PURE__ */ jsx8(
                "input",
                {
                  "aria-label": "Choose any accent colour",
                  className: "ae-sw-pick",
                  onChange: (event) => pick(event.target.value),
                  type: "color",
                  value: hex || own || "#ffffff"
                }
              ),
              /* @__PURE__ */ jsx8(
                sdk.Input,
                {
                  "aria-label": "Accent hex value",
                  className: "ae-sw-hex",
                  maxLength: 7,
                  onBlur: () => pick(text),
                  onChange: (event) => {
                    setText(event.target.value);
                    if (normalize(event.target.value)) pick(event.target.value);
                  },
                  placeholder: own || "#rrggbb",
                  value: text
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ jsxs6("div", { className: "ae-rc-sample", "aria-hidden": true, children: [
            /* @__PURE__ */ jsx8("span", { className: "ae-rc-btn", children: "Button" }),
            /* @__PURE__ */ jsx8("span", { className: "ae-rc-link", children: "A highlighted link" }),
            /* @__PURE__ */ jsx8("span", { className: "ae-on", children: "On" })
          ] }),
          /* @__PURE__ */ jsx8("div", { className: "ae-ed-note", "data-tone": "quiet", children: hex && hex === own ? `That is ${base.label}'s own accent.` : hex ? `The window behind shows ${base.label} with ${swatchName(hex)} as its accent.` : `Pick a colour to see ${base.label} with it.` })
        ] }),
        /* @__PURE__ */ jsxs6(sdk.DialogFooter, { children: [
          /* @__PURE__ */ jsx8(sdk.Button, { onClick: cancel, variant: "secondary", children: "Cancel" }),
          /* @__PURE__ */ jsx8(sdk.Button, { disabled: !ready, onClick: save, children: "Save and switch" })
        ] })
      ]
    }
  );
}
function RecolourHost() {
  const target = sdk.useValue($recolouring);
  if (!sdk.Dialog || !sdk.DialogContent || !sdk.setAccentOverride) return null;
  return /* @__PURE__ */ jsx8(sdk.Dialog, { onOpenChange: (open) => open ? null : closeRecolour(), open: Boolean(target), children: target ? /* @__PURE__ */ jsx8(Recolour, { name: target.name, start: target.hex }, `${target.name}:${target.hex || ""}`) : null });
}

// desktop-src/plugin.jsx
import { Fragment, jsx as jsx9, jsxs as jsxs7 } from "react/jsx-runtime";
var ROUTE = "/aether";
var baseName = (name) => String(name || "").replace(/-(light|dark)$/, "");
function BackdropHost() {
  const { theme, themeName, availableThemes } = sdk.useTheme();
  const active = sdk.useValue($active);
  const settings = sdk.useValue($settings);
  const painted = baseName(theme && theme.name);
  useEffect4(() => {
    $themeName.set(themeName);
  }, [themeName]);
  useEffect4(() => {
    $paintedName.set(painted);
  }, [painted]);
  useEffect4(() => {
    if (Array.isArray(availableThemes)) $themeList.set(availableThemes);
  }, [availableThemes]);
  useEffect4(() => {
    if (theme && !(sdk.$accentOverride && sdk.$accentOverride.get())) refreshFromBase(theme, painted);
  }, [theme, painted]);
  useEffect4(() => {
    if (active) backdrop.show(active, settings);
    else backdrop.hide();
  }, [active, settings]);
  return /* @__PURE__ */ jsxs7(Fragment, { children: [
    /* @__PURE__ */ jsx9(EditorHost, {}),
    /* @__PURE__ */ jsx9(RecolourHost, {})
  ] });
}
function AppearanceCard() {
  const active = sdk.useValue($active);
  const picks = PRESETS.slice(0, 4);
  return /* @__PURE__ */ jsxs7("div", { style: { display: "flex", flexDirection: "column", gap: 10, padding: "12px 0" }, children: [
    /* @__PURE__ */ jsx9(Styles, {}),
    /* @__PURE__ */ jsxs7("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }, children: [
      /* @__PURE__ */ jsxs7("div", { children: [
        /* @__PURE__ */ jsx9("div", { style: { fontWeight: 600, fontSize: "0.875rem" }, children: "Living themes" }),
        /* @__PURE__ */ jsxs7("div", { style: { fontSize: "0.75rem", color: "var(--ui-text-secondary)" }, children: [
          active ? `${active.label} is on. ` : "",
          "Animated scenes from Aether, or ask Hermes to paint your own."
        ] })
      ] }),
      /* @__PURE__ */ jsx9(sdk.Button, { onClick: () => sdk.host.navigate(ROUTE), size: "sm", variant: "secondary", children: "Open gallery" })
    ] }),
    /* @__PURE__ */ jsx9("div", { style: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }, children: picks.map((record) => /* @__PURE__ */ jsxs7(
      "button",
      {
        className: "ae-card",
        "data-active": active && active.slug === record.slug ? "" : void 0,
        onClick: () => applyRecord(record, { origin: "user" }),
        title: record.label,
        type: "button",
        children: [
          /* @__PURE__ */ jsx9(ScenePreview, { mock: false, record }),
          /* @__PURE__ */ jsx9("div", { className: "ae-card-body", children: /* @__PURE__ */ jsx9("div", { className: "ae-card-title", children: record.label }) })
        ]
      },
      record.slug
    )) }),
    active ? /* @__PURE__ */ jsxs7("div", { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
      /* @__PURE__ */ jsx9("span", { style: { fontSize: "0.75rem", color: "var(--ui-text-tertiary)" }, children: "Motion" }),
      /* @__PURE__ */ jsx9(MotionControl, { compact: true })
    ] }) : null
  ] });
}
function paletteCommands() {
  const commands = [
    { id: "aether.gallery", label: "Aether: Open theme gallery", keywords: ["theme", "background", "wallpaper", "backdrop"], run: () => sdk.host.navigate(ROUTE) },
    { id: "aether.off", label: "Aether: Turn the backdrop off", keywords: ["theme", "background"], run: () => turnOff() },
    {
      id: "aether.motion",
      label: "Aether: Cycle motion (full, calm, still)",
      keywords: ["animation", "pause", "reduce"],
      run: () => {
        const order = ["full", "calm", "still"];
        const next = order[(order.indexOf($settings.get().motion) + 1) % order.length];
        updateSettings({ motion: next });
        sdk.host.notify({ kind: "info", title: "Aether", message: `Motion: ${next}`, durationMs: 2500 });
      }
    },
    {
      id: "aether.describe",
      label: "Aether: Describe a new theme...",
      keywords: ["make", "create", "theme", "ask"],
      run: () => sdk.host.composer.setDraft && sdk.host.composer.setDraft(null, "Make me an Aether theme for Hermes Desktop: ")
    }
  ];
  return commands.map((data) => ({ id: data.id, area: sdk.PALETTE_AREA, data }));
}
var plugin_default = {
  id: "aether",
  name: "Aether",
  register(ctx) {
    bindStorage(ctx.storage);
    bindSync(ctx);
    backdrop.attach(ctx);
    ctx.onDispose(() => backdrop.hide());
    registerThemes($catalog.get());
    const unCatalog = $catalog.subscribe((catalog) => registerThemes(catalog));
    ctx.onDispose(unCatalog);
    ctx.register({ id: "backdrop-host", area: sdk.TITLEBAR_AREAS.center, render: () => /* @__PURE__ */ jsx9(BackdropHost, {}) });
    ctx.register({ id: "page", area: sdk.ROUTES_AREA, data: { path: ROUTE }, render: () => /* @__PURE__ */ jsx9(Gallery, {}) });
    ctx.registerMany(paletteCommands());
    ctx.register({ id: "chip", area: sdk.STATUSBAR_AREAS.right, order: 140, render: () => /* @__PURE__ */ jsx9(StatusChip, {}) });
    if (sdk.APPEARANCE_AREAS && sdk.APPEARANCE_AREAS.extra) {
      ctx.register({ id: "appearance", area: sdk.APPEARANCE_AREAS.extra, render: () => /* @__PURE__ */ jsx9(AppearanceCard, {}) });
    }
    if (typeof sdk.TRANSCRIPT_DIRECTIVE_AREA === "string") {
      ctx.register({
        id: "theme-card",
        area: sdk.TRANSCRIPT_DIRECTIVE_AREA,
        data: { name: "aether-theme", render: (props) => /* @__PURE__ */ jsx9(ThemeCardDirective, { ...props }) }
      });
    }
    if (ctx.registerSettingsPage) {
      ctx.registerSettingsPage({ id: "settings", title: "Aether", icon: "sparkle", render: () => /* @__PURE__ */ jsx9(SettingsPage, {}) });
    }
    wireSync(ctx);
    wireCommunity(ctx);
    sync();
  }
};
export {
  plugin_default as default
};
