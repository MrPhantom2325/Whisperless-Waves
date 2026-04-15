# ⚓ Whisperless Waves
### *The Blind Captain & The Mute Navigator*

> A two-player cooperative browser game where one player sees the map and the other controls the ship — and neither can do anything alone.

---

## What is this?

Whisperless Waves is a **local co-op communication game** built entirely in a single React component with no external game engine. Two players sit at the same keyboard (or on a call) and must navigate a ship across 6 increasingly brutal stages to reach a hidden treasure island.

**The twist:** the screen is split down the middle.

- The **Captain** (left side) sees the full map — reefs, currents, landmarks, the destination. They cannot touch the ship.
- The **Navigator** (right side) controls the helm, sails, and anchor. They cannot see the map.

They have to talk. That's the game.

---

## Gameplay

### Controls

| Player | Keys | Action |
|---|---|---|
| Captain | `W A S D` | Move map cursor |
| Captain | `Space` | Ping a cell (yellow flash) |
| Navigator | `← →` | Steer heading (15° per press) |
| Navigator | `↑ ↓` | Raise / lower sails |
| Navigator | `Q` | Drop / raise anchor |

### The 6 Stages

| Stage | Name | What changes |
|---|---|---|
| 1 | Open Waters | Full visibility, gentle wind. Learn to communicate. |
| 2 | The Reef Maze | Extra reef density. One wrong word sinks you. |
| 3 | The Storm | Map blurs, controls lag 300ms, random storm damage, rain + thunder. |
| 4 | The Fog Bank | Captain's visibility drops to a 2-tile radius. Precise descriptions only. |
| 5 | The Siren Rocks | Two decoy islands look identical to the destination. Trust the landmarks. |
| 6 | The Blackout | Both screens go dark after 10 seconds. Navigate from memory alone. |

### The Finale

After Stage 6, neither player gets a puzzle or a prompt. They each have a single button. The vault opens only when **both press simultaneously** — no countdown, no hint. They just have to feel ready together.

---

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **UI:** React 19 — zero component libraries, zero CSS files, all inline styles
- **Audio:** Web Audio API — entirely procedural, no audio files needed
- **Visuals:** Canvas API (rain), CSS animations (fog, lightning, pings, shake)
- **Dependencies:** `next`, `react`, `react-dom` — that's it

---

## Getting Started

**Prerequisites:** Node.js 18+

```bash
# 1. Clone the repo
git clone https://github.com/your-username/whisperless-waves.git
cd whisperless-waves

# 2. Install dependencies
npm install

# 3. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The active game file is `BlindCaptain_Phase5.jsx`, imported in `app/page.js`.

---

## Project Structure

```
whisperless-waves/
├── app/
│   ├── layout.js           # Root layout (Next.js App Router)
│   ├── page.js             # Entry point — imports the active phase
│   └── globals.css         # Minimal global reset
├── BlindCaptain_Phase1.jsx  # Split screen foundation
├── BlindCaptain_Phase2.jsx  # Keyboard input & ship movement logic
├── BlindCaptain_Phase3.jsx  # 6 voyage stages with fog, storm, memory mode
├── BlindCaptain_Phase4.jsx  # Trust mechanic & vault finale
├── BlindCaptain_Phase5.jsx  # ✅ FINAL — Polish: sound, rain, screen shake
└── package.json
```

Each phase file is self-contained and fully playable. To run an earlier phase, change the import in `app/page.js`:

```js
// app/page.js
import BlindCaptainGame from "@/BlindCaptain_Phase4"; // swap phase number here
```

---

## Deploy to Vercel

The fastest way to get this live:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new)

Or from the CLI:

```bash
npm install -g vercel
vercel
```

No environment variables required. No database. No config. It just works.

---

## How to Play with Someone Remote

Since both players share one keyboard in the default setup, remote play requires a small workaround:

1. **Screen share** the browser tab with your partner
2. One player keeps focus on the window and handles their keys
3. Use voice chat (Discord, phone call, etc.) — that's the whole point

Alternatively, you can fork the repo and split controls across a network layer (WebSocket, WebRTC) — the shared `ship` state object is designed to make this straightforward.

---

## Audio

All sound is generated procedurally via the **Web Audio API** — no `.mp3` or `.ogg` files anywhere in the repo.

| Sound | Trigger |
|---|---|
| Ocean waves | Looping ambient from game start |
| Storm intensification | Stage 3 active |
| Rain | Stage 3 — high-pass noise layer |
| Thunder | Stage 3 — random every 6–14 seconds |
| Hull creak | Random while ship is moving |
| Collision impact | Reef hit or decoy island |
| Sail / anchor sounds | On each Navigator action |
| Vault chord | Both trust buttons pressed simultaneously |

A **mute button** sits in the top-right corner of the game screen.

---

## Customisation

Everything is in one file. The main things you'd want to change:

**Map layout** — edit the arrays in `buildMap()`:
```js
const base = {
  reefs:    [[1,3],[2,5],[4,2], ...],
  islands:  [[3,8],[9,2],[6,5]],
  currents: [[2,7],[3,4],[7,8],[10,7]],
  dest:     [9, 9],
};
```

**Stage parameters** — tweak the `STAGES` array:
```js
{
  id: 3, name: "The Storm",
  mapBlur: 3,       // px blur on captain's chart
  controlLag: 300,  // ms delay on navigator inputs
  stormActive: true,
  fogRadius: null,  // null = full visibility
  ...
}
```

**Ship speed** — edit the tick intervals derived from sail percentage:
```js
const sp = ship.sails < 25 ? 0 : ship.sails < 50 ? 1 : ship.sails < 80 ? 2 : 3;
```

**Grid size** — change `GRID_SIZE = 12` and the cell pixel size `CELL = 44` in `CaptainPanel`.

---

## Contributing

Issues and PRs are welcome. A few ideas if you want to extend this:

- **Network multiplayer** — split the keyboard controls across WebSocket clients so players can be on separate machines
- **Mobile support** — on-screen button overlays for touch devices
- **Stage editor** — a visual tool to design custom maps and export them as stage configs
- **More stages** — the stage system is data-driven; adding a 7th stage is just adding an object to the `STAGES` array and a case in `buildMap()`
- **Accessibility** — screen-reader announcements for map cell descriptions when the Captain pings

---

## License

MIT — do whatever you want with it. If you build something cool on top of it, a mention would be appreciated.

---

*Built in 5 phases over a weekend. The split-screen idea came first. Everything else followed.*
