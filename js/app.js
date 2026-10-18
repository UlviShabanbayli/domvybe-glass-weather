// DV54 SKYGLASS · AURA weather: the widget's DOM, state and input. The glass itself is js/glass.js.
import { SkyGlass } from './glass.js';
import { ICON_DEFS, icon } from './icons.js';

const KEY = 'dv54a.';
// storage from older builds never decides how the page opens
try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && k.startsWith('dv54') && !k.startsWith(KEY)) localStorage.removeItem(k); } } catch (e) { /* storage blocked */ }
const store = { get(k, d) { try { const v = localStorage.getItem(KEY + k); return v == null ? d : v; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(KEY + k, v); } catch (e) { /* ignore */ } } };

const SKIES = {
  sun: { sharp: 'img/sky_sun.jpg', blur: 'img/sky_sun_blur.jpg', fog: 'img/sky_sun_fog.jpg', sun: [0.215, 0.393] },
  cloud: { sharp: 'img/sky_cloud.jpg', blur: 'img/sky_cloud_blur.jpg', fog: 'img/sky_cloud_fog.jpg', sun: [0.22, 0.388] },
  rain: { sharp: 'img/sky_rain.jpg', blur: 'img/sky_rain_blur.jpg', fog: 'img/sky_rain_fog.jpg', sun: [0.223, 0.385] },
};
const SUN = { sun: 1, cloud: 0.42, rain: 0.22 };
// Neo-Paris this evening. Each hour carries the look of the glass: which sky, how much rain on the pane, fog, warmth.
const HOURS = [
  { t: 'Now', clock: '18:42', icon: 'shower', f: 72, word: 'Showers', cond: 'Showers clearing', sky: 'sun', rain: 0.72, streak: 0.22, fog: 0.1, warm: 0.8, pp: 40 },
  { t: '19:00', clock: '19:00', icon: 'sun', f: 71, word: 'Sunny', cond: 'Golden hour', sky: 'sun', rain: 0, streak: 0, fog: 0, warm: 1, pp: 5 },
  { t: '20:00', clock: '20:00', icon: 'partly', f: 68, word: 'Clouds', cond: 'Clouds gathering', sky: 'cloud', rain: 0.12, streak: 0, fog: 0.12, warm: 0.3, pp: 15 },
  { t: '21:00', clock: '21:00', icon: 'cloud', f: 66, word: 'Overcast', cond: 'Overcast', sky: 'cloud', rain: 0.3, streak: 0.08, fog: 0.28, warm: 0, pp: 30 },
  { t: '22:00', clock: '22:00', icon: 'rain', f: 63, word: 'Heavy rain', cond: 'Heavy rain', sky: 'rain', rain: 1, streak: 1, fog: 0.42, warm: 0, pp: 90 },
  { t: '23:00', clock: '23:00', icon: 'rain', f: 62, word: 'Rain', cond: 'Steady rain', sky: 'rain', rain: 0.86, streak: 0.68, fog: 0.36, warm: 0, pp: 75 },
  { t: '00:00', clock: '00:00', icon: 'cloud', f: 61, word: 'Easing', cond: 'Rain easing', sky: 'cloud', rain: 0.45, streak: 0.12, fog: 0.22, warm: 0, pp: 35 },
];
const WORD = { shower: 'Showers', sun: 'Sunny', partly: 'Partly cloudy', cloud: 'Cloudy', rain: 'Rain' };

document.body.insertAdjacentHTML('afterbegin', ICON_DEFS);
const $ = (s, r = document) => r.querySelector(s);
const html = document.documentElement;
const widget = $('#widget'), strip = $('#strip'), hoursEl = $('#hours'), live = $('#live');
const mqReduced = matchMedia('(prefers-reduced-motion: reduce)');
const state = { sel: 0, unit: store.get('unit', 'F') === 'C' ? 'C' : 'F', fog: false, expanded: false, reduced: mqReduced.matches };
html.classList.toggle('reduced', state.reduced);
const toUnit = (f) => state.unit === 'F' ? f : Math.round((f - 32) * 5 / 9);

// ---------- hourly cells ----------
hoursEl.innerHTML = HOURS.map((h, i) => `
  <button class="hour" type="button" role="radio" aria-checked="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-i="${i}">
    <span class="h-t">${h.t}</span>
    ${icon(h.icon)}
    <span class="more"><div>
      <span class="h-temp">${toUnit(h.f)}°</span>
      <span class="h-word">${h.word}</span>
      <span class="pp" style="--p:${h.pp / 100}"><i></i></span>
      <span class="h-pp">${h.pp}%</span>
    </div></span>
  </button>`).join('');
const cells = [...hoursEl.querySelectorAll('.hour')];
const cellLabel = (h) => `${h.t === 'Now' ? 'Now, ' + h.clock : h.t}: ${h.cond}, ${toUnit(h.f)} degrees, ${h.pp}% chance of rain`;
const labelCells = () => cells.forEach((c, i) => { c.setAttribute('aria-label', cellLabel(HOURS[i])); c.querySelector('.h-temp').textContent = toUnit(HOURS[i].f) + '°'; });
labelCells();

// ---------- temperature: rolling digit reels ----------
const digitsEl = $('#digits');
const COLS = 3;
digitsEl.innerHTML = Array.from({ length: COLS }, () => `<span class="dcol"><span class="reel">${'0123456789'.split('').map((d) => `<span>${d}</span>`).join('')}</span></span>`).join('');
const dcols = [...digitsEl.querySelectorAll('.dcol')];
let digitW = null;
function measureDigits() {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;font:inherit';
  $('.temp').appendChild(probe);
  digitW = '0123456789'.split('').map((d) => { probe.textContent = d; return probe.getBoundingClientRect().width; });
  const fs = parseFloat(getComputedStyle($('.temp')).fontSize);
  digitW = digitW.map((w) => w / fs);   // em
  probe.remove();
}
function setTemp(v, instant = false) {
  const s = String(v).padStart(COLS, ' ');
  dcols.forEach((c, i) => {
    const ch = s[i], reel = c.firstElementChild;
    if (instant) { c.style.transition = reel.style.transition = 'none'; }
    if (ch === ' ') { c.style.width = '0em'; }
    else { const d = +ch; c.style.width = (digitW ? digitW[d] : 0.6) + 'em'; reel.style.transform = `translateY(${-d * 1.25}em)`; }
    if (instant) { void c.offsetWidth; c.style.transition = reel.style.transition = ''; }
  });
  $('#w-unit').textContent = '°' + state.unit;
  $('#w-temp-sr').textContent = `${v} degrees ${state.unit === 'F' ? 'Fahrenheit' : 'Celsius'}`;
}

// ---------- the glass ----------
const canvas = $('#gl');
let glass = null;
try { glass = new SkyGlass(canvas, { reduced: state.reduced }); if (!glass.ok) glass = null; } catch (e) { glass = null; }

// selection lens: two edge springs (the leading edge runs ahead, so the lens stretches while it glides)
const lens = { l: 0, r: 0, vl: 0, vr: 0, y: 0, h: 0, init: false, last: performance.now() };
let rCache = { radius: 26 };
function lensTarget() {
  const c = cells[state.sel].getBoundingClientRect();
  const s = strip.getBoundingClientRect();
  const inset = 3;
  return { l: c.left + inset, r: c.right - inset, y: Math.max(c.top, s.top) + inset, h: Math.min(c.bottom, s.bottom) - Math.max(c.top, s.top) - inset * 2 };
}
function stepLens() {
  const now = performance.now(); const dt = Math.min(0.05, (now - lens.last) / 1000); lens.last = now;
  const t = lensTarget();
  if (!lens.init || state.reduced) { Object.assign(lens, { l: t.l, r: t.r, vl: 0, vr: 0, init: true }); lens.y = t.y; lens.h = t.h; return false; }
  lens.y = t.y; lens.h = t.h;
  const dir = Math.sign((t.l + t.r) / 2 - (lens.l + lens.r) / 2);
  const kLead = 260, kTrail = 120;
  const kl = dir < 0 ? kLead : kTrail, kr = dir > 0 ? kLead : kTrail;
  const steps = Math.max(1, Math.ceil(dt / (1 / 240))), h = dt / steps;
  for (let i = 0; i < steps; i++) {
    lens.vl += (kl * (t.l - lens.l) - 2 * Math.sqrt(kl) * 0.82 * lens.vl) * h; lens.l += lens.vl * h;
    lens.vr += (kr * (t.r - lens.r) - 2 * Math.sqrt(kr) * 0.82 * lens.vr) * h; lens.r += lens.vr * h;
  }
  const moving = Math.abs(t.l - lens.l) + Math.abs(t.r - lens.r) > 0.05 || Math.abs(lens.vl) + Math.abs(lens.vr) > 0.5;
  if (!moving) { lens.l = t.l; lens.r = t.r; lens.vl = lens.vr = 0; }
  return moving;
}
function getRects() {
  const w = widget.getBoundingClientRect(), s = strip.getBoundingClientRect();
  const moving = stepLens();
  if (glass) glass.rectsMoving = moving;
  return {
    w: { x: w.left, y: w.top, w: w.width, h: w.height }, wr: rCache.radius,
    s: { x: s.left, y: s.top, w: s.width, h: s.height }, sr: rCache.stripR,
    sel: { x: lens.l, y: lens.y, w: Math.max(0, lens.r - lens.l), h: lens.h }, selA: 1,
    scale: innerWidth < 620 ? 0.86 : 1,
    chips: chipEls.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }),
  };
}
const chipEls = [...document.querySelectorAll('.tool, .unit')];
function measureRadii() {
  rCache.radius = parseFloat(getComputedStyle(widget).borderTopLeftRadius) || 26;
  rCache.stripR = parseFloat(getComputedStyle(strip).borderTopLeftRadius) || 20;
  widget.style.setProperty('--strip-h', strip.offsetHeight + 'px');
}

// ---------- applying an hour ----------
function applyHour(i, { instant = false, announce = false, focus = false } = {}) {
  i = Math.max(0, Math.min(HOURS.length - 1, i));
  const prev = state.sel; state.sel = i;
  const h = HOURS[i];
  cells.forEach((c, k) => { c.setAttribute('aria-checked', String(k === i)); c.tabIndex = k === i ? 0 : -1; });
  if (focus) cells[i].focus({ preventScroll: true });
  // keep the picked cell in view in the phone's scrolling strip
  const sc = hoursEl; if (sc.scrollWidth > sc.clientWidth + 2) {
    const c = cells[i]; const left = c.offsetLeft - sc.offsetLeft, right = left + c.offsetWidth;
    if (left < sc.scrollLeft) sc.scrollTo({ left, behavior: instant || state.reduced ? 'auto' : 'smooth' });
    else if (right > sc.scrollLeft + sc.clientWidth) sc.scrollTo({ left: right - sc.clientWidth, behavior: instant || state.reduced ? 'auto' : 'smooth' });
  }
  $('#w-time').textContent = h.clock;
  const cond = $('#w-cond');
  if (instant || state.reduced) cond.textContent = h.cond;
  else if (cond.textContent !== h.cond) { cond.classList.add('swap'); setTimeout(() => { cond.textContent = h.cond; cond.classList.remove('swap'); }, 220); }
  // icon cross-fade
  const box = $('#w-icon'); const old = box.querySelector('.wx:not(.out)');
  if (!old || old.dataset.name !== h.icon) {
    box.insertAdjacentHTML('beforeend', icon(h.icon)); const nu = box.lastElementChild; nu.dataset.name = h.icon;
    if (old && !instant && !state.reduced) { nu.classList.add('out'); requestAnimationFrame(() => requestAnimationFrame(() => nu.classList.remove('out'))); old.classList.add('out'); setTimeout(() => old.remove(), 600); }
    else if (old) old.remove();
  }
  setTemp(toUnit(h.f), instant);
  if (glass) {
    glass.setSky(h.sky, { instant });
    glass.set({ rain: h.rain, streak: h.streak, fog: Math.max(h.fog, state.fog ? 1 : 0), warm: h.warm, sun: SUN[h.sky], frost: h.sky === 'sun' ? 0.3 : 0.38 }, instant);
    glass.keepAlive(4);
  }
  if (announce && prev !== i) live.textContent = cellLabel(h);
}

// ---------- fog, wipe, expand, unit ----------
const fogBtn = $('#fogBtn');
function setFog(on, { announce = true } = {}) {
  state.fog = on;
  fogBtn.setAttribute('aria-pressed', String(on));
  widget.classList.toggle('fogged', on);
  if (glass) glass.set({ fog: Math.max(HOURS[state.sel].fog, on ? 1 : 0) });
  if (announce) live.textContent = on ? 'The glass is fogged. Move across it, or press Wipe, to clear a path.' : 'Fog cleared.';
}
fogBtn.addEventListener('click', () => setFog(!state.fog));

let autoWipe = null;
function wipeDemo() {
  if (!glass) return Promise.resolve();
  if (autoWipe) cancelAnimationFrame(autoWipe.raf);
  const r = widget.getBoundingClientRect();
  // a hand wiping a fogged window: three overlapping sweeps, top to bottom
  const pts = [];
  const rows = 3, mx = r.width * 0.12, y0 = r.top + r.height * 0.22, y1 = r.top + r.height * 0.7;
  for (let k = 0; k <= rows; k++) {
    const y = y0 + (y1 - y0) * k / rows; const ltr = k % 2 === 0;
    pts.push([ltr ? r.left + mx : r.right - mx, y], [ltr ? r.right - mx : r.left + mx, y + (y1 - y0) / rows * 0.5]);
  }
  const dur = state.reduced ? 1 : 1500, t0 = performance.now();
  glass.endWipe();
  return new Promise((res) => {
    const seg = pts.length - 1;
    const step = (now) => {
      const u = Math.min(1, (now - t0) / dur); const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const f = e * seg, k = Math.min(seg - 1, Math.floor(f)), g = f - k;
      const x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * g, y = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * g;
      glass.wipe(x, y, { brush: Math.max(36, r.height * 0.11) });
      if (u < 1) autoWipe = { raf: requestAnimationFrame(step) }; else { glass.endWipe(); autoWipe = null; res(); }
    };
    if (state.reduced) { // draw the whole path at once
      for (let i = 0; i <= 60; i++) step(t0 + dur * i / 60);
    } else autoWipe = { raf: requestAnimationFrame(step) };
  });
}
$('#wipeBtn').addEventListener('click', () => { wipeDemo(); live.textContent = 'Wiped a path through the glass.'; });

const expandBtn = $('#expandBtn');
function setExpanded(on) {
  state.expanded = on;
  widget.classList.toggle('expanded', on);
  expandBtn.setAttribute('aria-expanded', String(on));
  expandBtn.querySelector('.sr-only').textContent = on ? 'Hide hourly details' : 'Show hourly details';
  if (glass) glass.keepAlive(state.reduced ? 6 : 90);
}
expandBtn.addEventListener('click', () => setExpanded(!state.expanded));

const unitBtns = [...document.querySelectorAll('.unit button')];
function setUnit(u, save = true) {
  state.unit = u; if (save) store.set('unit', u);
  unitBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.unit === u)));
  labelCells(); setTemp(toUnit(HOURS[state.sel].f));
}
unitBtns.forEach((b) => b.addEventListener('click', () => setUnit(b.dataset.unit)));

// ---------- hour input: pointer, keyboard ----------
cells.forEach((c, i) => c.addEventListener('click', () => applyHour(i, { announce: true })));
hoursEl.addEventListener('keydown', (e) => {
  const k = e.key; let i = state.sel;
  if (k === 'ArrowRight' || k === 'ArrowDown') i++; else if (k === 'ArrowLeft' || k === 'ArrowUp') i--;
  else if (k === 'Home') i = 0; else if (k === 'End') i = HOURS.length - 1; else return;
  e.preventDefault(); i = (i + HOURS.length) % HOURS.length;
  applyHour(i, { announce: true, focus: true });
});
hoursEl.addEventListener('scroll', () => glass && glass.keepAlive(3), { passive: true });

// ---------- wiping with the pointer ----------
let touchWiping = null;
widget.addEventListener('pointermove', (e) => {
  if (!glass) return;
  if (e.pointerType === 'mouse') { glass.wipe(e.clientX, e.clientY, { brush: 42 }); return; }
  if (touchWiping === e.pointerId) glass.wipe(e.clientX, e.clientY, { brush: 36 });
});
widget.addEventListener('pointerdown', (e) => {
  if (!glass || e.pointerType === 'mouse') return;
  if (e.target.closest('.hours') && hoursEl.scrollWidth > hoursEl.clientWidth + 2) return;   // let the strip scroll
  touchWiping = e.pointerId; glass.endWipe(); glass.wipe(e.clientX, e.clientY, { brush: 36, fresh: true });
});
const endTouch = (e) => { if (touchWiping === e.pointerId) { touchWiping = null; glass && glass.endWipe(); } };
widget.addEventListener('pointerup', endTouch); widget.addEventListener('pointercancel', endTouch);
widget.addEventListener('pointerleave', () => glass && glass.endWipe());
window.addEventListener('pointermove', (e) => { if (glass && e.pointerType === 'mouse' && !state.reduced) glass.setParallax((e.clientX / innerWidth - 0.5) * -2, (e.clientY / innerHeight - 0.5) * -2); }, { passive: true });

// ---------- environment ----------
function setReduced(r) { state.reduced = r; html.classList.toggle('reduced', r); if (glass) glass.setReduced(r); }
mqReduced.addEventListener('change', (e) => setReduced(e.matches));
document.addEventListener('visibilitychange', () => glass && glass.setVisible(!document.hidden));
const ro = new ResizeObserver(() => { measureRadii(); if (glass) glass.keepAlive(3); });
ro.observe(widget); ro.observe(strip);
addEventListener('resize', () => { if (glass) glass.resize(); measureRadii(); });

// ---------- boot ----------
const ready = (async () => {
  if (document.fonts && document.fonts.ready) { try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* ignore */ } }
  measureDigits(); measureRadii();
  setUnit(state.unit, false);
  applyHour(0, { instant: true });
  if (!glass) { html.classList.remove('booting'); html.classList.add('no-gl'); return; }
  try { await glass.load(SKIES); } catch (e) { html.classList.remove('booting'); html.classList.add('no-gl'); glass = null; return; }
  glass.getRects = getRects;
  const q = +new URLSearchParams(location.search).get('q');   // debug: canvas resolution factor
  if (q > 0 && q <= 1) glass.quality = q;
  glass.resize();
  glass.warm();
  glass.setSky('sun', { instant: true });
  const h = HOURS[0];
  glass.set({ rain: h.rain, streak: h.streak, fog: h.fog, warm: h.warm, sun: SUN[h.sky], frost: 0.3 }, true);
  await new Promise((res) => { glass.onFirstFrame = res; glass.start(); setTimeout(res, 1500); });
  html.classList.remove('booting'); html.classList.add('gl');
})();

window.__weather = {
  ready, HOURS, state,
  get glass() { return glass; },
  select: (i) => applyHour(i, { announce: true }),
  setFog, setExpanded, setUnit, wipe: wipeDemo,
  lens: () => ({ ...lens, target: lensTarget() }),
  rects: () => getRects(),
};
