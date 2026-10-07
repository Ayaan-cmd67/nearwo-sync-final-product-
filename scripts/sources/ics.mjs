import { makeEvent, localParts } from '../lib/normalize.mjs';

// iCal (.ics) feeds: many venue and community websites publish one.
// WordPress sites using "The Events Calendar" usually expose <site>/events/?ical=1
export async function fetchIcsFeed(feed, config, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(feed.url, { headers: { 'User-Agent': 'Nearwo event aggregator' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('Response is not an iCal feed');
  return { events: parseIcs(text).map(v => toEvent(v, feed, config.region.timeZone)).filter(Boolean) };
}

export function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const m = line.match(/^([A-Za-z-]+)((?:;[^:]*)?):(.*)$/);
    if (!m) continue;
    const [, name, rawParams, value] = m;
    const params = Object.fromEntries(rawParams.split(';').filter(Boolean)
      .map(p => p.split('=')).map(([k, v]) => [k.toUpperCase(), (v || '').replace(/^"|"$/g, '')]));
    cur[name.toUpperCase()] = { value, params };
  }
  return events;
}

export function parseIcsDate(prop, timeZone = 'Europe/Berlin') {
  if (!prop) return null;
  const v = prop.value.trim();
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined || prop.params.VALUE === 'DATE') {
    return { date: `${y}-${mo}-${d}`, time: null, allDay: true };
  }
  if (z) { // UTC: convert to Frankfurt local time
    const lp = localParts(new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s || 0))), timeZone);
    return { date: lp.date, time: lp.time, allDay: false };
  }
  // TZID=Europe/Berlin or floating time: already local
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}`, allDay: false };
}

function unescapeText(s = '') {
  return s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

function toEvent(v, feed, timeZone) {
  const start = parseIcsDate(v.DTSTART, timeZone);
  if (!start || !v.SUMMARY) return null;
  if (v.STATUS?.value === 'CANCELLED') return null;
  let end = parseIcsDate(v.DTEND, timeZone);
  // iCal all-day DTEND is exclusive: an event on the 10th ends "on the 11th".
  if (end?.allDay && start.allDay) {
    const d = new Date(end.date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1);
    end = { ...end, date: d.toISOString().slice(0, 10) };
  }
  const [lat, lon] = (v.GEO?.value || '').split(';').map(parseFloat);
  const location = unescapeText(v.LOCATION?.value);

  return makeEvent({
    source: 'ics',
    sourceId: `${feed.name}:${v.UID?.value || v.SUMMARY.value + start.date}`,
    title: unescapeText(v.SUMMARY.value),
    description: unescapeText(v.DESCRIPTION?.value),
    startDate: start.date,
    startTime: start.time,
    endDate: end?.date,
    endTime: end?.time,
    allDay: start.allDay,
    venue: feed.venue || location.split(',')[0] || null,
    address: feed.address || location || null,
    city: 'Frankfurt am Main',
    lat, lon,
    category: feed.defaultCategory || 'other',
    url: v.URL?.value || null,
    tags: feed.tags || []
  });
}
