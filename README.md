# Nearwo

What's on in Frankfurt, for newcomers and everyone else. No sign-up.

A free, serverless setup on GitHub:

```
GitHub Actions (every 6 h)            GitHub Pages
┌────────────────────────────┐       ┌──────────────────────┐
│ scripts/fetch-events.mjs   │       │ public/index.html    │
│  ├ data/curated.json       │       │ public/app.js        │
│  ├ Ticketmaster API  (key) ├──────▶│ public/events.json   │
│  └ venue iCal feeds        │       │ (generated)          │
└────────────────────────────┘       └──────────────────────┘
```

The API key lives in GitHub Secrets and only the Action uses it. Visitors download one static
`events.json`, so the site costs nothing and handles any traffic.

## One-time setup (about 15 minutes)

1. **Get a Ticketmaster key.** Register at developer.ticketmaster.com, open *My Apps*, and copy the
   *Consumer Key*. The free tier allows 5,000 calls a day; Nearwo uses about 20.
2. **Create the repository.** On GitHub: *New repository*, name it `nearwo`, set it to **Public**
   (free GitHub Pages needs a public repo), create it.
3. **Upload the files.** *Add file > Upload files*, drag in everything from this folder, commit.
   On a Mac, Finder hides the `.github` folder: press `Cmd + Shift + .` to show it before dragging.
   If it still doesn't upload, create it by hand: *Add file > Create new file*, name it
   `.github/workflows/fetch-and-deploy.yml`, and paste the file's contents.
4. **Add the key.** *Settings > Secrets and variables > Actions > New repository secret*.
   Name: `TICKETMASTER_API_KEY`, value: your key.
5. **Turn on Pages.** *Settings > Pages > Source: GitHub Actions*.
6. **Run it.** *Actions > Fetch events and deploy > Run workflow*. When it's green, the site is live at
   `https://<your-username>.github.io/nearwo/`

After that it refreshes itself every 6 hours, and redeploys whenever you commit a change.

## Adding events

**By hand (your curated picks).** Edit `data/curated.json` directly on GitHub (pencil icon), copy the
example block, remove the `"example": true` line, fill it in, commit. Live in about two minutes.
Curated events get a "Nearwo pick" label and override duplicates from other sources.

| Field | Required | Example |
|---|---|---|
| `title` | yes | `"Newcomers' Stammtisch"` |
| `date` | yes | `"2026-10-15"` |
| `time`, `endTime` | no (blank = all day) | `"19:00"` |
| `category` | no | `community`, `music`, `nightlife`, `arts`, `film`, `food`, `family`, `sports`, `other` |
| `venue`, `address`, `url`, `price`, `description`, `image`, `tags` | no | |

**From venue calendars (iCal).** Many venue and community sites publish a calendar feed. Look for
"Subscribe", "iCal", "Add to calendar", or for WordPress sites try `<site>/events/?ical=1`.
Add it to `icsFeeds` in `config/sources.json` with `"enabled": true`.

## Local preview (optional)

Requires Node 20+.

```bash
TICKETMASTER_API_KEY=yourkey npm run fetch   # writes public/events.json
npm run serve                                 # http://localhost:8080
npm test                                      # source adapter tests
```

## How it's built

- `scripts/lib/normalize.mjs`: the single event shape, de-duplication (same title + same day),
  date window. Every source converts into this shape, so the web app never changes when a source is added.
- `scripts/sources/*.mjs`: one adapter per source. A new source is one new file plus a line in
  `fetch-events.mjs`.
- If every source fails, the Action stops and the last good version stays online.
- No cookies, no tracking, no external requests from the page except event images. Fonts (Barlow,
  OFL licence) are self-hosted. Saved events and location stay in the visitor's browser.

## Before promoting it publicly

- **Impressum and privacy notice.** A German-facing website run by you needs an Impressum (§ 5 DDG)
  and a short Datenschutzerklärung. GitHub Pages is US-hosted and sees visitor IP addresses; mention it,
  or move hosting to a German provider later.
- **Ticketmaster terms.** Read the Discovery API terms of use on attribution and display; the app links
  every Ticketmaster event to its original page.
