// The one event shape every source must produce. The web app only knows this shape,
// so adding a new source never touches the UI.
//
// {
//   id, source, sourceId, title, description,
//   startDate: 'YYYY-MM-DD' (Frankfurt local), startTime: 'HH:MM' | null,
//   endDate, endTime, allDay,
//   venue, address, city, lat, lon,
//   category, url, image, price, tags: []
// }

export const CATEGORIES = [
  'community', 'music', 'nightlife', 'arts', 'film',
  'food', 'family', 'sports', 'other'
];

// Higher number wins when the same event arrives from several sources.
export const SOURCE_PRIORITY = { curated: 3, ics: 2, ticketmaster: 1 };

export function makeEvent(fields) {
  const e = {
    id: '',
    source: fields.source,
    sourceId: String(fields.sourceId ?? ''),
    title: clean(fields.title),
    description: clean(fields.description, 1200),
    startDate: fields.startDate,
    startTime: fields.startTime || null,
    endDate: fields.endDate || null,
    endTime: fields.endTime || null,
    allDay: Boolean(fields.allDay),
    venue: clean(fields.venue) || null,
    address: clean(fields.address) || null,
    city: clean(fields.city) || null,
    lat: num(fields.lat),
    lon: num(fields.lon),
    category: CATEGORIES.includes(fields.category) ? fields.category : 'other',
    url: fields.url || null,
    image: fields.image || null,
    price: clean(fields.price) || null,
    tags: Array.isArray(fields.tags) ? fields.tags.map(String) : []
  };
  e.id = `${e.source}:${e.sourceId || slug(e.title) + '-' + e.startDate}`;
  return e;
}

export function isValid(e) {
  return Boolean(e.title && /^\d{4}-\d{2}-\d{2}$/.test(e.startDate || ''));
}

export function dedupeKey(e) {
  return `${slug(e.title)}|${e.startDate}`;
}

// Keep the highest-priority version, but fill its gaps (image, coordinates...) from the others.
export function dedupe(events) {
  const byKey = new Map();
  for (const e of events) {
    const k = dedupeKey(e);
    const prev = byKey.get(k);
    if (!prev) { byKey.set(k, e); continue; }
    const [win, lose] = (SOURCE_PRIORITY[e.source] ?? 0) > (SOURCE_PRIORITY[prev.source] ?? 0)
      ? [e, prev] : [prev, e];
    for (const [field, value] of Object.entries(lose)) {
      if ((win[field] === null || win[field] === '' ) && value != null) win[field] = value;
    }
    win.tags = [...new Set([...win.tags, ...lose.tags])];
    byKey.set(k, win);
  }
  return [...byKey.values()];
}

export function inWindow(e, todayISO, windowDays) {
  const end = addDays(todayISO, windowDays);
  const last = e.endDate && e.endDate > e.startDate ? e.endDate : e.startDate;
  return last >= todayISO && e.startDate <= end;
}

export function sortEvents(events) {
  return events.sort((a, b) =>
    (a.startDate + (a.startTime || '00:00')).localeCompare(b.startDate + (b.startTime || '00:00')) ||
    a.title.localeCompare(b.title));
}

// Frankfurt-local date/time parts for a JS Date.
export function localParts(date, timeZone = 'Europe/Berlin') {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export function addDays(iso, days) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function slug(s = '') {
  return s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

function clean(s, max = 300) {
  if (s == null) return '';
  const t = String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}
