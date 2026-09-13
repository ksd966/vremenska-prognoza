/**
 * WMO weather interpretation codes (WW) → opis na srpskom + ikonica.
 * https://open-meteo.com/en/docs
 */
const CODES = {
  0:  ['Vedro',                    'sun'],
  1:  ['Pretežno vedro',           'sun'],
  2:  ['Delimično oblačno',        'cloud-sun'],
  3:  ['Oblačno',                  'cloud'],
  45: ['Magla',                    'fog'],
  48: ['Ledena magla',             'fog'],
  51: ['Slaba rosulja',            'drizzle'],
  53: ['Rosulja',                  'drizzle'],
  55: ['Jaka rosulja',             'drizzle'],
  56: ['Ledena rosulja',           'sleet'],
  57: ['Jaka ledena rosulja',      'sleet'],
  61: ['Slaba kiša',               'rain'],
  63: ['Kiša',                     'rain'],
  65: ['Jaka kiša',                'rain'],
  66: ['Ledena kiša',              'sleet'],
  67: ['Jaka ledena kiša',         'sleet'],
  71: ['Slab sneg',                'snow'],
  73: ['Sneg',                     'snow'],
  75: ['Jak sneg',                 'snow'],
  77: ['Snežna zrna',              'snow'],
  80: ['Slabi pljuskovi',          'rain'],
  81: ['Pljuskovi',                'rain'],
  82: ['Jaki pljuskovi',           'rain'],
  85: ['Slabi snežni pljuskovi',   'snow'],
  86: ['Snežni pljuskovi',         'snow'],
  95: ['Grmljavina',               'storm'],
  96: ['Grmljavina sa gradom',     'storm'],
  99: ['Jaka grmljavina sa gradom','storm']
};

/** Opis uslova za dati WMO kod. */
export function describe(code) {
  return (CODES[code] || ['Nepoznato', 'cloud'])[0];
}

/** ID SVG simbola; noćne varijante za vedro i delimično oblačno. */
export function iconId(code, isDay = true) {
  const key = (CODES[code] || ['', 'cloud'])[1];
  if (!isDay) {
    if (key === 'sun') return 'i-moon';
    if (key === 'cloud-sun') return 'i-cloud-moon';
  }
  return 'i-' + key;
}

/** Markup ikonice spreman za umetanje. */
export function icon(code, isDay = true) {
  return `<svg viewBox="0 0 48 48" aria-hidden="true"><use href="#${iconId(code, isDay)}"/></svg>`;
}

/** Tema neba (body[data-sky]) na osnovu uslova i doba dana. */
export function skyTheme(code, isDay = true) {
  if (code >= 95) return 'storm';
  if (code >= 71 && code <= 77 || code === 85 || code === 86) return 'snow';
  if (code >= 51) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code === 2 || code === 3) return isDay ? 'cloud-day' : 'cloud-night';
  return isDay ? 'day' : 'night';
}
