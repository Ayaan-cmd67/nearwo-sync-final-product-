// Runs every 6 hours in GitHub Actions (and locally with `npm run fetch`).
// Pulls every source, normalises, de-duplicates, and writes public/events.json.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { isValid, dedupe, inWindow, sortEvents, localParts } from './lib/normalize.mjs';
import { fetchTicketmaster } from './sources/ticketmaster.mjs';
import { fetchIcsFeed } from './sources/ics.mjs';
import { fetchCurated } from './sources/curated.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(join(root, 'config/sources.json'), 'utf8'));

const jobs = [
  ['curated', () => fetchCurated(join(root, 'data/curated.json'))],
  ...(config.ticketmaster?.enabled ? [['ticketmaster', () => fetchTicketmaster(config)]] : []),
  ...config.icsFeeds.filter(f => f.enabled).map(f => [`ics: ${f.name}`, () => fetchIcsFeed(f, config)])
];

const report = {};
const all = [];
for (const [name, run] of jobs) {
  try {
    const { events, skipped } = await run();
    const valid = events.filter(isValid);
    all.push(...valid);
    report[name] = skipped ? { status: 'skipped', reason: skipped } : { status: 'ok', count: valid.length };
  } catch (err) {
    report[name] = { status: 'error', error: String(err.message || err) };
  }
  console.log(`${name.padEnd(32)} ${JSON.stringify(report[name])}`);
}

const today = localParts(new Date(), config.region.timeZone).date;
const events = sortEvents(dedupe(all).filter(e => inWindow(e, today, config.windowDays)));

await writeFile(join(root, 'public/events.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  region: config.region.name,
  sources: report,
  events
}));
console.log(`\n${events.length} events written to public/events.json (from ${all.length} before de-duplication)`);

// Fail the run (so the last good site stays live) only if every source that ran broke.
const ran = Object.values(report).filter(r => r.status !== 'skipped');
if (ran.length > 0 && ran.every(r => r.status === 'error')) {
  console.error('All sources failed. Not deploying.');
  process.exit(1);
}
