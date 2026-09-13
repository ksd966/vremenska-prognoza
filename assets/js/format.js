/**
 * Jedinice, skale i pouzdanost — sve što se prikazuje korisniku prolazi kroz ovaj modul,
 * da bi zaokruživanje i terminologija bili svuda isti.
 */

export const LOCALE = 'sr-Latn-RS';

export const round = (n) => (n === null || n === undefined || Number.isNaN(n) ? null : Math.round(n));
export const temp = (n) => (round(n) === null ? '–' : `${round(n)}°`);

/* ---------------------------------------------------------------- vetar */

const BEAUFORT = [
  [1, 0, 'tišina'], [6, 1, 'lahor'], [12, 2, 'povetarac'], [20, 3, 'slab vetar'],
  [29, 4, 'umeren vetar'], [39, 5, 'umereno jak'], [50, 6, 'jak vetar'], [62, 7, 'žestok vetar'],
  [75, 8, 'olujni vetar'], [89, 9, 'jaka oluja'], [103, 10, 'potpuna oluja'],
  [118, 11, 'orkanska oluja'], [Infinity, 12, 'orkan']
];

/** Bofor stepen i opis iz brzine u km/h. */
export function beaufort(kmh) {
  const [, level, label] = BEAUFORT.find(([limit]) => kmh < limit);
  return { level, label };
}

const ROSE = ['sever', 'severoistok', 'istok', 'jugoistok', 'jug', 'jugozapad', 'zapad', 'severozapad'];
const ROSE_SHORT = ['S', 'SI', 'I', 'JI', 'J', 'JZ', 'Z', 'SZ'];
const ROSE_FROM = ['severa', 'severoistoka', 'istoka', 'jugoistoka', 'juga', 'jugozapada', 'zapada', 'severozapada'];

export function windRose(degrees) {
  const i = Math.round((((degrees % 360) + 360) % 360) / 45) % 8;
  return { short: ROSE_SHORT[i], long: ROSE[i], from: ROSE_FROM[i] };
}

/** Da li vetar duva sa mora ili sa kopna, za plažu okrenutu ka `facing` stepeni. */
export function shoreWind(windFromDeg, facingDeg) {
  // Meteorološki pravac je odakle vetar duva: ako dolazi iz smera u koji plaža gleda, duva sa mora.
  const diff = Math.abs(((windFromDeg - facingDeg + 540) % 360) - 180);
  if (diff <= 60) return { type: 'onshore', label: 'sa mora', note: 'talasi i mutnija voda' };
  if (diff >= 120) return { type: 'offshore', label: 'sa kopna', note: 'mirno, staklasto more' };
  return { type: 'cross', label: 'bočni', note: 'blag talas uz obalu' };
}

/* ------------------------------------------------------------ pouzdanost */

/**
 * Pouzdanost prognoze za dan `lead` (0 = danas), uz opciono razilaženje modela (°C).
 * Ovo je jedini izvor istine za to koliko detalja aplikacija sme da prikaže.
 */
export function confidence(lead, spread = null) {
  let score = lead <= 2 ? 3 : lead <= 5 ? 2 : lead <= 9 ? 1 : 0;

  if (spread !== null) {
    if (spread > 6) score -= 2;
    else if (spread > 4) score -= 1;
    else if (spread < 1.5 && lead > 2) score += 1;
  }
  score = Math.max(0, Math.min(3, score));

  return [
    { level: 0, key: 'trend',  label: 'samo trend',      detail: 'raspon, bez dnevnog rasporeda' },
    { level: 1, key: 'low',    label: 'niska pouzdanost', detail: 'očekuj izmene iz dana u dan' },
    { level: 2, key: 'medium', label: 'dobra pouzdanost', detail: 'raspored se još može pomeriti' },
    { level: 3, key: 'high',   label: 'visoka pouzdanost', detail: 'malo prostora za promenu' }
  ][score];
}

/** Prag preko kojeg se dan prikazuje kao trend, a ne kao prognoza. */
export const TREND_FROM_DAY = 10;

/* ----------------------------------------------------------------- UV */

export function uvLevel(uv) {
  if (uv < 3) return { label: 'nizak', key: 'good' };
  if (uv < 6) return { label: 'umeren', key: 'warning' };
  if (uv < 8) return { label: 'visok', key: 'serious' };
  if (uv < 11) return { label: 'vrlo visok', key: 'critical' };
  return { label: 'ekstreman', key: 'critical' };
}

/* -------------------------------------------------------------- vreme */

export const hhmm = (value) => {
  if (typeof value === 'string') return value.slice(11, 16);
  if (value === null || value === undefined) return '–';
  const m = Math.round(value * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export function duration(hours) {
  if (hours === null) return '–';
  const m = Math.round(hours * 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export function dayName(iso, index) {
  if (index === 0) return 'Danas';
  if (index === 1) return 'Sutra';
  const d = new Date(iso + 'T12:00:00');
  const name = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' }).format(d);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export const shortDate = (iso) =>
  new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }).format(new Date(iso + 'T12:00:00'));

/** Padavine: ispod 0.2 mm nema šta da se prikaže, iznad 10 mm decimala je lažna preciznost. */
export function rain(mm) {
  if (mm === null || mm === undefined || mm < 0.2) return null;
  return mm >= 10 ? `${Math.round(mm)} mm` : `${mm.toFixed(1)} mm`;
}
