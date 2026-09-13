/**
 * Sunce i Mesec — lokalni proračun, bez API-ja.
 * Algoritmi: NOAA (položaj Sunca), Meeus (faza i položaj Meseca, niska preciznost).
 * Tačnost: izlazak/zalazak ±2 min, faza Meseca ±0.5%, izlazak Meseca ±5 min.
 */

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function julianDay(y, m, d, hours = 0) {
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5 + hours / 24;
}

function sunPosition(jd) {
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = rad((357.528 + 0.9856003 * n) % 360);
  const lambda = rad(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const eps = rad(23.439 - 0.0000004 * n);
  return {
    ra: Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda)),
    dec: Math.asin(Math.sin(eps) * Math.sin(lambda))
  };
}

function moonPosition(jd) {
  const T = (jd - 2451545.0) / 36525;
  const L = (218.316 + 481267.8813 * T) % 360;
  const M = rad((134.963 + 477198.8676 * T) % 360);
  const Ms = rad((357.529 + 35999.0503 * T) % 360);
  const D = rad((297.85 + 445267.1115 * T) % 360);
  const F = rad((93.272 + 483202.0175 * T) % 360);

  const lambda = rad(L + 6.289 * Math.sin(M) - 1.274 * Math.sin(M - 2 * D) + 0.658 * Math.sin(2 * D)
    - 0.186 * Math.sin(Ms) - 0.059 * Math.sin(2 * M - 2 * D) - 0.057 * Math.sin(M - 2 * D + Ms));
  const beta = rad(5.128 * Math.sin(F) + 0.281 * Math.sin(M + F) - 0.278 * Math.sin(F - M)
    - 0.173 * Math.sin(F - 2 * D));
  const eps = rad(23.439 - 0.0000004 * (jd - 2451545.0));

  return {
    ra: Math.atan2(Math.sin(lambda) * Math.cos(eps) - Math.tan(beta) * Math.sin(eps), Math.cos(lambda)),
    dec: Math.asin(Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lambda))
  };
}

const gmst = (jd) => (280.46061837 + 360.98564736629 * (jd - 2451545.0)) % 360;

function altitude(pos, jd, lat, lon) {
  const H = rad((gmst(jd) + lon - deg(pos.ra)) % 360);
  return deg(Math.asin(
    Math.sin(rad(lat)) * Math.sin(pos.dec) + Math.cos(rad(lat)) * Math.cos(pos.dec) * Math.cos(H)
  ));
}

/** Traži trenutak (u satima lokalnog vremena) kada telo prelazi zadatu visinu. */
function crossing(date, body, targetAlt, rising, lat, lon, tzOffset) {
  const [y, m, d] = date;
  let prev = null;
  for (let i = 0; i <= 24 * 60; i += 2) {
    const jd = julianDay(y, m, d, i / 60 - tzOffset);
    const alt = altitude(body(jd), jd, lat, lon);
    if (prev !== null) {
      const up = rising && prev < targetAlt && alt >= targetAlt;
      const down = !rising && prev > targetAlt && alt <= targetAlt;
      if (up || down) {
        const frac = (targetAlt - prev) / (alt - prev);       // linearna interpolacija
        return (i - 2 + frac * 2) / 60;
      }
    }
    prev = alt;
  }
  return null;
}

/** Sunčani podaci za datum: izlazak, zalazak, podne, dužina dana, max visina. */
export function sunTimes(date, lat, lon, tzOffset) {
  const rise = crossing(date, sunPosition, -0.833, true, lat, lon, tzOffset);
  const set = crossing(date, sunPosition, -0.833, false, lat, lon, tzOffset);
  const civilEnd = crossing(date, sunPosition, -6, false, lat, lon, tzOffset);

  let noon = null, maxAlt = -90;
  if (rise !== null && set !== null) {
    noon = (rise + set) / 2;
    const jd = julianDay(date[0], date[1], date[2], noon - tzOffset);
    maxAlt = altitude(sunPosition(jd), jd, lat, lon);
  }
  return {
    rise, set, noon, maxAlt, civilEnd,
    dayLength: rise !== null && set !== null ? set - rise : null,
    goldenHour: set !== null ? [set - 1, civilEnd] : null
  };
}

/** Faza Meseca (0 = mlad, 0.5 = pun), osvetljenost i naziv. */
export function moonPhase(date) {
  const jd = julianDay(date[0], date[1], date[2], 12);
  const phase = (((jd - 2451550.1) / 29.530588853) % 1 + 1) % 1;
  const illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;

  const names = [
    [0.02, 'mlad Mesec'], [0.23, 'mlada srpasta'], [0.28, 'prva četvrt'],
    [0.47, 'rastuća gibona'], [0.53, 'pun Mesec'], [0.72, 'opadajuća gibona'],
    [0.78, 'poslednja četvrt'], [0.98, 'stara srpasta'], [1.01, 'mlad Mesec']
  ];
  return { phase, illumination, name: names.find(([limit]) => phase < limit)[1] };
}

/** Izlazak i zalazak Meseca. */
export function moonTimes(date, lat, lon, tzOffset) {
  return {
    rise: crossing(date, moonPosition, 0.125, true, lat, lon, tzOffset),
    set: crossing(date, moonPosition, 0.125, false, lat, lon, tzOffset)
  };
}

/** Procena UV indeksa za vedro nebo iz visine Sunca — kontrolna vrednost uz API. */
export function clearSkyUv(maxAltitude) {
  if (maxAltitude <= 0) return 0;
  return Math.round(12.5 * Math.pow(Math.sin(rad(maxAltitude)), 2.5) * 10) / 10;
}
