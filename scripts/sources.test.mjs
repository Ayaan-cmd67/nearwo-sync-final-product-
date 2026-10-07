import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIcs, parseIcsDate } from './sources/ics.mjs';
import { toEvent, geohash } from './sources/ticketmaster.mjs';
import { dedupe, makeEvent } from './lib/normalize.mjs';

test('ICS: folded lines, escapes, UTC to Frankfurt time', () => {
  const ics = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Pub quiz\\, in Eng\r\n lish\r\nDTSTART:20261010T170000Z\r\nUID:a1\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const [v] = parseIcs(ics);
  assert.equal(v.SUMMARY.value, 'Pub quiz\\, in English');
  assert.deepEqual(parseIcsDate(v.DTSTART), { date: '2026-10-10', time: '19:00', allDay: false }); // CEST = UTC+2
});

test('ICS: TZID and all-day dates', () => {
  assert.deepEqual(parseIcsDate({ value: '20261205T183000', params: { TZID: 'Europe/Berlin' } }),
    { date: '2026-12-05', time: '18:30', allDay: false });
  assert.deepEqual(parseIcsDate({ value: '20261205', params: { VALUE: 'DATE' } }),
    { date: '2026-12-05', time: null, allDay: true });
});

test('Ticketmaster: maps an API event to the Nearwo shape', () => {
  const e = toEvent({
    id: 'Z1', name: 'Some Band', url: 'https://tm/x',
    dates: { start: { localDate: '2026-11-02', localTime: '20:00:00' } },
    classifications: [{ segment: { name: 'Music' }, genre: { name: 'Rock' } }],
    priceRanges: [{ min: 39, max: 59, currency: 'EUR' }],
    _embedded: { venues: [{ name: 'Festhalle', city: { name: 'Frankfurt am Main' }, location: { latitude: '50.11', longitude: '8.65' } }] }
  });
  assert.equal(e.category, 'music');
  assert.equal(e.startTime, '20:00');
  assert.equal(e.price, '€39–59');
  assert.equal(e.lat, 50.11);
});

test('Geohash for Frankfurt centre', () => {
  assert.equal(geohash(50.1109, 8.6821, 5), 'u0yjj');
});

test('De-duplication keeps the curated version and fills gaps', () => {
  const tm = makeEvent({ source: 'ticketmaster', sourceId: '1', title: 'Jazz im Palmengarten', startDate: '2026-10-20', image: 'img.jpg' });
  const cur = makeEvent({ source: 'curated', sourceId: '2', title: 'Jazz im Palmengarten!', startDate: '2026-10-20', tags: ['picked'] });
  const out = dedupe([tm, cur]);
  assert.equal(out.length, 1);
  assert.equal(out[0].source, 'curated');
  assert.equal(out[0].image, 'img.jpg');
});
