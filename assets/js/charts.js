/**
 * SVG grafike. Sve mere su u koordinatama crteža; širinu određuje broj sati/dana,
 * a stranica ih horizontalno skroluje na užim ekranima.
 *
 * Boje dolaze iz CSS promenljivih (--c-cold, --c-warm, --c-rain, --c-wind, --c-gust),
 * da bi grafike i ostatak stranice delili istu paletu.
 */

const COL = 30;          // širina jednog sata
const PAD = { left: 14, right: 14, top: 10 };

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));

/** Glatka linija kroz tačke (Catmull-Rom → Bézier). */
function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6},` +
         `${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6},${p2[0]} ${p2[1]}`;
  }
  return d;
}

const scale = (v, min, max, from, to) =>
  max === min ? (from + to) / 2 : from + ((v - min) / (max - min)) * (to - from);

/**
 * Temperatura i verovatnoća padavina za narednih 48 h.
 * Dve veličine — dva reda sa zajedničkom vremenskom osom, nikad dve y-ose.
 */
export function hoursChart(hours) {
  const n = hours.length;
  const width = PAD.left + n * COL + PAD.right;
  const tempTop = 30, tempH = 84;
  const rainTop = tempTop + tempH + 26, rainH = 40;
  const sunTop = rainTop + rainH + 24, sunH = 22;
  const labelY = sunTop + sunH + 18;
  const height = labelY + 14;

  const temps = hours.map((h) => h.temp);
  const lo = Math.min(...temps), hi = Math.max(...temps);
  const x = (i) => PAD.left + i * COL + COL / 2;
  const y = (t) => scale(t, lo, hi, tempTop + tempH - 8, tempTop + 8);

  const points = hours.map((h, i) => [x(i), y(h.temp)]);
  const line = smoothPath(points);
  const area = `${line} L${x(n - 1)} ${tempTop + tempH} L${x(0)} ${tempTop + tempH} Z`;

  // direktne oznake samo na najtoplijoj i najhladnijoj tački — nikad na svakoj
  const marked = new Set([temps.indexOf(hi), temps.indexOf(lo)]);

  const rainBars = hours.map((h, i) => {
    if (!h.pop || h.pop < 5) return '';
    const barH = Math.max(2, (h.pop / 100) * rainH);
    return `<rect class="c-rain" x="${x(i) - 7}" y="${rainTop + rainH - barH}" width="14" height="${barH}" rx="4"
             opacity="${0.35 + (h.pop / 100) * 0.65}"/>`;
  }).join('');

  // Sunčanost: minuti sunca u svakom satu, 0–60. Puna visina = sat bez oblaka.
  const sunBars = hours.map((h, i) => {
    if (typeof h.sun !== 'number') return '';
    const share = Math.max(0, Math.min(1, h.sun / 60));
    if (share <= 0.02) return '';
    const barH = Math.max(3, share * sunH);
    return `<rect class="c-sun" x="${x(i) - 7}" y="${sunTop + sunH - barH}" width="14" height="${barH}" rx="3"
             opacity="${0.4 + share * 0.6}"/>`;
  }).join('');

  const marks = hours.map((h, i) => `
    <g class="c-col" data-index="${i}">
      <rect x="${x(i) - COL / 2}" y="0" width="${COL}" height="${height}" fill="transparent"/>
      ${i % 3 === 0 ? `<text class="c-axis" x="${x(i)}" y="${labelY}" text-anchor="middle">${esc(h.label)}</text>` : ''}
      ${marked.has(i) ? `<text class="c-value" x="${x(i)}" y="${y(h.temp) - 11}" text-anchor="middle">${Math.round(h.temp)}°</text>` : ''}
      ${h.isNow ? `<line class="c-now" x1="${x(i)}" y1="${tempTop - 2}" x2="${x(i)}" y2="${sunTop + sunH}"/>` : ''}
      <circle class="c-dot" cx="${x(i)}" cy="${y(h.temp)}" r="3.5"/>
    </g>`).join('');

  return `
<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="chart__svg" role="img"
     aria-label="Temperatura i verovatnoća padavina za narednih ${n} sati">
  <defs>
    <linearGradient id="tempGrad" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="var(--c-cold)"/><stop offset="1" stop-color="var(--c-warm)"/>
    </linearGradient>
    <linearGradient id="tempFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--c-warm)" stop-opacity=".22"/>
      <stop offset="1" stop-color="var(--c-cold)" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <text class="c-title" x="${PAD.left}" y="14">Temperatura</text>
  <path d="${area}" fill="url(#tempFill)"/>
  <path d="${line}" fill="none" stroke="url(#tempGrad)" stroke-width="2.5" stroke-linecap="round"/>

  <text class="c-title" x="${PAD.left}" y="${rainTop - 8}">Verovatnoća padavina</text>
  <line class="c-base" x1="${PAD.left}" y1="${rainTop + rainH}" x2="${width - PAD.right}" y2="${rainTop + rainH}"/>
  ${rainBars}

  <text class="c-title" x="${PAD.left}" y="${sunTop - 8}">Sunčanost, minuta po satu</text>
  <line class="c-base" x1="${PAD.left}" y1="${sunTop + sunH}" x2="${width - PAD.right}" y2="${sunTop + sunH}"/>
  ${sunBars}
  ${marks}
</svg>`;
}

/**
 * Vetar i udari za narednih 48 h.
 * Udari nisu druga veličina nego gornja granica iste, pa dele boju: razliku nose
 * oblik (puna naspram isprekidane linije), popunjen pojas između njih i legenda.
 */
export function windChart(hours) {
  const n = hours.length;
  const width = PAD.left + n * COL + PAD.right;
  const top = 26, plotH = 88;
  const arrowY = top + plotH + 22;
  const labelY = arrowY + 24;
  const height = labelY + 12;

  const max = Math.max(10, ...hours.map((h) => h.gust ?? h.wind));
  const x = (i) => PAD.left + i * COL + COL / 2;
  const y = (v) => top + plotH - (v / max) * plotH;

  const windPoints = hours.map((h, i) => [x(i), y(h.wind)]);
  const gustPoints = hours.map((h, i) => [x(i), y(h.gust ?? h.wind)]);
  const windLine = smoothPath(windPoints);
  const gustLine = smoothPath(gustPoints);
  const area = `${windLine} L${x(n - 1)} ${top + plotH} L${x(0)} ${top + plotH} Z`;
  // pojas između prosečnog vetra i udara — vizuelno "koliko vetar udara jače"
  const band = `${gustLine} L${x(n - 1)} ${y(hours[n - 1].wind)} ` +
    smoothPath([...windPoints].reverse()).replace(/^M[^C]*/, '') + ' Z';

  const arrows = hours.map((h, i) => i % 3 !== 0 ? '' : `
    <g transform="translate(${x(i)} ${arrowY}) rotate(${h.dir})">
      <path class="c-arrow" d="M0 -7 L4.5 6 L0 3 L-4.5 6 Z"/>
    </g>
    <text class="c-axis" x="${x(i)}" y="${labelY}" text-anchor="middle">${esc(h.label)}</text>`).join('');

  const peak = hours.reduce((best, h, i) => (h.gust ?? 0) > (hours[best].gust ?? 0) ? i : best, 0);

  return `
<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="chart__svg" role="img"
     aria-label="Brzina vetra i udari za narednih ${n} sati">
  <line class="c-base" x1="${PAD.left}" y1="${top + plotH}" x2="${width - PAD.right}" y2="${top + plotH}"/>
  <path d="${area}" fill="var(--c-wind)" opacity=".10"/>
  <path d="${band}" fill="var(--c-wind)" opacity=".15"/>
  <path d="${windLine}" fill="none" stroke="var(--c-wind)" stroke-width="2.5" stroke-linecap="round"/>
  <path d="${gustLine}" fill="none" stroke="var(--c-gust)" stroke-width="2" stroke-dasharray="5 4" stroke-linecap="round"/>
  <text class="c-value" x="${x(peak)}" y="${y(hours[peak].gust) - 10}" text-anchor="middle">
    ${Math.round(hours[peak].gust)} km/h
  </text>
  ${arrows}
  ${hours.map((h, i) => `<g class="c-col" data-index="${i}">
      <rect x="${x(i) - COL / 2}" y="0" width="${COL}" height="${height}" fill="transparent"/></g>`).join('')}
</svg>`;
}

/**
 * Kompas: vrh kazaljke stoji na strani sa koje vetar duva.
 * Brojke stoje pored dijala u HTML-u, ne u crtežu — jedno mesto po podatku.
 */
export function compass(direction, speed) {
  const r = 54;
  const ticks = [0, 45, 90, 135, 180, 225, 270, 315].map((d) => {
    const a = (d - 90) * Math.PI / 180;
    const major = d % 90 === 0;
    return `<line class="k-tick ${major ? 'k-tick--major' : ''}"
      x1="${64 + Math.cos(a) * (r - (major ? 10 : 6))}" y1="${64 + Math.sin(a) * (r - (major ? 10 : 6))}"
      x2="${64 + Math.cos(a) * r}" y2="${64 + Math.sin(a) * r}"/>`;
  }).join('');

  const labels = [['S', 0], ['I', 90], ['J', 180], ['Z', 270]].map(([txt, d]) => {
    const a = (d - 90) * Math.PI / 180;
    return `<text class="k-label" x="${64 + Math.cos(a) * (r - 20)}" y="${64 + Math.sin(a) * (r - 20) + 4}"
             text-anchor="middle">${txt}</text>`;
  }).join('');

  const strength = Math.min(1, speed / 60);

  return `
<svg viewBox="0 0 128 128" class="compass__svg" role="img"
     aria-label="Vetar duva iz pravca ${Math.round(direction)} stepeni, brzinom ${Math.round(speed)} kilometara na sat">
  <circle class="k-ring" cx="64" cy="64" r="${r}"/>
  ${ticks}${labels}
  <g transform="rotate(${direction} 64 64)">
    <path class="k-needle" d="M64 18 L71 40 L64 36 L57 40 Z"/>
    <line class="k-shaft" x1="64" y1="38" x2="64" y2="64" stroke-width="${2 + strength * 2}"/>
  </g>
  <circle class="k-hub" cx="64" cy="64" r="3.5"/>
</svg>`;
}

/** Traka dnevnog raspona temperature u odnosu na ceo prikazani period. */
export function rangeBar(min, max, lo, hi) {
  const left = ((min - lo) / (hi - lo)) * 100;
  const right = ((hi - max) / (hi - lo)) * 100;
  return `<span class="range"><i style="left:${left}%;right:${right}%"></i></span>`;
}

/** Mera pouzdanosti kao tri segmenta — oblik nosi značenje, boja ga samo pojačava. */
export function confidenceMeter(level, label) {
  const bars = [0, 1, 2].map((i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
  return `<span class="conf conf--${level}" title="${esc(label)}" aria-label="${esc(label)}">${bars}</span>`;
}
