const CATEGORIES = {
  community: { label: 'Meet people', line: '#F08A24' },
  music:     { label: 'Music',       line: '#D93B3B' },
  nightlife: { label: 'Nightlife',   line: '#5B4BC4' },
  arts:      { label: 'Arts & stage', line: '#B0478C' },
  film:      { label: 'Film',        line: '#8A6A3B' },
  food:      { label: 'Food & drink', line: '#3E9B5F' },
  family:    { label: 'Family',      line: '#2F8FB5' },
  sports:    { label: 'Sports',      line: '#4A6FA5' },
  other:     { label: 'Other',       line: '#7A8699' }
};
const TZ = 'Europe/Berlin';
const CENTRE = { lat: 50.1109, lon: 8.6821 };

const $ = s => document.querySelector(s);
const store = {
  get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};

const state = {
  events: [], q: '', when: 'week', cats: new Set(), savedOnly: false,
  saved: new Set(store.get('nearwo:saved', [])), here: null
};

// ---------- dates ----------
const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekday = iso => new Date(iso + 'T12:00:00Z').getUTCDay(); // 0 = Sunday

function whenRange(when) {
  const t = todayISO();
  if (when === 'today') return [t, t];
  if (when === 'week') return [t, addDays(t, 6)];
  if (when === 'weekend') {
    const wd = weekday(t);
    const sunday = addDays(t, (7 - wd) % 7);
    return [wd === 0 || wd >= 5 ? t : addDays(t, 5 - wd), sunday];
  }
  return [t, '9999-12-31'];
}

function dayLabel(iso) {
  const t = todayISO();
  const d = new Date(iso + 'T12:00:00Z');
  const long = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
  const name = d.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  if (iso === t) return { big: 'Today', small: `${name}, ${long}` };
  if (iso === addDays(t, 1)) return { big: 'Tomorrow', small: `${name}, ${long}` };
  return { big: name, small: long };
}

// ---------- distance ----------
function km(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- filtering ----------
function visibleEvents() {
  const [from, to] = whenRange(state.when);
  const q = state.q.trim().toLowerCase();
  return state.events.filter(e => {
    const last = e.endDate && e.endDate > e.startDate ? e.endDate : e.startDate;
    if (last < from || e.startDate > to) return false;
    if (state.cats.size && !state.cats.has(e.category)) return false;
    if (state.savedOnly && !state.saved.has(e.id)) return false;
    if (q && !`${e.title} ${e.venue ?? ''} ${e.address ?? ''} ${e.description ?? ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

// ---------- rendering ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';

function render() {
  const list = $('#list');
  const events = visibleEvents();
  $('#savedCount').textContent = state.saved.size ? `(${state.saved.size})` : '';

  if (!state.events.length) {
    list.innerHTML = `<div class="empty"><h2>No events yet</h2><p>The event list is empty. Once the data sources are connected, upcoming Frankfurt events show up here automatically.</p></div>`;
    return;
  }
  if (!events.length) {
    list.innerHTML = `<div class="empty"><h2>Nothing matches</h2><p>${state.savedOnly ? 'You haven’t saved any events in this period.' : 'No events fit these filters.'} Try a longer period or fewer categories.</p><button type="button" id="reset">Clear filters</button></div>`;
    $('#reset').onclick = resetFilters;
    return;
  }

  const byDay = new Map();
  const [from] = whenRange(state.when);
  for (const e of events) {
    const day = e.startDate < from ? from : e.startDate; // ongoing multi-day events sit on the first visible day
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(e);
  }

  const t = todayISO();
  list.innerHTML = [...byDay].map(([day, evs]) => {
    const { big, small } = dayLabel(day);
    return `<section class="day${day === t ? ' is-today' : ''}" aria-label="${esc(big + ', ' + small)}">
      <h2 class="day-name"><strong>${esc(big)}</strong><span>${esc(small)}</span></h2>
      <ol>${evs.map(row).join('')}</ol>
    </section>`;
  }).join('');
}

function row(e) {
  const cat = CATEGORIES[e.category] ?? CATEGORIES.other;
  const dist = state.here && e.lat != null ? `<span class="dist">${km(state.here, e).toFixed(1)} km</span>, ` : '';
  const meta = [e.venue, e.price].filter(Boolean).map(esc).join(', ');
  const saved = state.saved.has(e.id);
  return `<li class="ev" data-id="${esc(e.id)}" style="--line:${cat.line}">
    <span class="ev-time${e.startTime ? '' : ' none'}">${e.startTime ? esc(e.startTime) : 'All day'}</span>
    <span class="ev-line" title="${esc(cat.label)}"></span>
    <div class="ev-main">
      <button class="ev-title" type="button" data-open>${esc(e.title)}</button>
      <p class="ev-meta">${dist}${meta || esc(cat.label)}${e.tags.includes('picked') ? '<span class="picked">Nearwo pick</span>' : ''}</p>
    </div>
    <button class="save" type="button" aria-pressed="${saved}" aria-label="${saved ? 'Remove from saved' : 'Save event'}">${star}</button>
  </li>`;
}

function renderCats() {
  const present = new Set(state.events.map(e => e.category));
  $('#cats').innerHTML = Object.entries(CATEGORIES).filter(([id]) => present.has(id)).map(([id, c]) =>
    `<button type="button" data-cat="${id}" style="--line:${c.line}" aria-pressed="${state.cats.has(id)}"
      class="${state.cats.size && !state.cats.has(id) ? 'dim' : ''}">${esc(c.label)}</button>`).join('');
}

// ---------- detail ----------
function openDetail(id) {
  const e = state.events.find(x => x.id === id);
  if (!e) return;
  const cat = CATEGORIES[e.category] ?? CATEGORIES.other;
  const { big, small } = dayLabel(e.startDate);
  const when = `${big === 'Today' || big === 'Tomorrow' ? big + ', ' + small : big + ', ' + small}${e.startTime ? ', ' + e.startTime : ''}${e.endTime ? '–' + e.endTime : ''}`;
  const saved = state.saved.has(e.id);
  const mapUrl = e.lat != null
    ? `https://www.openstreetmap.org/?mlat=${e.lat}&mlon=${e.lon}#map=17/${e.lat}/${e.lon}`
    : e.address ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(e.address)}` : null;

  $('#d-body').innerHTML = `
    ${e.image ? `<img class="d-img" src="${esc(e.image)}" alt="" referrerpolicy="no-referrer">` : ''}
    <div class="d-content" style="--line:${cat.line}">
      <h2 id="d-title">${esc(e.title)}</h2>
      <dl class="d-facts">
        <dt>When</dt><dd>${esc(when)}</dd>
        ${e.venue ? `<dt>Where</dt><dd>${esc(e.venue)}${e.address && e.address !== e.venue ? `<br><span style="font-weight:400">${esc(e.address)}</span>` : ''}</dd>` : ''}
        ${e.price ? `<dt>Price</dt><dd>${esc(e.price)}</dd>` : ''}
        <dt>Type</dt><dd>${esc(cat.label)}</dd>
      </dl>
      ${e.description ? `<p class="d-desc">${esc(e.description)}</p>` : ''}
      <div class="d-actions">
        ${e.url ? `<a class="primary" href="${esc(e.url)}" target="_blank" rel="noopener">Open event page</a>` : ''}
        <button type="button" data-ics>Add to calendar</button>
        ${mapUrl ? `<a href="${esc(mapUrl)}" target="_blank" rel="noopener">Show on map</a>` : ''}
        <button type="button" data-dsave aria-pressed="${saved}">${saved ? 'Saved' : 'Save'}</button>
      </div>
      <p class="d-source">Listed via ${esc(sourceName(e.source))}</p>
    </div>`;
  $('#d-body [data-ics]').onclick = () => downloadIcs(e);
  $('#d-body [data-dsave]').onclick = ev => { toggleSave(e.id); ev.target.textContent = state.saved.has(e.id) ? 'Saved' : 'Save'; };
  $('#detail').showModal();
}

const sourceName = s => ({ curated: 'Nearwo', ticketmaster: 'Ticketmaster', ics: 'the organiser’s calendar' }[s] ?? s);

function downloadIcs(e) {
  const d = e.startDate.replaceAll('-', '');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const escI = s => String(s ?? '').replace(/[\\,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const timed = Boolean(e.startTime);
  const start = timed ? `DTSTART;TZID=Europe/Berlin:${d}T${e.startTime.replace(':', '')}00` : `DTSTART;VALUE=DATE:${d}`;
  const endT = e.endTime || (timed ? String((+e.startTime.slice(0, 2) + 2) % 24).padStart(2, '0') + e.startTime.slice(2) : null);
  const end = timed ? `DTEND;TZID=Europe/Berlin:${(e.endDate || e.startDate).replaceAll('-', '')}T${endT.replace(':', '')}00`
    : `DTEND;VALUE=DATE:${addDays(e.endDate || e.startDate, 1).replaceAll('-', '')}`;
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nearwo//EN', 'BEGIN:VEVENT',
    `UID:${e.id.replace(/[^\w.-]/g, '')}@nearwo`, `DTSTAMP:${stamp}`, start, end,
    `SUMMARY:${escI(e.title)}`, e.venue && `LOCATION:${escI([e.venue, e.address].filter(Boolean).join(', '))}`,
    e.url && `URL:${e.url}`, 'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: 'nearwo-event.ics'
  });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- interactions ----------
function toggleSave(id) {
  state.saved.has(id) ? state.saved.delete(id) : state.saved.add(id);
  store.set('nearwo:saved', [...state.saved]);
  render();
}

function resetFilters() {
  state.q = ''; $('#q').value = ''; state.cats.clear(); state.savedOnly = false; state.when = 'all';
  syncControls(); renderCats(); render();
}

function syncControls() {
  document.querySelectorAll('.when button').forEach(b => b.setAttribute('aria-checked', b.dataset.when === state.when));
  $('#savedOnly').setAttribute('aria-pressed', state.savedOnly);
  $('#near').setAttribute('aria-pressed', Boolean(state.here));
}

$('#q').addEventListener('input', e => { state.q = e.target.value; render(); });
document.querySelector('.when').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.when = b.dataset.when; syncControls(); render();
});
$('#cats').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.cats.has(b.dataset.cat) ? state.cats.delete(b.dataset.cat) : state.cats.add(b.dataset.cat);
  renderCats(); render();
});
$('#savedOnly').addEventListener('click', () => { state.savedOnly = !state.savedOnly; syncControls(); render(); });
$('#near').addEventListener('click', () => {
  if (state.here) { state.here = null; syncControls(); render(); return; }
  if (!navigator.geolocation) return;
  const btn = $('#near'); btn.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    p => { state.here = { lat: p.coords.latitude, lon: p.coords.longitude }; btn.textContent = 'Show distance'; syncControls(); render(); },
    () => { state.here = CENTRE; btn.textContent = 'Distance from Hauptwache'; syncControls(); render(); },
    { maximumAge: 600000, timeout: 8000 }
  );
});
$('#list').addEventListener('click', e => {
  const li = e.target.closest('.ev'); if (!li) return;
  if (e.target.closest('.save')) toggleSave(li.dataset.id); else openDetail(li.dataset.id);
});
$('#detail').addEventListener('click', e => { if (e.target === $('#detail')) $('#detail').close(); });

// Keep sticky day headers just below the filter bar, whatever its height.
new ResizeObserver(([entry]) => {
  document.documentElement.style.setProperty('--controls-h', entry.target.offsetHeight + 'px');
}).observe(document.querySelector('.controls'));

// ---------- load ----------
async function load() {
  try {
    const res = await fetch('events.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    state.events = data.events ?? [];
    const mins = Math.round((Date.now() - new Date(data.generatedAt)) / 60000);
    $('#updated').textContent = `${state.events.length} events, updated ${mins < 60 ? mins + ' min' : Math.round(mins / 60) + ' h'} ago`;
  } catch {
    $('#updated').textContent = 'Event data could not be loaded. Reload the page to try again.';
  }
  renderCats(); render();
}
load();
