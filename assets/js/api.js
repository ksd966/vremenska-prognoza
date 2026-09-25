/**
 * Open-Meteo pozivi. Bez ključa, bez zavisnosti.
 *
 * Princip: osnovna prognoza mora da uspe; poređenje modela i podaci o moru su dodaci
 * koji smeju da izostanu (ne obalna lokacija, model bez pokrivenosti) — tada se
 * odgovarajući deo aplikacije jednostavno ne prikazuje.
 */

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const MARINE   = 'https://marine-api.open-meteo.com/v1/marine';
const GEO      = 'https://geocoding-api.open-meteo.com/v1/search';

/** Modeli koji se porede da bi se procenila pouzdanost. */
const MODELS = ['ecmwf_ifs025', 'gfs_seamless', 'icon_seamless'];

export const FORECAST_DAYS = 14;

async function getJSON(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.reason || 'API greška');
  return data;
}

export async function searchPlaces(query, signal) {
  const data = await getJSON(`${GEO}?name=${encodeURIComponent(query)}&count=6&format=json`, { signal });
  return data.results || [];
}

/**
 * Osnovni parametri za svaki poziv.
 *
 * Kada se zna prava nadmorska visina tačke, šalje se uz koordinate: model inače
 * računa za prosečnu visinu svoje mreže, pa bi na vrhu planine vratio temperaturu
 * nekoliko stotina metara niže nego što jeste.
 */
function baseParams(place) {
  const params = {
    latitude: place.latitude,
    longitude: place.longitude,
    timezone: 'auto'
  };
  if (typeof place.elevation === 'number' && Number.isFinite(place.elevation)) {
    params.elevation = place.elevation;
  }
  return params;
}

/**
 * Puni zahtev traži i stvari koje nisu na svakom modelu (padavine po 15 minuta).
 * Ako server odbije takav zahtev, šalje se svedena verzija sa osnovnim poljima —
 * bolje je izgubiti nowcast nego celu prognozu.
 */
async function forecastRequest(place) {
  try {
    return await fullForecast(place);
  } catch (err) {
    const fallback = await coreForecast(place);
    fallback.degraded = String(err.message || err);
    return fallback;
  }
}

function coreForecast(place) {
  const params = new URLSearchParams({
    ...baseParams(place),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,uv_index_max',
    forecast_days: String(FORECAST_DAYS)
  });
  return getJSON(`${FORECAST}?${params}`);
}

function fullForecast(place) {
  const params = new URLSearchParams({
    ...baseParams(place),
    current: [
      'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'is_day',
      'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m',
      'wind_gusts_10m', 'pressure_msl'
    ].join(','),
    hourly: [
      'temperature_2m', 'precipitation_probability', 'precipitation', 'weather_code',
      'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'is_day',
      'freezing_level_height', 'sunshine_duration', 'cloud_cover'
    ].join(','),
    daily: [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min', 'apparent_temperature_max',
      'precipitation_sum', 'precipitation_probability_max', 'precipitation_hours',
      'wind_speed_10m_max', 'wind_gusts_10m_max', 'wind_direction_10m_dominant', 'uv_index_max',
      'sunshine_duration'
    ].join(','),
    minutely_15: 'precipitation,temperature_2m,wind_speed_10m,wind_gusts_10m',
    forecast_minutely_15: '8',
    forecast_days: String(FORECAST_DAYS),
    forecast_hours: '72'
  });
  return getJSON(`${FORECAST}?${params}`);
}

/**
 * Lako osvežavanje za rad u realnom vremenu: samo trenutno stanje i naredna dva sata
 * u koracima od 15 minuta. Šalje se često, pa mora da bude mali.
 */
export async function refreshCurrent(place) {
  try {
    return await currentWithNowcast(place);
  } catch {
    // Bez padavina po 15 minuta — trenutno stanje je važnije.
    const params = new URLSearchParams({
      ...baseParams(place),
      current: 'temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl',
      forecast_days: '1'
    });
    return getJSON(`${FORECAST}?${params}`);
  }
}

function currentWithNowcast(place) {
  const params = new URLSearchParams({
    ...baseParams(place),
    current: [
      'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'is_day',
      'precipitation', 'weather_code', 'wind_speed_10m', 'wind_direction_10m',
      'wind_gusts_10m', 'pressure_msl'
    ].join(','),
    minutely_15: 'precipitation,temperature_2m,wind_speed_10m,wind_gusts_10m',
    forecast_minutely_15: '8',
    forecast_days: '1'
  });
  return getJSON(`${FORECAST}?${params}`);
}

/** Isti dnevni maksimumi iz tri modela — razlika među njima je mera nesigurnosti. */
function modelsRequest(place) {
  const params = new URLSearchParams({
    ...baseParams(place),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    models: MODELS.join(','),
    forecast_days: String(FORECAST_DAYS)
  });
  return getJSON(`${FORECAST}?${params}`);
}

/**
 * Morski model pokriva kraći period od kopnenog, pa se `forecast_days` ne šalje —
 * uzima se podrazumevanih sedam dana. Uz `current` se traži i `hourly`, da bi
 * postojala rezerva ako model za ovu tačku nema trenutnu vrednost.
 */
async function marineRequest(place) {
  const params = new URLSearchParams({
    ...baseParams(place),
    current: 'sea_surface_temperature,wave_height,wave_direction',
    hourly: 'sea_surface_temperature,wave_height',
    daily: 'wave_height_max,wave_direction_dominant'
  });
  const data = await getJSON(`${MARINE}?${params}`);
  return withCurrentSea(data);
}

/** Ako `current` nema vrednost, uzmi najbliži sat iz `hourly`. */
function withCurrentSea(marine) {
  const current = marine.current ?? {};
  const hourly = marine.hourly;
  if (typeof current.sea_surface_temperature === 'number' || !hourly?.time?.length) return marine;

  const now = Date.now();
  let best = -1, bestGap = Infinity;
  hourly.time.forEach((time, i) => {
    const gap = Math.abs(new Date(time).getTime() - now);
    if (gap < bestGap && typeof hourly.sea_surface_temperature?.[i] === 'number') { best = i; bestGap = gap; }
  });
  if (best === -1) return marine;

  marine.current = {
    ...current,
    sea_surface_temperature: hourly.sea_surface_temperature[best],
    wave_height: current.wave_height ?? hourly.wave_height?.[best]
  };
  return marine;
}

/**
 * Razilaženje modela po danu (°C). null tamo gde bar dva modela nemaju vrednost —
 * ICON, na primer, ne ide dalje od ~7 dana.
 */
export function modelSpread(models) {
  const daily = models?.daily;
  if (!daily?.time?.length) return null;

  // Ne pretpostavlja se tačan oblik sufiksa: uzimaju se svi nizovi maksimalne
  // temperature, kako god ih server imenovao po modelu.
  const series = Object.keys(daily)
    .filter((key) => key.startsWith('temperature_2m_max') && Array.isArray(daily[key]))
    .map((key) => daily[key]);

  if (series.length < 2) return null;

  return daily.time.map((_, i) => {
    const values = series.map((arr) => arr[i]).filter((v) => typeof v === 'number');
    return values.length >= 2 ? Math.max(...values) - Math.min(...values) : null;
  });
}

/**
 * Sve za jedno mesto. Dodaci koji padnu vraćaju se kao null, uz beleženje razloga —
 * aplikacija tada sakrije te sekcije umesto da prikaže prazne vrednosti.
 */
export async function loadWeather(place) {
  const [forecast, models, marine] = await Promise.all([
    forecastRequest(place),
    modelsRequest(place).catch(() => null),
    marineRequest(place).catch(() => null)
  ]);

  return { forecast, models, marine, spread: modelSpread(models) };
}
