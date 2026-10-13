# 🌱 Habit Sheet — Modern Habit Tracker

A beautiful, responsive habit tracker inspired by [habit-sheet-en.kimi.site](https://habit-sheet-en.kimi.site). Built with **clean HTML, CSS and vanilla JavaScript** — no frameworks, no build step. Just open `index.html` (or any static host) and start tracking.

![vanilla JS](https://img.shields.io/badge/vanilla-JS-yellow) ![data](https://img.shields.io/badge/data-local--only-green)

## ✨ Features

- **Add / edit / delete habits** — with emoji, color and a weekly repeat schedule (e.g. weekdays only).
- **Daily check-off** — animated circular checkboxes with instant feedback and toasts.
- **Today dashboard** — greeting, date, summary line and an animated **daily progress ring (%)**.
- **Weekly habit sheet** — Kimi-style grid: habits × 7 days, tap any cell to toggle, per-row weekly %, week paging (‹ ›).
- **Calendar view** — monthly heat calendar with per-day completion dots & %, day-detail panel, month navigation.
- **Statistics** — best streak 🔥, total completions ✅, this-week % 🎯, last-7-days bar chart, 6-weekly progress bars, per-habit success-rate summary.
- **Streaks** — current & all-time streaks computed from scheduled days only (rest days don't break streaks).
- **Dark & light mode** — one-tap toggle, respects system preference, persisted; no flash-of-wrong-theme.
- **localStorage persistence** — habits, completions and theme survive refreshes and browser restarts. Nothing leaves your device.
- **Mobile-friendly** — responsive layout, floating action button on small screens, sticky tab navigation.
- **Smooth animations** — view transitions, pop/scale micro-interactions, scroll-reveal cards, reduced-motion support.
- **First-visit demo data** — seeded sample habits with history so charts look alive immediately (delete them any time).

## 📁 Project structure

```
.
├── index.html          # App shell: tabs, hero, views, modals
├── css/
│   └── style.css       # Theme variables, components, responsive rules
├── js/
│   └── app.js          # State, localStorage, rendering, streak/stats logic
└── tests/
    └── smoke.test.js   # jsdom functional tests (36 assertions)
```

## 🚀 Run locally

No installation required:

```bash
# Option A: just open the file
open index.html            # macOS
xdg-open index.html        # Linux

# Option B: serve it (recommended)
python3 -m http.server 8000
# → http://localhost:8000
```

## 🧪 Test

Functional smoke tests run in Node via [jsdom](https://github.com/jsdom/jsdom):

```bash
npm install          # installs jsdom (dev-only dependency)
npm test             # runs tests/smoke.test.js
```

Covers: CRUD of habits, daily toggling, weekly-grid toggling, calendar navigation, stats/charts rendering, theme toggle + persistence, reload persistence, rest-day scheduling logic, form validation.

## 🗃️ Data model (localStorage)

| Key | Value |
|---|---|
| `habitSheet.data.v1` | `{ habits: [{id,name,icon,color,days:[0-6],createdAt}], log: { "YYYY-MM-DD": [habitId,...] } }` |
| `habitSheet.theme` | `"dark"` \| `"light"` |
| `habitSheet.seeded` | first-visit demo-data flag |

To reset everything, clear site data or run `localStorage.clear()` in DevTools.

## 🌐 Deploy

Static hosting out of the box — GitHub Pages, Netlify, Vercel or Cloudflare Pages. For GitHub Pages, push these files to your repo root and enable *Settings → Pages*.

## 📄 License

MIT — do whatever you like.
