import { makeEvent, localParts, addDays } from '../lib/normalize.mjs';

const BASE = 'https://app.ticketmaster.com/discovery/v2/events.json';
const PAGE_SIZE = 200;          // API maximum
const DEEP_PAGING_LIMIT = 1000; // API refuses page * size beyond this

// Ticketmaster Discovery API (free key: developer.ticketmaster.com).
// The key is read from the TICKETMASTER_API_KEY environment variable and never reaches the browser.
export async function fetchTicketmaster(config, { apiKey = process.env.TICKETMASTER_API_KEY, fetchImpl = fetch } = {}) {
  if (!apiKey) return { skipped: 'TICKETMASTER_API_KEY not set', events: [] };

  const { lat, lon, radiusKm, timeZone } = config.region;
  const today = localParts(new Date(), timeZone).date;
  const params = {
    apikey: apiKey,
    geoPoint: geohash(lat, lon, 7),
    radius: String(radiusKm),
    unit: 'km',
    size: String(PAGE_SIZE),
    sort: 'date,asc',
    locale: '*',
    startDateTime: `${today}T00:00:00Z`,
    endDateTime: `${addDays(today, config.windowDays)}T23:59:59Z`
  };

  const maxPages = config.ticketmaster?.maxPages ?? 5;
  const raw = [];
  for (let page = 0; page < maxPages && (page + 1) * PAGE_SIZE <= DEEP_PAGING_LIMIT; page++) {
    const url = `${BASE}?${new URLSearchParams({ ...params, page: String(page) })}`;
    const res = await fetchImpl(url);
    if (res.status === 429) { await sleep(1500); page--; continue; }
    if (!res.ok) throw new Error(`Ticketmaster HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    raw.push(...(body._embedded?.events ?? []));
    const totalPages = body.page?.totalPages ?? 0;
    if (page + 1 >= totalPages) break;
    await sleep(250); // stay well under 5 requests/second
  }

  return { events: raw.map(toEvent).filter(Boolean) };
}

export function toEvent(tm) {
  const start = tm.dates?.start ?? {};
  if (!start.localDate) return null;
  const venue = tm._embedded?.venues?.[0] ?? {};
  const cls = tm.classifications?.[0] ?? {};
  const price = tm.priceRanges?.[0];

  return makeEvent({
    source: 'ticketmaster',
    sourceId: tm.id,
    title: tm.name,
    description: tm.info || tm.pleaseNote || '',
    startDate: start.localDate,
    startTime: start.timeTBA || start.noSpecificTime ? null : (start.localTime || '').slice(0, 5),
    allDay: Boolean(start.dateTBA || start.noSpecificTime),
    venue: venue.name,
    address: [venue.address?.line1, venue.postalCode, venue.city?.name].filter(Boolean).join(', '),
    city: venue.city?.name,
    lat: venue.location?.latitude,
    lon: venue.location?.longitude,
    category: mapCategory(cls),
    url: tm.url,
    image: pickImage(tm.images),
    price: price ? formatPrice(price) : null,
    tags: []
  });
}

function mapCategory(cls) {
  const segment = cls.segment?.name ?? '';
  const genre = cls.genre?.name ?? '';
  if (/family|children/i.test(genre) || /family/i.test(segment)) return 'family';
  if (segment === 'Music') return /dance|electronic/i.test(genre) ? 'nightlife' : 'music';
  if (segment === 'Sports') return 'sports';
  if (segment === 'Arts & Theatre') return 'arts';
  if (segment === 'Film') return 'film';
  if (/food|drink/i.test(genre)) return 'food';
  return 'other';
}

function pickImage(images = []) {
  const wide = images.filter(i => i.ratio === '16_9' && i.width >= 500).sort((a, b) => a.width - b.width);
  return (wide[0] ?? images[0])?.url ?? null;
}

function formatPrice({ min, max, currency = 'EUR' }) {
  const sym = currency === 'EUR' ? '€' : currency + ' ';
  const f = n => (Number.isInteger(n) ? n : n.toFixed(2));
  if (min == null) return null;
  return max && max !== min ? `${sym}${f(min)}–${f(max)}` : `${sym}${f(min)}`;
}

// Ticketmaster deprecated lat/long in favour of a geohash.
export function geohash(lat, lon, precision = 7) {
  const chars = '0123456789bcdefghjkmnpqrstuvwxyz';
  let [latR, lonR] = [[-90, 90], [-180, 180]];
  let hash = '', bit = 0, ch = 0, even = true;
  while (hash.length < precision) {
    const r = even ? lonR : latR, v = even ? lon : lat, mid = (r[0] + r[1]) / 2;
    if (v >= mid) { ch = (ch << 1) | 1; r[0] = mid; } else { ch <<= 1; r[1] = mid; }
    even = !even;
    if (++bit === 5) { hash += chars[ch]; bit = 0; ch = 0; }
  }
  return hash;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
