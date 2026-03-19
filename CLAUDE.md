# Gas Breaker — Project Context for Claude Code

## What This Is
Gas Breaker is a real-time anesthesia break coordination web app for hospital OR departments. It runs as a **single HTML file** (`index.html`) with no build step. It is deployed on Vercel at **gasbreaker.net** via auto-deploy from GitHub (`github.com/kimmbel/gas-breaker`).

## Tech Stack
- **Single file**: All HTML, CSS, and JavaScript in `index.html`
- **Firebase Realtime Database** for live sync across all devices
- **Firebase Authentication** for login
- **No framework, no build step** — vanilla JS using a custom `el()` DOM helper
- **Vercel** for hosting — push to GitHub → auto-deploys in ~30 seconds

## Firebase Configuration
```
Project: gas-breaker
Database URL: https://gas-breaker-default-rtdb.firebaseio.com
Auth domain: gas-breaker.firebaseapp.com
```

## Authentication Model
- Department users: `{CODE}@gasbreaker.app` / password = dept passcode
- Admin user: `admin@gasbreaker.app` / password = admin passcode
- Display mode auto-login via URL: `?display=1&code={CODE}`
- Dept users can read/write `boards/` but NOT `config/` (Firebase rules)
- Only admin can write to `config/`

## Firebase Data Structure
```
boards/{code}/{date}/
  {roomId}/          — OR card data: provider, breaks, hold, holdAt, holdDuration, requesting
  _hist_{nameKey}/   — Provider history: provider, breaks, note{text,color}
  _call_/{idx}/      — On-call assignments (string: provider name)
  _postcall_/{idx}/  — Post-call assignments (string: provider name)
  _eod_/{roomId}/    — End-of-day room times (string: "HH:MM" 24h)
  _eodconcern_/      — Concern threshold time (string: "HH:MM" 24h)

config/{code}/
  locations/{idx}    — OR location names (strings, may include __divider__* keys)
  noBreakSlots/{idx} — No-break slot names
  callPositions/{idx}— On-call position names
  roster/{pushKey}   — Provider roster names
  passcode           — Dept login passcode
  eodConcernTime     — DEPRECATED: moved to boards/_eodconcern_

departments/{code}   — Dept display name
```

## Key Design Decisions
- `roomId(loc)` converts location name to Firebase key: `loc.replace(/[^a-zA-Z0-9]/g, "_")`
- `isDivider(loc)` returns true if loc starts with `"__divider__"` — section dividers in OR list
- Provider breaks follow the provider by name all day via `_hist_` keys
- `tsDay()` generates today's date key: `YYYY-M-D`
- All board data auto-clears at midnight (new date = new boardRef path)
- `eodConcernTime` is stored in `boards/` NOT `config/` because dept users can't write config

## App Modes
1. **Phone board** (`renderBoard`) — warm cream/brown theme, OR cards with break pills
2. **Coordinator display** (`renderDisplay`) — dark theme, shown at `?display=1`, no scroll, fills TV screen exactly
3. **Admin page** (`renderAdminPage`) — manage locations, no-break slots, call positions, roster

## Coordinator Display Architecture
- `renderDisplay()` — full DOM rebuild, called on structural config changes or initial load
- `patchDisplay()` — surgical DOM update, called on board data changes (no jitter)
- `patchFilter()` — updates filter chip counts and card highlight classes
- `layoutDisplay()` — calculates optimal card grid to fill screen without scrolling, cached
- Config listener: calls `renderDisplay()` only for structural changes (locations/slots/positions/roster); ignores `eodConcernTime` changes
- `body.display-mode { overflow: hidden }` — prevents scrollbar on coordinator display

## OR Card Structure (display mode)
```
.or-card.display-card
  .card-inner
    .card-body
      room-label row (may include .eod-time-badge and .display-badges)
      .provider-name-btn (may have 📞 or 🌙 prefix for call/post-call)
      .pill-row (AM / Lunch / PM break pills)
    .card-side
      [data-role="hold"] button
      [data-role="request"] button  
      [data-role="note"] button (display only)
      duration picker div (hidden until Hold pressed)
```

## Hold System
- First Hold press → shows 10m/20m/30m duration picker, hides Request and Note buttons
- Duration selected → `setHold(loc, durationMs)` writes hold:true, holdAt, holdDuration
- Active hold press → `toggleHold(loc)` clears hold
- Auto-unhold: `checkAutoUnhold()` runs on every board listener fire
- Warn at 25% remaining time (min 5 min) — amber color

## Summary Bar Features (coordinator display, right to left)
1. Break chips (Rooms Running, AM remaining, Lunch remaining, PM remaining) — filterable
2. 📞 On Call chip — opens panel with On Call Tonight + Post Call Today columns
3. 🕐 End Times chip — opens panel with concern time threshold + per-room end times

## On-Call Feature
- Call positions configured in admin (e.g. "First Call", "Second Call", "OB Call")
- Stored in `config/{code}/callPositions`
- Assignments in `boards/{code}/{date}/_call_/{positionIdx}`
- Post-call auto-populates at 6am from yesterday's `_call_` data
- `getProviderCallStatus(name)` returns "call", "postcall", or null
- 📞 prefix on provider name = on call tonight; 🌙 prefix = post call today

## End-of-Day Times Feature (coordinator display only)
- 🕐 End Times button right-aligned in summary bar (display only, not on phone)
- Room times stored in `boards/{code}/{date}/_eod_/{roomId}` as "HH:MM" 24h
- Concern threshold in `boards/{code}/{date}/_eodconcern_` as "HH:MM" 24h
- Green badge = before concern time; Red badge = after concern time; Grey = no concern time set
- `parseTime()` accepts "3:45", "345", "3:45p", "1545" etc.
- `formatTime()` formats "HH:MM" → "3:45p" for display

## Provider Notes
- Stored in `_hist_{nameKey}` as `note: { text, color }` (max 15 chars)
- Colors: amber, blue, green, rose
- Shown as colored badge on coordinator display cards
- Click badge to edit; blur saves (not just Enter)

## patchDisplay DOM Detection
- Uses `domNameBtn.textContent.replace(/^[📞🌙] ?/, "")` to strip call emoji before comparing provider names
- When card is being edited (input open): `domIsEditing = true`, uses sentinel `"__editing__"` to force rebuild
- No-break cards: always rebuild if provider changed (cheap, no break state)

## Admin Page
- Locations: drag to reorder, Edit (inline rename), Remove, Add, Add Section Divider
- No-Break Slots: drag to reorder, Edit, Remove, Add
- Call Positions: drag to reorder, Edit, Remove, Add
- Roster: drag to reorder (display only), Edit (delete+push rename), Remove, Add
- Clear Board: removes all providers but preserves `_hist_` keys
- Dept passcode change handled via Firebase Auth `updatePassword`
- Dept code rename: creates new Auth account, copies config+boards, deletes old

## Auth Token Refresh Guard
- Firebase fires `onAuthStateChanged` hourly for token refresh
- Guard: `if (session && session.deptCode === code && unsubBoard) return`
- Prevents full re-initialization on token refresh

## Common Patterns
```javascript
// Write to board
await writeRoom(roomId, r => ({ ...r, someField: value }));

// Optimistic update before Firebase write
boardData[roomId(loc)] = { ...boardData[roomId(loc)], provider: null };
if (isDisplayMode && document.querySelector(".display-outer")) patchDisplay();
await clearProvider(loc);

// DOM helper
el("div", { class: "foo", onClick: handler }, "text", childEl)

// Config save pattern
async function saveSomething(items) {
  const obj = {}; items.forEach((x, i) => { obj[i] = x; });
  await set(ref(db, `config/${session.deptCode}/something`), obj);
}
```

## What NOT to Do
- Never add `overflow: hidden` back to `.call-panel` — dropdowns need to escape it
- Never store operational daily values (eodConcernTime, call assignments) in `config/` — dept users can't write there
- Never call `renderDisplay()` for non-structural config changes — use `patchDisplay()` to avoid jitter
- Never use `renderBoard()` from the display mode path
- The phone board does NOT show: EOD times button, note badges, call/post-call panel (these are display-only)

## Current To-Do List
*(no open items)*
