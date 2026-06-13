<div align="center">

<svg width="70" height="70" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <g transform="rotate(-11 100 100)">
    <polyline points="30,100 78,100 88,100 93,114 100,69 108,126 114,100 122,100 170,100" fill="none" stroke="#FF2D55" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/>
    <rect x="42" y="62" width="16" height="76" rx="2" fill="#EDE6D6"/>
    <rect x="60" y="74" width="12" height="52" rx="2" fill="#EDE6D6"/>
    <rect x="128" y="74" width="12" height="52" rx="2" fill="#EDE6D6"/>
    <rect x="142" y="62" width="16" height="76" rx="2" fill="#EDE6D6"/>
  </g>
</svg>

# RAISE THAT BAR

**Plan workouts. Track sessions. See progress.**

A local-first PWA for strength athletes — no account required, no subscription, no cloud lock-in.

[![Deploy](https://github.com/AdityaKhatri/iron-log/actions/workflows/deploy.yml/badge.svg)](https://github.com/AdityaKhatri/iron-log/actions/workflows/deploy.yml)

</div>

---

## What it does

Raise That Bar is a mobile-first workout tracker that lives entirely on your device. Plan your training week, log sessions in the gym, and watch your lifts trend upward over time — all without handing your data to a third party.

### Plan
Build reusable workout templates with named groups (Warm-up, Main, Accessory, Cool-down) and exercise blocks with target sets, reps, weight, and rest. Arrange your schedule on a calendar — drag workouts between days, add notes, and see what's done vs. what's coming.

### Log
Start any planned workout or go freestyle. Sets are logged inline — weight and reps for strength, time for holds and stretches, distance for cardio. Mark sets complete, skip blocks, add exercises mid-session. The timer runs in the background. When you're done, the session is saved automatically.

### Track
View your history by date or filter by workout type. See per-exercise charts: top set weight, estimated 1RM (Epley formula), and total volume over time. Track bodyweight alongside your lifts. Personal records are highlighted.

### Exercises
A built-in library covers the common movements across all categories (muscle, warmup, stretching, cardio, cooldown). Each exercise has a muscle group, equipment tag, and optional YouTube video linked directly in the app. Add your own custom exercises or import a CSV to bulk-update the library.

### Profile & Sync
Set your name, date of birth, height, and preferred unit (kg/lb). Optionally back up everything to Google Drive — one JSON file stored in your app's private Drive folder, invisible to the rest of Drive. Restore from backup on a new device.

---

## Tech

| Layer | Choice |
|---|---|
| UI | React 19 + TypeScript |
| Build | Vite 8 |
| Storage | IndexedDB (no Dexie, hand-rolled wrapper) |
| Charts | Chart.js |
| Sync | Google Drive appDataFolder via GIS token model |
| Hosting | GitHub Pages + custom domain |
| Offline | Service worker (cache-first shell) |

No external state library. No ORM. No backend. Everything runs in the browser.

---

## Local development

```bash
git clone https://github.com/AdityaKhatri/iron-log.git
cd iron-log
npm install
npm run dev
```

The app works fully without Google Drive — sync is opt-in. To enable it locally:

```bash
cp .env.example .env
# paste your Google OAuth client ID into .env
```

See [Google Drive setup](#google-drive-setup) below for how to get that client ID.

---

## Google Drive setup

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable the **Google Drive API**
3. Configure the OAuth consent screen (External) — add scopes:
   - `drive.appdata`
   - `userinfo.email`
   - `userinfo.profile`
4. Create an **OAuth 2.0 Client ID** (Web application type)
5. Add authorized JavaScript origins:
   - `http://localhost:5173` (dev)
   - `https://raisethatbar.com` (production)
6. Copy the client ID into `.env`:
   ```
   VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
   ```
7. For the GitHub Pages deployment, add `VITE_GOOGLE_CLIENT_ID` as a repository secret under **Settings → Secrets and variables → Actions**

---

## Deployment

Pushing to `main` triggers a GitHub Actions workflow that builds the app and deploys it to GitHub Pages automatically. The site is served at [raisethatbar.com](https://raisethatbar.com) via a custom domain.

To enable it in your fork:
1. Go to **Settings → Pages**
2. Set source to **GitHub Actions**
3. Add the `VITE_GOOGLE_CLIENT_ID` secret if you want Drive sync enabled in production

---

## Data model

Six IndexedDB stores: `exercises`, `workouts`, `plan`, `sessions`, `bodyweight`, `meta`. Every record carries an `updatedAt` timestamp — this is what makes Drive sync possible without a server. Merge conflicts resolve by last-write-wins per record.

Sessions are self-contained snapshots: exercise names are denormalized into the session record, so renaming an exercise never corrupts history.

---

## License

MIT
