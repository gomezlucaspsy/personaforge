// Shared shapes for the "mecha" loop (sense → interpret → decide → execute).
// The repo is plain JS, so these are JSDoc typedefs plus small runtime
// normalizers — the API routes and the browser both get validated objects.

/**
 * @typedef {Object} WifiNetwork
 * @property {string} ssid
 * @property {string} bssid
 * @property {number} rssi          dBm, e.g. -62
 * @property {number} [channel]
 * @property {number} [frequency]   MHz
 * @property {string} [vendor]
 * @property {boolean} [hidden]
 */

/**
 * @typedef {Object} BLEDevice
 * @property {string} address
 * @property {string} name
 * @property {number} rssi
 * @property {string} [vendor]
 * @property {string[]} [signatures]  Fieldwatch "fleets" / signature names
 * @property {boolean} [randomized]
 */

/**
 * @typedef {Object} SpectrumScan
 * @property {string} timestamp      ISO string
 * @property {WifiNetwork[]} wifi
 * @property {BLEDevice[]} ble
 * @property {string} [source]       "fieldwatch" | "stub" | "manual" …
 */

/**
 * @typedef {"calm"|"curious"|"alert"|"anxious"|"overwhelmed"|"lonely"} EmotionalState
 */

/**
 * @typedef {Object} Perception
 * @property {string} raw_text
 * @property {EmotionalState} emotional_state
 * @property {string[]} patterns
 * @property {number} confidence     0..1
 */

/**
 * @typedef {{type:"vibrate", pattern:number[]}
 *   | {type:"led", intensity:number}
 *   | {type:"sound", freq:number, duration:number}
 *   | {type:"log", message:string}} HardwareAction
 */

/**
 * @typedef {Object} CycleRecord
 * @property {string} at
 * @property {number} wifiCount
 * @property {number} bleCount
 * @property {EmotionalState} mood
 * @property {string[]} patterns
 * @property {number} confidence
 * @property {HardwareAction[]} actions
 */

/**
 * @typedef {Object} InternalState
 * @property {CycleRecord[]} history   newest first, capped
 * @property {EmotionalState} mood
 * @property {SpectrumScan|null} last_spectrum
 * @property {Perception|null} last_perception
 */

export const EMOTIONAL_STATES = ["calm", "curious", "alert", "anxious", "overwhelmed", "lonely"];

export const MAX_WIFI = 60;
export const MAX_BLE = 80;

const num = (v, fallback) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const str = (v, max = 120) => (typeof v === "string" ? v.slice(0, max) : v == null ? "" : String(v).slice(0, max));

/** @returns {InternalState} */
export const emptyState = () => ({ history: [], mood: "calm", last_spectrum: null, last_perception: null });

/**
 * Validates and trims an untrusted SpectrumScan (from HTTP or a parsed file).
 * Returns null if it doesn't even have wifi/ble arrays.
 * @returns {SpectrumScan|null}
 */
export const normalizeSpectrum = (input) => {
  if (!input || typeof input !== "object") return null;
  if (!Array.isArray(input.wifi) || !Array.isArray(input.ble)) return null;
  const wifi = input.wifi
    .filter((w) => w && typeof w === "object")
    .slice(0, MAX_WIFI)
    .map((w) => ({
      ssid: str(w.ssid, 64),
      bssid: str(w.bssid, 32),
      rssi: num(w.rssi, -100),
      ...(w.channel != null && { channel: num(w.channel, 0) }),
      ...(w.frequency != null && { frequency: num(w.frequency, 0) }),
      ...(w.vendor && { vendor: str(w.vendor, 60) }),
      ...(w.hidden != null && { hidden: Boolean(w.hidden) }),
    }));
  const ble = input.ble
    .filter((b) => b && typeof b === "object")
    .slice(0, MAX_BLE)
    .map((b) => ({
      address: str(b.address, 32),
      name: str(b.name, 64),
      rssi: num(b.rssi, -100),
      ...(b.vendor && { vendor: str(b.vendor, 60) }),
      ...(Array.isArray(b.signatures) && b.signatures.length && { signatures: b.signatures.slice(0, 6).map((s) => str(s, 40)) }),
      ...(b.randomized != null && { randomized: Boolean(b.randomized) }),
    }));
  const ts = new Date(input.timestamp || Date.now());
  return {
    timestamp: Number.isNaN(ts.getTime()) ? new Date().toISOString() : ts.toISOString(),
    wifi,
    ble,
    source: str(input.source || "manual", 24),
  };
};
