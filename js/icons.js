// Glossy weather icons, hand-drawn SVG symbols (no icon font, no raster). Inserted once; used with <use href="#wx-…">.
const CLOUD = 'M17 46h31a12 12 0 0 0 1.6-23.9A16.5 16.5 0 0 0 18.4 18 13.9 13.9 0 0 0 17 46z';
const CLOUD_S = 'M23 50h28a10 10 0 0 0 1.3-19.9A13.8 13.8 0 0 0 26.6 27 11.6 11.6 0 0 0 23 50z';

export const ICON_DEFS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="g-sun" cx="40%" cy="36%" r="70%">
      <stop offset="0" stop-color="#fffbe6"/><stop offset=".35" stop-color="#ffe17a"/><stop offset=".78" stop-color="#ffb52e"/><stop offset="1" stop-color="#f08a12"/>
    </radialGradient>
    <radialGradient id="g-glow"><stop offset="0" stop-color="#ffd66b" stop-opacity=".55"/><stop offset="1" stop-color="#ffb52e" stop-opacity="0"/></radialGradient>
    <linearGradient id="g-ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a3"/><stop offset="1" stop-color="#ffb52e"/></linearGradient>
    <linearGradient id="g-cloud" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#f3f1f4"/><stop offset="1" stop-color="#c9ccd8"/>
    </linearGradient>
    <linearGradient id="g-cloud-d" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f4f5f9"/><stop offset=".55" stop-color="#cfd3de"/><stop offset="1" stop-color="#8f97aa"/>
    </linearGradient>
    <linearGradient id="g-cloud-b" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e9e6f2"/><stop offset="1" stop-color="#a7a9bf"/>
    </linearGradient>
    <linearGradient id="g-drop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe6ff"/><stop offset="1" stop-color="#3f8cf0"/></linearGradient>
    <linearGradient id="g-sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  </defs>
  <symbol id="wx-sun" viewBox="0 0 64 64">
    <circle cx="32" cy="32" r="30" fill="url(#g-glow)"/>
    <g class="rays" fill="url(#g-ray)">
      ${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x="30.4" y="3.5" width="3.2" height="9" rx="1.6" transform="rotate(${a} 32 32)"/>`).join('')}
    </g>
    <circle cx="32" cy="32" r="13.5" fill="url(#g-sun)"/>
    <ellipse cx="27.5" cy="26.5" rx="6" ry="3.6" fill="url(#g-sheen)" opacity=".7" transform="rotate(-25 27.5 26.5)"/>
  </symbol>
  <symbol id="wx-cloud" viewBox="0 0 64 64">
    <path d="${CLOUD}" transform="translate(-3 3) scale(1.04)" fill="url(#g-cloud-b)" opacity=".55"/>
    <path d="${CLOUD}" fill="url(#g-cloud)"/>
    <path d="M22 24a11 11 0 0 1 17-4" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".9"/>
  </symbol>
  <symbol id="wx-partly" viewBox="0 0 64 64">
    <g transform="translate(14 -4) scale(.62)"><use href="#wx-sun"/></g>
    <path d="${CLOUD_S}" transform="translate(-9 0) scale(1.08)" fill="url(#g-cloud)"/>
    <path d="M23 33a9 9 0 0 1 13-4" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none" opacity=".9" transform="translate(-8 0) scale(1.08)"/>
  </symbol>
  <symbol id="wx-rain" viewBox="0 0 64 64">
    <g class="drops" fill="url(#g-drop)">
      <path d="M22 47c0 0 3.2 4.6 3.2 6.6a3.2 3.2 0 0 1-6.4 0c0-2 3.2-6.6 3.2-6.6z"/>
      <path d="M33 50c0 0 3.2 4.6 3.2 6.6a3.2 3.2 0 0 1-6.4 0c0-2 3.2-6.6 3.2-6.6z"/>
      <path d="M44 47c0 0 3.2 4.6 3.2 6.6a3.2 3.2 0 0 1-6.4 0c0-2 3.2-6.6 3.2-6.6z"/>
    </g>
    <path d="${CLOUD}" transform="translate(0 -6)" fill="url(#g-cloud-d)"/>
    <path d="M22 18a11 11 0 0 1 17-4" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".85"/>
  </symbol>
  <symbol id="wx-shower" viewBox="0 0 64 64">
    <g transform="translate(18 -6) scale(.6)"><use href="#wx-sun"/></g>
    <g class="drops" fill="url(#g-drop)">
      <path d="M19 47c0 0 3 4.3 3 6.2a3 3 0 0 1-6 0c0-1.9 3-6.2 3-6.2z"/>
      <path d="M30 50c0 0 3 4.3 3 6.2a3 3 0 0 1-6 0c0-1.9 3-6.2 3-6.2z"/>
      <path d="M41 47c0 0 3 4.3 3 6.2a3 3 0 0 1-6 0c0-1.9 3-6.2 3-6.2z"/>
    </g>
    <path d="${CLOUD}" transform="translate(-4 -6)" fill="url(#g-cloud-d)"/>
    <path d="M18 18a11 11 0 0 1 17-4" stroke="#fff" stroke-width="2.2" stroke-linecap="round" fill="none" opacity=".85"/>
  </symbol>
  <symbol id="wx-mark" viewBox="0 0 64 64">
    <g transform="translate(16 -2) scale(.66)"><use href="#wx-sun"/></g>
    <path d="${CLOUD_S}" transform="translate(-10 2) scale(1.1)" fill="url(#g-cloud)"/>
  </symbol>
</svg>`;

export const icon = (name, cls = '') => `<svg class="wx ${cls}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="#wx-${name}"/></svg>`;
