# Raise That Bar

A serverless PWA for planning strength workouts and tracking progress. Hosted on GitHub Pages at raisethatbar.com. Local-first (IndexedDB), with Google Drive sync planned for a later phase.

This document is the single source of truth for the data model, intended UX, and build order. Update it as decisions evolve — never let code drift ahead of this spec without first updating the spec.

---

## Project goals

- **Plan workouts day by day.** No fixed week structure. Plan one day, ten days, or skip ahead — each planned date is its own record.
- **Workouts are grouped.** A typical day looks like: Warm-up → Mobility → Build-ups → Hypertrophy/Main → Cool-down. Groups are part of the workout template, not a UI convention.
- **Library is CSV-mergeable.** The exercise library lives as a CSV in the repo. The user edits it in their editor of choice, commits, and the app re-imports it via merge-by-id.
- **Sessions reflect reality.** A session can be planned (from a template), freestyle (no template), or diverged (started from template, modified during). All three are the same `session` record shape.
- **Add on the fly.** Mid-session, the user can add blocks, groups, or whole extra exercises. The session diverges from the template silently — that's allowed and expected.
- **Track progress meaningfully.** Charts per exercise, PRs, calendar, weekly consistency, bodyweight trend.
- **Offline-first.** Service worker caches the shell. IndexedDB persists everything.
- **Phase 2: Drive sync.** Schema is already sync-ready (every record has `updatedAt`); the wiring comes later.

---

## Tech stack & constraints

- **Vanilla JS, no build step.** Static files served from GitHub Pages. No bundler, no transpiler.
- **IndexedDB** for storage. Thin wrapper in `db.js`.
- **Chart.js via CDN**, cached by service worker for offline use.
- **Plain HTML/CSS** with CSS variables for theming.
- **No frameworks.** If a third-party library is proposed, justify it against the no-build constraint and the offline requirement.
- **Mobile-first.** The app is primarily used on a phone in the gym. Desktop should work but is not the primary target.

If a future need genuinely requires a build step (e.g., we want to use TypeScript or a component library), document the tradeoff in this file before introducing it.

### AI integration

AI features (e.g. calorie estimation from food description) call a **Cloudflare Worker proxy** that forwards requests to the Gemini Flash API. The proxy URL is configured via `VITE_GEMINI_PROXY_URL` in the `.env` file (dev default: `http://localhost:8787/ai`).

**Canonical pattern for all AI calls — use `callGemini()` defined in `TodayView.tsx`:**

```ts
const GEMINI_PROXY_URL = import.meta.env.VITE_GEMINI_PROXY_URL as string;

async function callGemini(prompt: string): Promise<string | null> {
  try {
    const res = await fetch(GEMINI_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return text.replace(/```json|```/g, '').trim();
  } catch {
    return null;
  }
}
```

Proxy contract: `POST <PROXY_URL>` with `{ "prompt": string }` → raw Gemini API JSON. The client builds the prompt and parses the response. On failure, `callGemini` returns `null` — show "AI unavailable — try again or enter manually", never an auth prompt.

---

## Data model

Six IndexedDB object stores. All records carry `updatedAt` (ms since epoch). Built-in exercises use stable string ids like `ex_pullup`; user-added records use `ex_custom_<random>` or `<prefix>_<random>`.

### `exercises` — library, keyed by `id`

```ts
{
  id: string,                  // "ex_pullup", "ex_custom_abc123"
  name: string,                // "Pull-Up"
  muscleGroup: string,         // primary: "back", "chest", "legs", "core", "full-body", ...
  secondaryMuscles: string[],  // ["biceps", "shoulders"]
  equipment: string,           // "bodyweight", "barbell", "dumbbell", "cable", "machine", "kettlebell", "band", "other"
  category: string,            // "warmup", "stretching", "muscle", "cardio", "cooldown"
  videoUrl: string | null,     // any YouTube URL format; we extract the id at render time
  defaultUnit: string | null,  // "kg" | "lb" | "sec" | "min" | null
  source: "library" | "custom",
  archived: boolean,
  updatedAt: number
}
```

### `workouts` — reusable templates, keyed by `id`

```ts
{
  id: string,                  // "w_upper_a", "w_custom_xyz"
  name: string,                // "Upper Body A"
  notes: string,
  groups: [
    {
      id: string,              // local id within this workout, e.g. "g1"
      name: string,            // free-form display: "Hypertrophy"
      groupType: string,       // fixed: "warmup" | "mobility" | "activation" | "main" | "accessory" | "cardio" | "cooldown"
      blocks: [
        {
          id: string,
          exerciseId: string,
          targetSets: number | null,
          targetReps: string | null,    // string to allow ranges: "6-8", "AMRAP", "10"
          targetWeight: number | null,
          targetTime: number | null,    // seconds
          targetDistance: number | null,// meters
          restSec: number | null,
          notes: string
        }
      ]
    }
  ],
  archived: boolean,
  updatedAt: number
}
```

### `plan` — daily schedule, keyed by `date`

```ts
{
  date: string,                // "2026-04-30" ISO
  workouts: [
    { workoutId: string, note: string }
  ],
  notes: string,               // day-level notes
  updatedAt: number
}
```

Empty/rest days are simply absent from the store. Multiple workouts in one day = multiple entries in the array.

### `sessions` — logged workouts, keyed by `id`

```ts
{
  id: string,
  date: string,                // "2026-04-30" ISO
  startedAt: number,
  finishedAt: number | null,
  durationMs: number | null,
  workoutId: string | null,    // null = freestyle
  workoutName: string,         // denormalized — preserved against template renames
  unplanned: boolean,          // true = added on the fly, not in plan for this date
  groups: [
    {
      id: string,
      name: string,
      groupType: string,
      blocks: [
        {
          id: string,
          exerciseId: string,
          exerciseName: string,    // denormalized
          skipped: boolean,
          skipReason: string,
          sets: [
            {
              completed: boolean,
              weight: number | null,
              reps: number | null,
              time: number | null,
              distance: number | null,
              rpe: number | null,
              notes: string
            }
          ]
        }
      ]
    }
  ],
  notes: string,
  updatedAt: number
}
```

When a session is started from a template, copy the template's groups/blocks structure into the session and convert `targetSets: 4` into 4 empty `set` entries with `completed: false`. From that moment, the session is the truth — edits don't go back to the template.

### `bodyweight` — daily weight log, keyed by `date`

```ts
{
  date: string,                // "2026-04-30"
  weight: number,
  unit: "kg" | "lb",
  notes: string,
  updatedAt: number
}
```

### `meta` — settings & app state, keyed by `key`

```ts
{ key: "schema_version", value: 1 }
{ key: "activeSession", value: <session record being edited live> }
{ key: "preferences", value: { unit: "kg", restTimerSound: true, ... } }
{ key: "library_csv_url", value: "https://raw.githubusercontent.com/.../library.csv" }
{ key: "sync", value: { lastPushedAt, lastPulledAt, deviceId } }   // phase 2
```

---

## Sets are uniform

Every set has the same shape (weight, reps, time, distance, rpe, notes, completed). Most fields are `null` most of the time. The **UI** decides which inputs to render based on the exercise's `category` and `defaultUnit`:

| Exercise category / kind | Inputs shown |
|---|---|
| Strength (defaultUnit: kg/lb) | weight + reps |
| Bodyweight strength | reps (+ optional weight for weighted variants) |
| Stretching, hold | time |
| Cardio | time + optional distance |
| Warm-up rotations / dynamic | reps OR time, depending on exercise's defaultUnit |

`rpe` is always available as an optional secondary input — small "+RPE" toggle.

This decision keeps storage, sync, export, and history queries simple. The branching lives in the rendering layer, where it's cheap.

---

## CSV library format

`library.csv` lives at the repo root. Format:

```csv
id,name,muscleGroup,secondaryMuscles,equipment,category,videoUrl,defaultUnit
ex_pullup,Pull-Up,back,"biceps,shoulders",bodyweight,muscle,https://youtu.be/eGo4IYlbE5g,
ex_bench_press,Bench Press,chest,"triceps,shoulders",barbell,muscle,https://youtu.be/rT7DgCr-3pg,kg
ex_world_greatest,World's Greatest Stretch,full-body,,bodyweight,stretching,https://youtu.be/cM_5N5fY1k4,sec
ex_joint_rotations,Joint Rotations,full-body,,bodyweight,warmup,,sec
```

### Merge rules on import

- `id` is the merge key. Edit a row, reimport → updates that exercise.
- New `id` → inserted with `source: "library"`.
- `id` exists in DB but missing from CSV → **left alone**, not deleted.
- User-added exercises (`source: "custom"`) → never touched by import.
- `secondaryMuscles` is a comma-separated string within a quoted CSV field → split on import.
- After successful merge, store the import timestamp in `meta` for display.

The "Import library" action lives in the menu. The CSV URL is configurable via meta but defaults to a path in the same repo.

---

## YouTube video handling

- CSV stores any YouTube URL: `youtube.com/watch?v=X`, `youtu.be/X`, `youtube.com/shorts/X`, `youtube.com/embed/X`.
- App extracts the video id at render time with a small regex helper.
- "Watch" button on an exercise opens a **modal with embedded `youtube-nocookie.com` iframe**, plus an "Open in YouTube" fallback link.
- Modal keeps the user inside the app — important during a session so state isn't lost.

Reference helper:

```js
function extractYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : null;
}
```

---

## Views & UX

### Today
- Date header.
- If active session: session UI (timer, groups, blocks, sets).
- Otherwise:
  - Today's plan (workouts scheduled for today, with "Start" buttons).
  - "Start freestyle" button.
  - "Log bodyweight" small entry.
  - Quick stats: streak, this week, all-time.

### Plan
- **Calendar view with drag-and-drop.** User-confirmed UX choice.
- Month grid; each cell shows planned workouts as small chips and completed sessions as colored dots.
- Drag a workout chip from one date to another → updates the relevant `plan` records.
- Tap a date → editor for that day: pick workouts from the templates list, add notes, save.
- "Today" button to snap back to current date.

### Workouts (templates)
- List of templates, grouped by archived/active.
- Tap to view/edit a template.
- Editor: name, notes, then ordered groups, each with ordered blocks. Drag to reorder both. Each block: pick exercise, set targets.
- "New workout" button.
- "Save as template" action available from a finished session.

### History
- Session list, reverse chronological.
- Each row: date, workout name, exercise count, total volume, duration.
- Tap → session detail (read-only or with edit).
- Filter chip: "All" / "Planned" / "Unplanned".

### Progress
- Exercise selector at top.
- Charts per exercise: top-set weight, estimated 1RM (Epley: `w * (1 + r/30)`), volume (kg × reps).
- Weekly consistency bar chart (last 12 weeks).
- Bodyweight trend chart.
- PRs list across all exercises.

### Exercises
- Searchable, filterable by category/muscle/equipment.
- Tap → detail with video.
- Add custom exercise.
- Menu actions: Import library CSV, Export user-added exercises as CSV, Archive/unarchive.

### Settings (in menu)
- Unit preference (kg/lb default for new exercises).
- Library CSV URL.
- Export all data (JSON).
- Import data (JSON).
- Wipe all data.
- (Phase 2) Connect Google Drive, sync now.

---

## File map

```
index.html                      Shell, view containers
styles.css                      Theme + components
app.js                          App logic, view rendering, event wiring
db.js                           IndexedDB wrapper
sw.js                           Service worker (cache shell + chart.js CDN)
manifest.webmanifest            PWA manifest
library.csv                     Built-in exercise library
icons/                          App icons
.nojekyll                       Tells GitHub Pages to serve files as-is
README.md                       User-facing docs
CLAUDE.md                       This file — for future Claude Code sessions
```

If `app.js` exceeds ~1500 lines, split into modules (`session.js`, `progress.js`, `plan.js`, etc.) loaded as separate `<script>` tags. Until then, single file is simpler.

---

## Build order

Each phase should ship in a working state before moving on. Don't half-build phase N to start phase N+1.

### Phase 1 — Foundation (current state, partially built)
- [x] Static shell, manifest, service worker, icons
- [x] IndexedDB wrapper
- [x] Bottom nav, view switching
- [ ] Schema migration to the data model in this doc *(prior code uses a simpler schema — needs updating)*
- [ ] Library CSV import
- [ ] Exercises view with search, filters, video modal

### Phase 2 — Workouts & sessions
- [ ] Workout template editor (groups, blocks, drag-reorder)
- [ ] Today view: start planned or freestyle session
- [ ] Active session UI: groups collapsible, set rows render based on exercise type
- [ ] Add block / add group / skip block / add cardio mid-session
- [ ] Save as template from a session
- [ ] Finish session → save to history

### Phase 3 — Planning
- [ ] Calendar plan view with drag-drop
- [ ] Tap-to-edit day
- [ ] Visual distinction: planned / completed / unplanned dots
- [ ] Today reads from plan and offers planned workouts

### Phase 4 — Progress
- [ ] History list with filter chips
- [ ] Session detail view
- [ ] Progress charts (top set, est 1RM, volume) per exercise
- [ ] Weekly consistency
- [ ] PRs list
- [ ] Bodyweight log + trend chart

### Phase 5 — Drive sync (later)
- [ ] OAuth via Google Identity Services (no server)
- [ ] Snapshot push: serialize all stores, upload as `rtb-backup.json` to app folder
- [ ] Snapshot pull + merge by `updatedAt` per record
- [ ] Conflict resolution: newer `updatedAt` wins per record
- [ ] Sync triggers: on app open, after finishing a session, manual button
- [ ] Settings UI for connect/disconnect

---

## Coding conventions

- **DOM helpers:** `$(sel)` and `$$(sel)` for query, `uid()` for ids. Already in `app.js`.
- **No external state library.** A plain `state` object plus explicit re-render functions per view. Don't over-engineer to React/Redux territory.
- **Re-render after mutation.** When state changes, call the relevant `renderX()`. The DOM is rebuilt from state — don't try to do surgical updates.
- **Persist immediately.** Any input change writes through to IndexedDB on `input` event (not `change`) so reload never loses data. Pattern is in current `app.js`.
- **Denormalize names** in sessions and history records. Renames in templates/exercises shouldn't rewrite history.
- **Update `updatedAt`** on every mutation. This is what Phase 5 sync depends on.
- **Escape user input** rendered as HTML. `escapeHtml()` helper exists.

---

## What NOT to do

- Don't introduce a build step or framework without updating this doc and explaining the tradeoff.
- Don't store IDs as numbers or autoincrement. String ids are stable across exports/imports/syncs.
- Don't use `change` events on inputs — use `input` so values save as the user types. (We hit this bug already.)
- Don't apply `display: <something>` to elements that also use the `[hidden]` attribute. The global `[hidden] { display: none !important; }` rule in `styles.css` covers this, but don't fight it.
- Don't delete records on archive. Archive is a flag (`archived: true`); deletion is reserved for explicit user intent.
- Don't treat the CSV as live state. It's a merge source. The DB is truth.
- Don't reflexively suggest server-side anything. The app is local-first by design. Drive sync (phase 5) is OAuth-direct from the browser.

---

## Known issues from prior build

- Earlier code used a flatter schema (`session.exercises[].sets[]` with no group structure). Migration: detect schema_version meta, run a one-time upgrade that wraps existing exercises into a single "Main" group with `groupType: "main"`.
- Earlier templates were `{ name, exerciseIds: [...] }` — flat. Same migration: wrap into one "Main" group.
- Earlier sets only had weight/reps. Migration: pad with `time/distance/rpe: null`.

Write the migration as part of Phase 1 so any user who tries the prior version doesn't get a broken state.

---

## Open decisions for future sessions

- **Periodization layer.** Currently the plan is just dates. If user wants mesocycles ("weeks 1–4 are accumulation"), how do we express that? Possible answer: a `cycle` store with `{ id, name, startDate, endDate, notes }` and an optional `cycleId` on plan records.
- **Exercise variations.** Should "Wide-grip Pull-Up" and "Close-grip Pull-Up" be siblings of "Pull-Up", or a single Pull-Up with a `variation` field? Currently: separate exercises, each with its own id. Revisit if the library balloons.
- **Per-set rest timer.** UI question, not data — should starting a set start a timer; should completing a set start the rest timer? Possibly auto-fill from `block.restSec`.

Decide these as they come up; don't speculatively code them.
