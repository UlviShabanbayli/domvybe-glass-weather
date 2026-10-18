# Glass weather widget — UI component

**[Live demo](https://domvybe.com/components/glass-weather/)** · [Step-by-step tutorial](https://domvybe.com/library/glass-weather/) · [Download the ZIP](https://github.com/UlviShabanbayli/domvybe-glass-weather/releases/latest/download/glass-weather-source.zip)

A weather widget of frosted glass: pick an hour and the sky changes, rain runs down the pane with every drop a tiny lens, and fog you can wipe away.

Open `index.html` through any local static server (for example `python3 -m http.server`) and try it with a mouse,
a finger or the keyboard. Plain HTML, CSS and JavaScript; no build step, no libraries.

- `index.html` — the widget page: the glass card, the hour strip, the conditions, the Fog switch and the footer
- `css` — app.css: the card, the hour strip, the frost fallback without WebGL 2, the phone layout, reduced motion
- `js` — app.js (hours, conditions, wiping the fog, keys), glass.js (the one WebGL 2 shader: frost, rain drops as lenses, streaks, fog), icons.js (hand-drawn SVG weather icons)
- `img` — the three skies (sun, cloud, rain) with their blurred and foggy versions, AI-generated with Google Gemini

AURA weather, SkyGlass and Neo-Paris are made up, and the forecast is sample data in `js/app.js`. The three sky photos
were AI-generated (Google Gemini); the frosted glass, the rain drops, the streaks and the fog are one real-time WebGL 2
shader made in code, and the weather icons are hand-drawn SVG. Without WebGL 2 the pane is CSS frost. The page reads
Google Fonts (Montserrat, Playfair Display).

It respects `prefers-reduced-motion`. Made by Ulvi (Code with Ulvi) · domvybe.com

## Licence

MIT — see [LICENSE](LICENSE). Use it in your own projects, commercial ones included.
