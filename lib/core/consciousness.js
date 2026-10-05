// The mecha's control loop: sense → interpret → decide → execute.
// Pure JS, no React/Next imports — runs in the browser, in a Next route, or in
// plain Node/Termux. The two side-effecting edges are injected:
//   • hardware  — a HardwareController (stub, browser, or a real board bridge)
//   • interpreter — async (prompt) => reply text. Server-side that's
//     lib/api/anthropic.js; in the browser it's a fetch to /api/sense.

import { EMOTIONAL_STATES, emptyState, normalizeSpectrum } from "./types.js";
import { summarizeSpectrum } from "../utils/fieldwatch-parser.js";

export const HISTORY_SIZE = 10;

export const SYSTEM_PROMPT = `You are the perception layer of a small domestic "mecha": a phone that
passively listens to the Wi-Fi and Bluetooth LE radios around it (via the Fieldwatch app) and reacts
with vibration, light and sound. You read a radio snapshot and describe how the room "feels".
Signals are hypotheses, never identities: don't claim to know who someone is, and don't present a
device as a tracker or threat unless the data really suggests it (e.g. a Fieldwatch signature name).
Reply with ONLY a JSON object, no prose, no code fence:
{"raw_text": "<1-3 sentences, first person, what you sense>",
 "emotional_state": "<one of: ${EMOTIONAL_STATES.join(", ")}>",
 "patterns": ["<short tag>", ...],
 "confidence": <0..1>}`;

/** @param {import("./types.js").SpectrumScan} spectrum @param {import("./types.js").CycleRecord[]} history */
export const buildPrompt = (spectrum, history = []) => {
  const recent = history.slice(0, 5).map((h) =>
    `- ${h.at}: ${h.wifiCount} Wi-Fi, ${h.bleCount} BLE → ${h.mood} (${h.patterns.join(", ") || "no patterns"})`);
  return [
    "=== CURRENT SPECTRUM ===",
    summarizeSpectrum(spectrum),
    "",
    "=== RECENT CYCLES (newest first) ===",
    recent.length ? recent.join("\n") : "(first cycle)",
    "",
    "Compare with the recent cycles: what arrived, left, got closer (stronger RSSI)? Reply with the JSON object only.",
  ].join("\n");
};

/** Tolerant JSON extraction — models sometimes wrap it in prose or a fence. */
export const parsePerception = (text) => {
  const fallback = { raw_text: String(text || "").slice(0, 400), emotional_state: "curious", patterns: [], confidence: 0.2 };
  const match = String(text || "").match(/\{[\s\S]*\}/);
  if (!match) return fallback;
  try {
    const obj = JSON.parse(match[0]);
    const confidence = Number(obj.confidence);
    return {
      raw_text: String(obj.raw_text || "").slice(0, 600),
      emotional_state: EMOTIONAL_STATES.includes(obj.emotional_state) ? obj.emotional_state : "curious",
      patterns: Array.isArray(obj.patterns) ? obj.patterns.slice(0, 8).map((p) => String(p).slice(0, 40)) : [],
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    };
  } catch {
    return fallback;
  }
};

// Emotion → body language. Kept deterministic so the same perception always
// produces the same reaction (and so it can run without an API call).
const REACTIONS = {
  calm:        { vibrate: null,                   led: 0.15, sound: null },
  curious:     { vibrate: [40, 80, 40],           led: 0.4,  sound: { freq: 660, duration: 120 } },
  alert:       { vibrate: [120, 60, 120],         led: 0.8,  sound: { freq: 880, duration: 200 } },
  anxious:     { vibrate: [60, 40, 60, 40, 60],   led: 0.9,  sound: { freq: 440, duration: 300 } },
  overwhelmed: { vibrate: [300],                  led: 1,    sound: { freq: 220, duration: 400 } },
  lonely:      { vibrate: [30],                   led: 0.05, sound: { freq: 330, duration: 150 } },
};

/** @returns {import("./types.js").HardwareAction[]} */
export const decide = (perception) => {
  const r = REACTIONS[perception.emotional_state] || REACTIONS.curious;
  // Low confidence → dimmer, quieter: don't make a fuss about a guess.
  const scale = 0.4 + 0.6 * perception.confidence;
  const actions = [{ type: "log", message: `${perception.emotional_state}: ${perception.raw_text}` }];
  actions.push({ type: "led", intensity: Number((r.led * scale).toFixed(2)) });
  if (r.vibrate && perception.confidence >= 0.3) actions.push({ type: "vibrate", pattern: r.vibrate });
  if (r.sound && perception.confidence >= 0.5) actions.push({ type: "sound", ...r.sound });
  return actions;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class ElectromagneticConsciousness {
  /**
   * @param {{ hardware: import("../hardware/types.js").HardwareController,
   *           interpreter: (prompt: string, opts: {system: string}) => Promise<string>,
   *           log?: (msg: string) => void }} deps
   */
  constructor({ hardware, interpreter, log = console.log }) {
    this.hardware = hardware;
    this.interpreter = interpreter;
    this.log = log;
    this.state = emptyState();
    this.running = false;
  }

  async sense() {
    const [wifi, ble] = await Promise.all([this.hardware.scanWiFi(), this.hardware.scanBLE()]);
    return normalizeSpectrum({ timestamp: new Date().toISOString(), wifi, ble, source: "hardware" });
  }

  async interpret(spectrum) {
    const reply = await this.interpreter(buildPrompt(spectrum, this.state.history), { system: SYSTEM_PROMPT });
    return parsePerception(reply);
  }

  decide(perception) {
    return decide(perception);
  }

  async execute(actions) {
    for (const action of actions) {
      if (action.type === "vibrate") await this.hardware.vibrate(action.pattern);
      else if (action.type === "led") await this.hardware.setLED(action.intensity);
      else if (action.type === "sound") await this.hardware.playSound(action.freq, action.duration);
      else if (action.type === "log") this.log(`[mecha] ${action.message}`);
    }
  }

  /** Records a finished cycle — also used by /api/sense, which interprets without sensing. */
  remember(spectrum, perception, actions) {
    this.state = {
      mood: perception.emotional_state,
      last_spectrum: spectrum,
      last_perception: perception,
      history: [
        {
          at: new Date().toISOString(),
          wifiCount: spectrum.wifi.length,
          bleCount: spectrum.ble.length,
          mood: perception.emotional_state,
          patterns: perception.patterns,
          confidence: perception.confidence,
          actions,
        },
        ...this.state.history,
      ].slice(0, HISTORY_SIZE),
    };
  }

  async cycle(spectrum) {
    const scan = spectrum || (await this.sense());
    const perception = await this.interpret(scan);
    const actions = this.decide(perception);
    await this.execute(actions);
    this.remember(scan, perception, actions);
    return { spectrum: scan, perception, actions };
  }

  /** Loops until stop(). A failed cycle is logged and the loop keeps going. */
  async run(intervalMs = 5000) {
    if (this.running) return;
    this.running = true;
    while (this.running) {
      try {
        await this.cycle();
      } catch (error) {
        this.log(`[mecha] cycle failed: ${error?.message || error}`);
      }
      if (this.running) await sleep(intervalMs);
    }
  }

  stop() {
    this.running = false;
  }

  getState() {
    return this.state;
  }

  setState(state) {
    if (state && Array.isArray(state.history)) this.state = state;
  }
}
