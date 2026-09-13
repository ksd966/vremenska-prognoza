/**
 * Vremenska prognoza — orkestracija i prikaz.
 *
 * Vodeće pravilo: ništa se ne prikazuje sa više preciznosti nego što podatak nosi.
 * Sat po sat samo do 48 h, dan po dan dok pouzdanost to dozvoljava, dalje samo trend.
 */
import { searchPlaces, loadWeather, refreshCurrent } from './api.js';
import { describe, icon, skyTheme } from './weather-codes.js';
import { sunTimes, moonPhase, moonTimes, clearSkyUv } from './astro.js';
import { hoursChart, windChart, compass, rangeBar, confidenceMeter } from './charts.js';
import {
  LOCALE, round, temp, beaufort, windRose, shoreWind, confidence, TREND_FROM_DAY,
  uvLevel, hhmm, duration, dayName, shortDate, rain
} from './format.js';

const STORAGE = {
  place: 'vremenska-prognoza:mesto',
  facing: 'vremenska-prognoza:plaza',
  snapshot: 'vremenska-prognoza:posledji-podaci',
  installTip: 'vremenska-prognoza:savet-instalacija'
};

/** Ritam osvežavanja u realnom vremenu. */
const REFRESH = {
  light: 3 * 60 * 1000,    // trenutno stanje i nowcast
  full: 15 * 60 * 1000,    // cela prognoza
  stale: 6 * 60 * 1000,    // posle ovoga podaci više nisu „uživo"
  old: 30 * 60 * 1000      // posle ovoga se traži ponovno učitavanje
};

const QUICK = [
  { name: 'Olympic Beach', admin1: 'Pieria', country: 'Grčka', latitude: 40.2536, longitude: 22.5968 },
  { name: 'Beograd', country: 'Srbija', latitude: 44.804, longitude: 20.4651 },
  { name: 'Novi Sad', country: 'Srbija', latitude: 45.2671, longitude: 19.8335 },
  { name: 'Solun', country: 'Grčka', latitude: 40.6403, longitude: 22.9439 }
];

const $ = (s) => document.querySelector(s);
const el = new Proxy({}, { get: (_, id) => document.getElementById(String(id).replace(/_/g, '-')) });

let state = {
  place: null, data: null, facing: 90, clock: null, abort: null, active: -1,
  fetchedAt: 0, lightTimer: null, fullTimer: null, ageTimer: null, busy: false
};

/* ====================================================================== pomoćno */

const placeLabel = (p) =>
  [p.name, p.admin1 && p.admin1 !== p.name ? p.admin1 : null, p.country].filter(Boolean).join(', ');

const isoDate = (iso) => iso.slice(0, 10).split('-').map(Number);
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function setStatus(message, kind = 'info') {
  el.status.hidden = !message;
  el.status.textContent = message || '';
  el.status.dataset.kind = kind;
}

/* ====================================================================== pretraga */

function closeSuggestions() {
  el.suggestions.hidden = true;
  el.suggestions.innerHTML = '';
  el['search-input'].setAttribute('aria-expanded', 'false');
  state.active = -1;
}

function showSuggestions(results) {
  if (!results.length) return closeSuggestions();

  el.suggestions.innerHTML = results.map((r, i) =>
    `<li role="option" aria-selected="false" data-index="${i}">
       <b>${r.name}</b><span>${[r.admin1, r.country].filter(Boolean).join(', ')}</span>
     </li>`).join('');
  el.suggestions.hidden = false;
  el['search-input'].setAttribute('aria-expanded', 'true');
  state.active = -1;

  el.suggestions.querySelectorAll('li').forEach((li) =>
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      choose(results[Number(li.dataset.index)]);
    }));
}

function moveSelection(delta) {
  const items = [...el.suggestions.querySelectorAll('li')];
  if (!items.length) return;
  state.active = (state.active + delta + items.length) % items.length;
  items.forEach((li, i) => li.setAttribute('aria-selected', String(i === state.active)));
}

function initSearch() {
  let timer;
  const input = el['search-input'];

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) return closeSuggestions();

    timer = setTimeout(async () => {
      state.abort?.abort();
      state.abort = new AbortController();
      try {
        showSuggestions(await searchPlaces(q, state.abort.signal));
      } catch (err) {
        if (err.name !== 'AbortError') closeSuggestions();
      }
    }, 250);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveSelection(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSelection(-1); }
    else if (e.key === 'Escape') closeSuggestions();
  });

  el['search-form'].addEventListener('submit', async (e) => {
    e.preventDefault();
    const items = [...el.suggestions.querySelectorAll('li')];
    if (state.active > -1 && items[state.active]) {
      return items[state.active].dispatchEvent(new MouseEvent('mousedown'));
    }
    const q = input.value.trim();
    if (q.length < 2) return;
    try {
      const [first] = await searchPlaces(q);
      if (first) choose(first);
      else setStatus(`Nije pronađeno mesto „${q}”.`, 'warn');
    } catch {
      setStatus('Pretraga trenutno nije dostupna.', 'warn');
    }
  });

  document.addEventListener('click', (e) => {
    if (!el['search-form'].contains(e.target)) closeSuggestions();
  });

  el['geo-btn'].addEventListener('click', () => {
    if (!navigator.geolocation) return setStatus('Pregledač ne podržava geolokaciju.', 'warn');
    el['geo-btn'].classList.add('is-busy');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        el['geo-btn'].classList.remove('is-busy');
        choose({
          name: 'Moja lokacija',
          label: `Moja lokacija · ${coords.latitude.toFixed(2)}, ${coords.longitude.toFixed(2)}`,
          latitude: coords.latitude, longitude: coords.longitude
        });
      },
      () => {
        el['geo-btn'].classList.remove('is-busy');
        setStatus('Pristup lokaciji je odbijen — pretraži mesto ručno.', 'warn');
      },
      { timeout: 10000, maximumAge: 600000 }
    );
  });
}

/* ====================================================================== sada */

function renderNow(place, d) {
  const c = d.forecast.current;
  const day = d.forecast.daily;
  const isDay = c.is_day === 1;

  document.body.dataset.sky = skyTheme(c.weather_code, isDay);

  el.place.textContent = place.label || placeLabel(place);
  el.temp.innerHTML = `<span>${round(c.temperature_2m)}</span><small>°</small>`;
  el['now-icon'].innerHTML = icon(c.weather_code, isDay);
  el.condition.textContent = describe(c.weather_code);
  el.feels.textContent = `Oseća se kao ${temp(c.apparent_temperature)}`;
  el['today-range'].textContent = `danas ${temp(day.temperature_2m_max[0])} / ${temp(day.temperature_2m_min[0])}`;

  const bft = beaufort(c.wind_speed_10m);
  const rose = windRose(c.wind_direction_10m);
  el['wind-now'].innerHTML = `${round(c.wind_speed_10m)}<small>km/h</small>`;
  el['wind-bft'].textContent = `${bft.level} Bft · ${rose.short}`;
  el['gust-now'].innerHTML = `${round(c.wind_gusts_10m)}<small>km/h</small>`;
  el['gust-note'].textContent = c.wind_gusts_10m > c.wind_speed_10m * 1.6 ? 'naglašeni udari' : 'ujednačeno';

  el['rain-now'].innerHTML = c.precipitation > 0 ? `${c.precipitation.toFixed(1)}<small>mm/h</small>` : 'nema';
  el.humidity.innerHTML = `${round(c.relative_humidity_2m)}<small>%</small>`;
  el.pressure.textContent = `${round(c.pressure_msl)} hPa`;
}

/** Rečenica o narednih 12 h — ono što bi čovek prvo pitao. */
function renderSummary(hours) {
  const next = hours.slice(0, 12);
  if (!next.length) return;

  const wet = next.filter((h) => h.pop >= 40);
  const maxGust = Math.max(...next.map((h) => h.gust ?? h.wind));
  const lo = Math.min(...next.map((h) => h.temp));
  const hi = Math.max(...next.map((h) => h.temp));

  const parts = [];
  if (!wet.length) {
    parts.push('Narednih 12 h bez značajnih padavina');
  } else {
    const strongest = wet.reduce((a, b) => (b.pop > a.pop ? b : a));
    const start = wet[0].isNow ? 'Padavine su moguće već sada' : `Padavine su verovatne od ${wet[0].label}`;
    const peak = strongest.isNow || strongest === wet[0] ? `${strongest.pop}%` : `vrhunac oko ${strongest.label}, ${strongest.pop}%`;
    parts.push(`${start} (${peak})`);
  }
  parts.push(`temperatura ${Math.round(lo)}–${Math.round(hi)}°`);
  parts.push(maxGust >= 50 ? `udari vetra do ${Math.round(maxGust)} km/h` : `vetar do ${Math.round(maxGust)} km/h`);

  el.summary.textContent = parts.join(', ') + '.';
  el['rain-next'].textContent = !wet.length ? 'suvo narednih 12 h'
    : wet[0].isNow ? 'kiša je moguća odmah' : `sledeća kiša oko ${wet[0].label}`;
}

/* ====================================================================== vetar */

function renderWind(d, hours) {
  const c = d.forecast.current;
  const day = d.forecast.daily;
  const bft = beaufort(c.wind_speed_10m);
  const rose = windRose(c.wind_direction_10m);

  el.compass.innerHTML = compass(c.wind_direction_10m, c.wind_speed_10m);
  el['wind-dir'].textContent = `Duva sa ${rose.from} (${rose.short})`;
  el['wind-speed'].textContent = `${round(c.wind_speed_10m)} km/h`;
  el['wind-scale'].textContent = `${bft.level} Bft — ${bft.label}`;

  const peak = hours.reduce((a, b) => ((b.gust ?? 0) > (a.gust ?? 0) ? b : a), hours[0]);
  const rows = [
    ['Danas najjače', `${round(day.wind_speed_10m_max[0])} km/h`, `udari ${round(day.wind_gusts_10m_max[0])} km/h`],
    ['Najjači udar (48 h)', `${round(peak.gust)} km/h`, `oko ${peak.label}`],
    ['Preovlađujući pravac', capitalize(windRose(day.wind_direction_10m_dominant[0]).long),
      `${round(day.wind_direction_10m_dominant[0])}°`],
    ['Bofor sada', `${bft.level} Bft`, bft.label]
  ];

  if (d.marine) {
    const shore = shoreWind(c.wind_direction_10m, state.facing);
    rows.push(['Za plažu', capitalize(shore.label), shore.note]);
  }

  el['wind-rows'].innerHTML = rows.map(([label, value, note]) =>
    `<div class="wrow"><span class="wrow__label">${label}</span>
       <span class="wrow__value">${value}</span><span class="wrow__note">${note}</span></div>`).join('');

  el['wind-chart'].innerHTML = windChart(hours);
  attachTooltip(el['wind-chart'], hours, (h) =>
    `<b>${h.label}</b><br>vetar ${Math.round(h.wind)} km/h (${beaufort(h.wind).level} Bft)<br>
     udari ${Math.round(h.gust)} km/h<br>duva sa ${windRose(h.dir).from}`);
}

/* ====================================================================== more */

function renderSea(d) {
  const section = el['sea-section'];
  const marine = d.marine?.current;
  const sst = marine?.sea_surface_temperature;

  if (!marine || typeof sst !== 'number') {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  const wave = marine.wave_height;
  const shore = shoreWind(d.forecast.current.wind_direction_10m, state.facing);
  const waveNote = wave < 0.3 ? 'mirno' : wave < 0.75 ? 'blag talas' : wave < 1.25 ? 'umeren talas' : 'jak talas';

  el.sea.innerHTML = `
    <article class="card sea__card">
      <p class="tile__label">Temperatura mora</p>
      <p class="tile__value">${round(sst)}<small>°C</small></p>
      <p class="tile__extra">${sst >= 24 ? 'prijatno za kupanje' : sst >= 20 ? 'sveže, ali ugodno' : 'hladno'}</p>
    </article>
    <article class="card sea__card">
      <p class="tile__label">Talas</p>
      <p class="tile__value">${wave?.toFixed(1) ?? '–'}<small>m</small></p>
      <p class="tile__extra">${waveNote}</p>
    </article>
    <article class="card sea__card sea__card--shore" data-shore="${shore.type}">
      <p class="tile__label">Vetar u odnosu na obalu</p>
      <p class="tile__value tile__value--text">${shore.label}</p>
      <p class="tile__extra">${shore.note}</p>
    </article>`;
}

/* ====================================================================== nowcast */

/**
 * Padavine u koracima od 15 minuta za naredna dva sata.
 * Ovo je jedini deo prognoze koji se menja iz minuta u minut, pa ide odmah ispod
 * trenutnog stanja i osvežava se češće od svega ostalog.
 */
function renderNowcast(d) {
  const m = d.forecast.minutely_15;
  const section = el.nowcast;

  if (!m?.time?.length) { section.hidden = true; return; }

  const now = Date.now();
  const steps = m.time
    .map((time, i) => ({ time, mm: m.precipitation?.[i] ?? 0, at: new Date(time).getTime() }))
    .filter((step) => step.at >= now - 15 * 60 * 1000)
    .slice(0, 8);

  if (!steps.length) { section.hidden = true; return; }
  section.hidden = false;

  const peak = Math.max(...steps.map((s) => s.mm));
  const scale = Math.max(0.5, peak);
  const firstWet = steps.find((s) => s.mm >= 0.1);

  el['nowcast-bars'].innerHTML = steps.map((step) => {
    const height = step.mm < 0.05 ? 3 : Math.max(6, (step.mm / scale) * 44);
    return `<i style="height:${height}px" data-dry="${step.mm < 0.05}"
              title="${hhmm(step.time)} · ${step.mm.toFixed(1)} mm"></i>`;
  }).join('');

  el['nowcast-note'].textContent = !firstWet
    ? 'suvo'
    : firstWet === steps[0]
      ? `pada sada, ${peak.toFixed(1)} mm u vrhuncu`
      : `kiša oko ${hhmm(firstWet.time)}`;
}

/* ============================================================ podaci u realnom vremenu */

function timeAgo(ms) {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return 'upravo sada';
  if (minutes === 1) return 'pre 1 minut';
  if (minutes < 5) return `pre ${minutes} minuta`;
  return `pre ${minutes} min`;
}

/** Traka koja stalno govori koliko su podaci stari i da li je veza živa. */
function updateLiveState() {
  if (!state.fetchedAt) return;

  const age = Date.now() - state.fetchedAt;
  const offline = !navigator.onLine;
  const level = offline ? 'offline' : age > REFRESH.stale ? 'stale' : 'live';

  el.live.dataset.state = level;
  el['live-text'].textContent =
    offline ? `Van mreže — podaci od ${new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(state.fetchedAt)}`
    : level === 'live' ? `Uživo · osveženo ${timeAgo(age)}`
    : `Podaci osveženi ${timeAgo(age)}`;
}

/** Često i jeftino: samo trenutno stanje i naredna dva sata. */
async function lightRefresh() {
  if (!state.place || !state.data || state.busy || document.hidden || !navigator.onLine) return;
  state.busy = true;

  try {
    const fresh = await refreshCurrent(state.place);
    state.data.forecast.current = fresh.current;
    if (fresh.minutely_15) state.data.forecast.minutely_15 = fresh.minutely_15;
    state.fetchedAt = Date.now();

    renderNow(state.place, state.data);
    renderNowcast(state.data);
    renderWind(state.data, buildHours(state.data));
    renderSea(state.data);
    saveSnapshot();
    updateLiveState();
  } catch { /* sledeći ciklus */ } finally {
    state.busy = false;
  }
}

function startRealtime() {
  clearInterval(state.lightTimer);
  clearInterval(state.fullTimer);
  clearInterval(state.ageTimer);

  state.lightTimer = setInterval(lightRefresh, REFRESH.light);
  state.fullTimer = setInterval(() => { if (!document.hidden) load(state.place, { quiet: true }); }, REFRESH.full);
  state.ageTimer = setInterval(updateLiveState, 15000);
  updateLiveState();
}

/* ------------------------------------------------------- keširanje poslednjeg stanja */

function saveSnapshot() {
  try {
    localStorage.setItem(STORAGE.snapshot, JSON.stringify({
      place: state.place, data: state.data, fetchedAt: state.fetchedAt
    }));
  } catch { /* pun ili nedostupan localStorage */ }
}

/** Odmah iscrtaj poslednje viđeno stanje, pa tek onda kreni po sveže. */
function hydrateFromSnapshot() {
  let snapshot = null;
  try { snapshot = JSON.parse(localStorage.getItem(STORAGE.snapshot) || 'null'); } catch { /* ignoriši */ }
  if (!snapshot?.data?.forecast || Date.now() - snapshot.fetchedAt > 12 * 60 * 60 * 1000) return false;

  state.place = snapshot.place;
  state.data = snapshot.data;
  state.fetchedAt = snapshot.fetchedAt;

  try {
    renderAll(snapshot.place, snapshot.data);
    updateLiveState();
    return true;
  } catch {
    return false;
  }
}

/* ====================================================================== 48 h */

function buildHours(d) {
  const h = d.forecast.hourly;
  const now = d.forecast.current.time.slice(0, 13);
  const start = Math.max(0, h.time.findIndex((t) => t.slice(0, 13) === now));

  return h.time.slice(start, start + 48).map((time, k) => {
    const i = start + k;
    return {
      time,
      label: k === 0 ? 'sada' : hhmm(time),
      isNow: k === 0,
      temp: h.temperature_2m[i],
      pop: h.precipitation_probability?.[i] ?? 0,
      mm: h.precipitation?.[i] ?? 0,
      code: h.weather_code[i],
      wind: h.wind_speed_10m[i],
      gust: h.wind_gusts_10m?.[i] ?? h.wind_speed_10m[i],
      dir: h.wind_direction_10m[i],
      isDay: h.is_day?.[i] === 1
    };
  });
}

function renderHours(hours) {
  el['hours-chart'].innerHTML = hoursChart(hours);
  attachTooltip(el['hours-chart'], hours, (h) =>
    `<b>${h.label}</b> · ${describe(h.code)}<br>${Math.round(h.temp)}°<br>
     padavine ${h.pop}%${rain(h.mm) ? ` · ${rain(h.mm)}` : ''}<br>
     vetar ${Math.round(h.wind)} km/h ${windRose(h.dir).short}`);
}

/* ====================================================================== dani */

function renderDays(d) {
  const day = d.forecast.daily;
  const count = Math.min(TREND_FROM_DAY, day.time.length);
  const lo = Math.min(...day.temperature_2m_min.slice(0, count));
  const hi = Math.max(...day.temperature_2m_max.slice(0, count));

  el.days.innerHTML = day.time.slice(0, count).map((date, i) => {
    const conf = confidence(i, d.spread?.[i] ?? null);
    const pop = day.precipitation_probability_max?.[i] ?? 0;
    const mm = rain(day.precipitation_sum?.[i]);
    const uvValue = Math.round(day.uv_index_max?.[i] ?? 0);
    const uv = uvLevel(uvValue);

    return `
    <div class="day" role="row">
      <div class="day__when">
        <b>${dayName(date, i)}</b><span>${shortDate(date)}</span>
      </div>
      <div class="day__icon">${icon(day.weather_code[i], true)}</div>
      <div class="day__rain ${pop >= 40 ? 'is-wet' : ''}">
        ${pop >= 10 ? `${pop}%` : '—'}${mm ? `<span>${mm}</span>` : ''}
      </div>
      <div class="day__wind">
        ${round(day.wind_speed_10m_max[i])}<small>km/h</small>
        <span>udari ${round(day.wind_gusts_10m_max[i])}</span>
      </div>
      <div class="day__uv"><span class="uv uv--${uv.key}">UV ${uvValue}</span></div>
      <div class="day__range">
        ${rangeBar(day.temperature_2m_min[i], day.temperature_2m_max[i], lo, hi)}
      </div>
      <div class="day__temps"><b>${temp(day.temperature_2m_max[i])}</b><span>${temp(day.temperature_2m_min[i])}</span></div>
      <div class="day__conf">${confidenceMeter(conf.level, conf.label)}</div>
    </div>`;
  }).join('');

  el['days-range'].textContent = `${shortDate(day.time[0])} – ${shortDate(day.time[count - 1])}`;
  el['days-legend'].innerHTML = `
    Pouzdanost: ${confidenceMeter(3, 'visoka')} visoka ·
    ${confidenceMeter(2, 'dobra')} dobra ·
    ${confidenceMeter(1, 'niska')} niska.
    ${d.spread ? 'Uračunato je i razilaženje modela ECMWF, GFS i ICON.'
               : 'Poređenje modela trenutno nije dostupno, pa je merilo samo udaljenost dana.'}`;
}

function renderTrend(d) {
  const day = d.forecast.daily;
  const section = el['trend-section'];

  if (day.time.length <= TREND_FROM_DAY) { section.hidden = true; return; }
  section.hidden = false;

  const rest = day.time.slice(TREND_FROM_DAY);
  const lo = Math.min(...day.temperature_2m_min.slice(TREND_FROM_DAY));
  const hi = Math.max(...day.temperature_2m_max.slice(TREND_FROM_DAY));

  el.trend.innerHTML = rest.map((date, k) => {
    const i = TREND_FROM_DAY + k;
    const spread = d.spread?.[i];
    return `
    <div class="trend__row">
      <span class="trend__day">${dayName(date, i)}<small>${shortDate(date)}</small></span>
      ${rangeBar(day.temperature_2m_min[i], day.temperature_2m_max[i], lo, hi)}
      <span class="trend__temps">${temp(day.temperature_2m_min[i])} – ${temp(day.temperature_2m_max[i])}</span>
      <span class="trend__spread">${typeof spread !== 'number' ? 'poređenje modela nedostupno'
        : spread < 0.5 ? 'modeli se slažu'
        : `modeli se razilaze ${spread.toFixed(1)}°`}</span>
    </div>`;
  }).join('');
}

/* ====================================================================== sunce i mesec */

function renderAstro(place, d) {
  const tz = d.forecast.utc_offset_seconds / 3600;
  const lat = d.forecast.latitude ?? place.latitude;
  const lon = d.forecast.longitude ?? place.longitude;
  const days = d.forecast.daily.time.slice(0, 7);

  const today = isoDate(days[0]);
  const sun = sunTimes(today, lat, lon, tz);
  const moon = moonPhase(today);
  const moonT = moonTimes(today, lat, lon, tz);
  const uv = clearSkyUv(sun.maxAlt);

  const rows = days.map((date, i) => {
    const s = sunTimes(isoDate(date), lat, lon, tz);
    const m = moonPhase(isoDate(date));
    return `<tr>
      <td>${dayName(date, i)}</td>
      <td>${hhmm(s.rise)}</td>
      <td>${hhmm(s.set)}</td>
      <td>${duration(s.dayLength)}</td>
      <td>${m.name}, ${Math.round(m.illumination * 100)}%</td>
    </tr>`;
  }).join('');

  el.astro.innerHTML = `
    <article class="card astro__card">
      <p class="tile__label">Sunce danas</p>
      <p class="astro__pair"><b>${hhmm(sun.rise)}</b><span>izlazak</span></p>
      <p class="astro__pair"><b>${hhmm(sun.set)}</b><span>zalazak</span></p>
      <p class="tile__extra">dan traje ${duration(sun.dayLength)} · zlatni sat ${hhmm(sun.goldenHour[0])}–${hhmm(sun.goldenHour[1])}</p>
      <p class="tile__extra">podnevna visina ${sun.maxAlt.toFixed(0)}° · UV po vedrom ≈ ${uv}</p>
    </article>
    <article class="card astro__card">
      <p class="tile__label">Mesec danas</p>
      <p class="astro__pair"><b>${Math.round(moon.illumination * 100)}%</b><span>${moon.name}</span></p>
      <p class="astro__pair"><b>${hhmm(moonT.rise)}</b><span>izlazak</span></p>
      <p class="tile__extra">zalazak ${hhmm(moonT.set)}</p>
    </article>
    <div class="card astro__table">
      <table>
        <thead><tr><th>Dan</th><th>Izlazak</th><th>Zalazak</th><th>Dužina</th><th>Mesec</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

/* ====================================================================== tooltip */

function attachTooltip(container, items, render) {
  const tip = el.tooltip;

  container.addEventListener('pointermove', (e) => {
    const col = e.target.closest('.c-col');
    if (!col) return tip.hidden = true;

    const item = items[Number(col.dataset.index)];
    if (!item) return;

    tip.innerHTML = render(item);
    tip.hidden = false;
    const box = tip.getBoundingClientRect();
    tip.style.left = `${Math.min(window.innerWidth - box.width - 12, Math.max(12, e.clientX - box.width / 2))}px`;
    tip.style.top = `${Math.max(12, e.clientY - box.height - 16)}px`;
  });

  container.addEventListener('pointerleave', () => { tip.hidden = true; });
}

/* ====================================================================== sat */

function startClock(timezone) {
  clearInterval(state.clock);
  const tick = () => {
    try {
      el['local-time'].textContent = new Intl.DateTimeFormat(LOCALE, {
        timeZone: timezone, weekday: 'long', hour: '2-digit', minute: '2-digit'
      }).format(new Date());
    } catch { el['local-time'].textContent = ''; }
  };
  tick();
  state.clock = setInterval(tick, 30000);
}

/* ====================================================================== učitavanje */

function renderAll(place, data) {
  const hours = buildHours(data);
  renderNow(place, data);
  renderSummary(hours);
  renderNowcast(data);
  renderWind(data, hours);
  renderSea(data);
  renderHours(hours);
  renderDays(data);
  renderTrend(data);
  renderAstro(place, data);
  startClock(data.forecast.timezone);
}

async function load(place, { quiet = false } = {}) {
  if (!place) return;
  if (!quiet) { setStatus(''); document.body.classList.add('is-loading'); }
  el['refresh-btn'].classList.add('is-busy');

  try {
    const data = await loadWeather(place);
    state.place = place;
    state.data = data;
    state.fetchedAt = Date.now();

    renderAll(place, data);
    saveSnapshot();
    updateLiveState();

    document.title = `${temp(data.forecast.current.temperature_2m)} ${place.name} — Vremenska prognoza`;
    localStorage.setItem(STORAGE.place, JSON.stringify({ ...place, label: place.label || placeLabel(place) }));
    markQuick(place);

    setStatus(
      data.forecast.degraded ? 'Server je odbio prošireni zahtev, pa su padavine po 15 minuta izostavljene. Ostatak prognoze je potpun.'
      : data.models ? ''
      : 'Poređenje modela trenutno nije dostupno — pouzdanost se procenjuje samo po udaljenosti dana.',
      'warn');
  } catch {
    // Ako već imamo prikazane podatke, ostavljamo ih i samo označavamo starost.
    if (state.data) updateLiveState();
    else setStatus('Podaci trenutno nisu dostupni. Proveri konekciju pa pokušaj ponovo.', 'warn');
  } finally {
    document.body.classList.remove('is-loading');
    el['refresh-btn'].classList.remove('is-busy');
  }
}

function choose(place) {
  closeSuggestions();
  el['search-input'].value = '';
  el['search-input'].blur();
  load({ ...place, label: place.label || placeLabel(place) });
}

/* ====================================================================== brzi izbor */

function markQuick(place) {
  document.querySelectorAll('.quick button').forEach((btn) => {
    const same = Math.abs(Number(btn.dataset.lat) - place.latitude) < 0.05 &&
                 Math.abs(Number(btn.dataset.lon) - place.longitude) < 0.05;
    btn.setAttribute('aria-current', String(same));
  });
}

function renderQuick() {
  const nav = document.createElement('nav');
  nav.className = 'quick';
  nav.setAttribute('aria-label', 'Brzi izbor mesta');
  nav.innerHTML = QUICK.map((p, i) =>
    `<button type="button" data-index="${i}" data-lat="${p.latitude}" data-lon="${p.longitude}">${p.name}</button>`).join('');

  nav.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (btn) choose(QUICK[Number(btn.dataset.index)]);
  });
  $('.hero').after(nav);
}

/* ====================================================================== start */

/* ============================================================ povuci za osvežavanje */

/**
 * Povlačenje nadole sa vrha strane osvežava podatke, kao u telefonskim aplikacijama.
 * Radi samo kada je stranica na vrhu i kada se povlači prstom, da ne bi smetalo
 * običnom skrolovanju ni vodoravnim grafikama.
 */
function initPullToRefresh() {
  const indicator = el.ptr;
  const THRESHOLD = 72;
  let startY = null, distance = 0, active = false;

  const show = (state, offset = 0, spin = 0) => {
    indicator.dataset.state = state;
    if (state === 'pulling' || state === 'ready') {
      indicator.style.opacity = String(Math.min(1, offset / THRESHOLD));
      indicator.style.transform = `translateY(${Math.min(offset * 0.6, 52) - 46}px) scale(${0.8 + Math.min(offset / THRESHOLD, 1) * 0.2})`;
      indicator.style.setProperty('--spin', `${spin}deg`);
    } else {
      indicator.style.opacity = '';
      indicator.style.transform = '';
    }
  };

  document.addEventListener('touchstart', (e) => {
    if (window.scrollY > 0 || e.touches.length !== 1) { startY = null; return; }
    startY = e.touches[0].clientY;
    distance = 0;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (startY === null || active) return;

    distance = e.touches[0].clientY - startY;
    if (distance <= 0 || window.scrollY > 0) { show('idle'); return; }

    // Vodoravne grafike zadržavaju svoje ponašanje.
    if (e.target.closest('.chart__scroll')) return;

    if (distance > 8) e.preventDefault();
    show(distance >= THRESHOLD ? 'ready' : 'pulling', distance, distance * 2.6);
  }, { passive: false });

  document.addEventListener('touchend', async () => {
    if (startY === null || active) return;
    const pulled = distance;
    startY = null;

    if (pulled < THRESHOLD) { show('done'); return; }

    active = true;
    show('refreshing');
    await load(state.place || QUICK[0], { quiet: true });
    show('done');
    setTimeout(() => { active = false; }, 300);
  }, { passive: true });
}

/* ====================================================================== instalacija */

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

function installHint() {
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const dismissed = localStorage.getItem(STORAGE.installTip) === 'da';

  if (!iOS || isStandalone() || dismissed) return;

  setTimeout(() => { el.install.hidden = false; }, 4000);
  el['install-close'].addEventListener('click', () => {
    el.install.hidden = true;
    localStorage.setItem(STORAGE.installTip, 'da');
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* radi i bez njega */ });
  });
}

/* ====================================================================== start */

function init() {
  renderQuick();
  initSearch();
  registerServiceWorker();
  installHint();
  initPullToRefresh();

  state.facing = Number(localStorage.getItem(STORAGE.facing) ?? 90);
  el.facing.value = String(state.facing);
  el.facing.addEventListener('change', () => {
    state.facing = Number(el.facing.value);
    localStorage.setItem(STORAGE.facing, String(state.facing));
    if (state.data) { renderSea(state.data); renderWind(state.data, buildHours(state.data)); }
  });

  el['refresh-btn'].addEventListener('click', () => load(state.place || QUICK[0]));

  // Poslednje viđeno stanje se iscrtava odmah — aplikacija nikad ne počinje prazna.
  const hadSnapshot = hydrateFromSnapshot();

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE.place) || 'null'); } catch { /* ignoriši */ }
  load(saved?.latitude ? saved : (state.place || QUICK[0]), { quiet: hadSnapshot });

  startRealtime();

  // Povratak na aplikaciju: sveži podaci ako su stariji od dva minuta.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const age = Date.now() - state.fetchedAt;
    if (age > REFRESH.old) load(state.place, { quiet: true });
    else if (age > 2 * 60 * 1000) lightRefresh();
    updateLiveState();
  });

  window.addEventListener('online', () => { updateLiveState(); load(state.place, { quiet: true }); });
  window.addEventListener('offline', updateLiveState);
  window.addEventListener('pageshow', updateLiveState);
}

init();
