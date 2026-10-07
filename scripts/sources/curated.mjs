import { readFile } from 'node:fs/promises';
import { makeEvent } from '../lib/normalize.mjs';

// Hand-picked events from data/curated.json. These win over every other source.
export async function fetchCurated(path) {
  const list = JSON.parse(await readFile(path, 'utf8'));
  if (!Array.isArray(list)) throw new Error('curated.json must be a JSON array');
  const events = list
    .filter(x => !x.example)
    .map((x, i) => makeEvent({
      source: 'curated',
      sourceId: x.id || `${i}`,
      title: x.title,
      description: x.description,
      startDate: x.date,
      startTime: x.time,
      endDate: x.endDate || (x.endTime ? x.date : null),
      endTime: x.endTime,
      allDay: !x.time,
      venue: x.venue,
      address: x.address,
      city: 'Frankfurt am Main',
      lat: x.lat, lon: x.lon,
      category: x.category,
      url: x.url,
      image: x.image,
      price: x.price,
      tags: [...(x.tags || []), 'picked']
    }));
  return { events };
}
