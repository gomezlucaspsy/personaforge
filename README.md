# Persona Chat (Next.js)

This project is your archived `persona-chat.jsx` migrated to a Next.js app so it can be deployed on Vercel from GitHub.

## 1) Install and run locally

```bash
npm install
```

Create `.env.local`:

```bash
ANTHROPIC_API_KEY=your_anthropic_api_key_here
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

Start dev server:

```bash
npm run dev
```

Open `http://localhost:3000`.

## 2) Deploy with GitHub + Vercel

1. Push this folder to a GitHub repository.
2. In Vercel, import that GitHub repo.
3. Add environment variables in Vercel Project Settings:
   - `ANTHROPIC_API_KEY`
   - `ANTHROPIC_MODEL` (optional, defaults to `claude-haiku-4-5`)
4. Deploy.

## Notes

- The client now calls `POST /api/chat`.
- Anthropic API key is server-side only (safe for Vercel hosting).

## 3) Automatic updates from `updates/`

Upload `updates/updates.txt` or `updates/updates.pdf` (downloaded from a persona's MyComputer)
and push to `main`. The workflow `.github/workflows/updates-to-pr.yml` then:

1. diffs `updates/` to find the new requests,
2. runs Claude Code to implement them, build-check, and tick them `[x]` in the request file,
3. opens a `[updates-bot]` PR, which CodeRabbit reviews automatically,
4. waits for you to merge it manually — merging deploys to Vercel.

Setup (once): add `ANTHROPIC_API_KEY` under GitHub → Settings → Secrets and variables → Actions,
and under Settings → Actions → General enable "Allow GitHub Actions to create and approve pull requests".
You can also run it manually from the Actions tab (it then picks up to 3 open `[ ]` items).

## 4) Running the Mecha (`/spectrum`)

A small "domestic mecha": the phone listens to the radios around it through
[Fieldwatch](https://github.com/OffGridPete/Fieldwatch), Claude interprets the snapshot, and the
phone reacts with vibration, a screen glow ("LED") and a tone. Full design in
[`MECHA_ARCHITECTURE.md`](MECHA_ARCHITECTURE.md).

```
 Fieldwatch (Android)          PersonaForge                          body
 ───────────────────           ───────────────────────────────       ─────────────────
 log / sit export  ──file──▶   fieldwatch-parser → SpectrumScan
                                        │
                     /spectrum page  or scripts/spectrum-poller.mjs
                                        │ POST /api/sense
                                        ▼
                               consciousness.interpret (Claude)
                               consciousness.decide  ──actions──▶   HardwareController
                                        │                           (browser: vibrate/glow/beep,
                               state per device (Redis/memory)       stub: console, later Termux/ESP32)
                                        ▲
                               GET /api/state (polled every 2s)
```

**Core vs UI.** `lib/core/` and `lib/hardware/` are plain JS with no React/Next imports — the same
`ElectromagneticConsciousness` class runs in the browser, in an API route and in Node/Termux.
The UI (`app/spectrum/page.jsx` + `components/SpectrumViewer|PerceptionDisplay|ControlPanel.jsx`)
only drives it and renders state.

**Fieldwatch exports.** In Fieldwatch use *Share log* (CSV or JSONL) or a sit export, then either:
- open `/spectrum` → *Load Fieldwatch export* → *Run One Cycle* / *Start Loop*, or
- attach the file in the chat — it's condensed to the latest snapshot before the persona sees it, or
- run the poller where the files land (it only calls the API when the newest file changes):
  ```bash
  FIELDWATCH_EXPORT_PATH=/sdcard/Download/fieldwatch MECHA_DEVICE_ID=<id from /spectrum> \
  SENSE_URL=https://claude-gamma-virid.vercel.app/api/sense node scripts/spectrum-poller.mjs
  ```
  An open `/spectrum` tab with the same device id reacts to the poller's cycles too.

**Testing without radios.** *Stub scan* (and an empty scan) uses `StubHardwareController`: three
fake APs and three BLE devices with RSSI jitter; its actuators just log.

**Android roadmap.** 1) today: Fieldwatch export → poller/PWA. 2) Termux + Node 22+ on the phone
running the poller next to Fieldwatch's export folder. 3) a `TermuxHardwareController`
(`termux-vibrate`, `termux-torch`, `termux-wifi-scaninfo`) so the loop can sense without Fieldwatch.
4) an ESP32/Raspberry Pi controller with real LEDs/servos — same interface.

## 5) Native Share bridge

[Native](https://github.com/gomezlucaspsy/Native) uses the same flat `{ "/path": { type, content } }`
file map as MyComputer. In MyComputer, **→ Native** uploads the open file to Native's QuickShare
(link + QR), and **Native** lists QuickShare files and imports one into the current folder. The
calls go through `app/api/native/route.js` because Native's API has no CORS; set `NATIVE_URL` to
point at a different Native deployment.
