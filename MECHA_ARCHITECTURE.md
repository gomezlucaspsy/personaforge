# Mecha architecture

The mecha is a loop of four stages. Each stage is a small, separately testable function on
`ElectromagneticConsciousness` (`lib/core/consciousness.js`):

```
          ┌──────────┐   SpectrumScan   ┌─────────────┐  Perception  ┌──────────┐  HardwareAction[]  ┌───────────┐
 radios ─▶│  sense   │ ───────────────▶ │  interpret  │ ───────────▶ │  decide  │ ─────────────────▶ │  execute  │─▶ body
          └──────────┘                  └─────────────┘              └──────────┘                    └───────────┘
          hardware.scanWiFi/BLE         Claude (injected)            pure function                   hardware.vibrate/
          or a Fieldwatch export        + last 5 cycles              emotion → actions               setLED/playSound
                                                   ▲                                                       │
                                                   └──────────────── remember() → history (10) ◀───────────┘
```

| Stage | Input → output | Side effects | Where it runs |
|---|---|---|---|
| sense | – → `SpectrumScan` | reads radios | hardware controller; on the web it's whatever Fieldwatch export was loaded |
| interpret | `SpectrumScan` + history → `Perception` | 1 Claude call | server (`/api/sense`), API key never leaves it |
| decide | `Perception` → `HardwareAction[]` | none (deterministic) | anywhere |
| execute | `HardwareAction[]` → – | vibrate, glow, beep, log | the device holding the body (phone PWA, stub, later Termux/ESP32) |

## Types (`lib/core/types.js`)

The repo is plain JS, so these are JSDoc typedefs plus `normalizeSpectrum()`, which validates and
caps every scan that crosses an HTTP boundary (60 APs, 80 BLE devices, trimmed strings).

```js
/** SpectrumScan */   { timestamp, source, wifi: [{ ssid, bssid, rssi, channel?, frequency?, vendor?, hidden? }],
                                           ble:  [{ address, name, rssi, vendor?, signatures?, randomized? }] }
/** Perception */     { raw_text, emotional_state, patterns: string[], confidence /* 0..1 */ }
/** HardwareAction */ { type: "vibrate", pattern } | { type: "led", intensity } | { type: "sound", freq, duration } | { type: "log", message }
/** InternalState */  { history: CycleRecord[] /* newest first, max 10 */, mood, last_spectrum, last_perception }
```

`emotional_state` is one of `calm | curious | alert | anxious | overwhelmed | lonely`.

## Hardware abstraction (`lib/hardware/`)

Anything with these five async methods is a body:

```js
{ scanWiFi(), scanBLE(), vibrate(pattern), setLED(intensity), playSound(freq, durationMs) }
```

- `StubHardwareController` — canned scans with RSSI jitter, actuators log to the console.
- `BrowserHardwareController` — `navigator.vibrate`, a WebAudio oscillator, and an `onLED`
  callback the `/spectrum` page renders as a glowing dot. Browsers can't scan radios, so
  `scanWiFi/scanBLE` return the last scan given to `setSpectrum()`.
- Planned: Termux (`termux-vibrate`, `termux-torch`, `termux-wifi-scaninfo`) and ESP32/RPi.

```js
import { ElectromagneticConsciousness } from "./lib/core/consciousness.js";
import { StubHardwareController } from "./lib/hardware/stub.js";

const mind = new ElectromagneticConsciousness({
  hardware: new StubHardwareController(),
  interpreter: async (prompt, { system }) => callClaudeSomehow(prompt, system),
});
await mind.cycle();   // sense → interpret → decide → execute → remember
mind.run(5000);       // loop until mind.stop(); a failed cycle is logged, the loop continues
```

The interpreter is injected so the class never needs the API key: `/api/sense` passes
`lib/api/anthropic.js#call` (Anthropic SDK, `ANTHROPIC_MODEL`, default `claude-haiku-4-5`).

## Interpretation contract

`SYSTEM_PROMPT` tells the model it is the perception layer of a passive listener, that radio
matches are hypotheses (never identities), and to reply with only a JSON `Perception`.
`buildPrompt()` sends a compact, top-N-by-signal text summary of the scan plus the last five cycles
so the model can talk about change (arrivals, departures, RSSI getting stronger).
`parsePerception()` is tolerant: it extracts the first `{…}` from the reply, clamps confidence,
and falls back to `curious / 0.2` on unparseable output instead of failing the cycle.

## Decide: emotion → body

Deterministic table, scaled by confidence so a guess doesn't cause a fuss:

| mood | vibrate (≥30% conf.) | LED base | sound (≥50% conf.) |
|---|---|---|---|
| calm | – | 0.15 | – |
| curious | 40-80-40 | 0.4 | 660 Hz 120 ms |
| alert | 120-60-120 | 0.8 | 880 Hz 200 ms |
| anxious | 60-40-60-40-60 | 0.9 | 440 Hz 300 ms |
| overwhelmed | 300 | 1.0 | 220 Hz 400 ms |
| lonely | 30 | 0.05 | 330 Hz 150 ms |

LED intensity = base × (0.4 + 0.6 × confidence).

## Fieldwatch integration (`lib/utils/fieldwatch-parser.js`)

Fieldwatch is passive and offline; it has no API, only exports. We accept:

| Export | Recognized by |
|---|---|
| rotating log CSV | header `timestamp,iso,kind,mac,name,rssi,channel,freq,oui,vendor,fleets,…` |
| rotating log JSONL (its native on-disk format) | lines with `"kind":"WIFI"/"BLE"`, `"mac"`, `"rssi"`, `"ts"` |
| sit export CSV/JSONL | header `kind,mac,name,custom_name,…,frequency_mhz,…,last_seen,…,signatures` |

A log contains every sighting over time, so `sightingsToSpectrum()` keeps only the last 60 s
before the newest timestamp and dedupes by MAC (latest sighting wins), sorted by signal.
Fieldwatch signature/fleet names (e.g. `Apple Find My+AirTag`) become `ble[].signatures`.
Coordinates (`lat/lon`) are intentionally dropped — the mecha doesn't need where you were.

Three ways in: the `/spectrum` file picker, a chat attachment (condensed to the snapshot text by
`summarizeSpectrum()`), or `scripts/spectrum-poller.mjs`, which watches `FIELDWATCH_EXPORT_PATH` and
POSTs the newest export to `/api/sense` whenever it changes.

## State

`/api/sense` and `/api/state` key state by a random per-browser id (`pf_visitor_id`, shared with
the chat), stored in Upstash Redis when configured (7-day TTL) and an in-process Map otherwise.
The `/spectrum` page polls `/api/state` every 2 s; when a new cycle shows up that it didn't run
itself (e.g. from the poller), it executes that cycle's actions on the phone.

## Logic flow, assembly-style

The loop is deliberately simple enough to read as a register machine:

```
LOOP:   CALL  sense            ; R0 ← SpectrumScan          (I/O: radios / file)
        CALL  interpret, R0    ; R1 ← Perception            (I/O: one Claude call)
        CALL  decide, R1       ; R2 ← HardwareAction[]      (pure)
        CALL  execute, R2      ;                            (I/O: actuators, sequential)
        PUSH  history, {R0,R1,R2} ; keep 10
        JZ    running, HALT
        SLEEP intervalMs       ; measured from the end of the cycle, so slow calls never overlap
        JMP   LOOP
HALT:   RET
```

Only `decide` is pure; the three I/O stages sit behind injected interfaces, which is what makes
the same loop run on a stub, a phone, or a board.
