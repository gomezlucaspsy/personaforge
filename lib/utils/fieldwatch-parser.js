// Turns Fieldwatch exports (https://github.com/OffGridPete/Fieldwatch) into a
// SpectrumScan. Fieldwatch writes three shapes we accept:
//   • rotating log CSV   — header "timestamp,iso,kind,mac,name,rssi,channel,freq,oui,vendor,fleets,…"
//   • rotating log JSONL — one {"ts","kind","mac","name","rssi","freq","vendor","fleets",…} per line
//   • sit export CSV/JSONL — header "kind,mac,name,custom_name,…,frequency_mhz,…,last_seen,…,signatures,…"
// A log holds every sighting over time, so we keep only the most recent window
// and dedupe by MAC (latest sighting wins) to get one "snapshot" of the room.

// Relative import (not "@/") so scripts/spectrum-poller.mjs can load this in plain Node.
import { normalizeSpectrum } from "../core/types.js";

export const DEFAULT_WINDOW_MS = 60_000;

const toMs = (v) => {
  if (v == null || v === "") return NaN;
  if (typeof v === "number") return v;
  if (/^\d{10,}$/.test(String(v))) return Number(v);
  return Date.parse(v);
};

const bool = (v) => v === true || v === "true" || v === "1";

// Maps one Fieldwatch row (log or sit, CSV or JSON, already keyed by column name) to a sighting.
const rowToSighting = (r) => {
  const kind = String(r.kind || "").toUpperCase();
  if (kind !== "WIFI" && kind !== "BLE") return null;
  const flags = String(r.flags || "");
  const signatures = String(r.fleets || r.signatures || "")
    .split(/[+;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    kind,
    mac: String(r.mac || "").toUpperCase(),
    name: String(r.custom_name || r.name || ""),
    rssi: Number(r.rssi),
    channel: r.channel != null && r.channel !== "" ? Number(r.channel) : undefined,
    freq: Number(r.freq ?? r.frequency_mhz) || undefined,
    vendor: r.vendor || undefined,
    signatures,
    randomized: bool(r.rand) || bool(r.randomized) || flags.includes("RAND"),
    hidden: bool(r.hidden) || flags.includes("HIDDEN"),
    ts: toMs(r.ts ?? r.timestamp ?? r.last_seen ?? r.iso),
  };
};

/** Folds sightings into a SpectrumScan: latest window only, one entry per MAC. */
export const sightingsToSpectrum = (sightings, { windowMs = DEFAULT_WINDOW_MS } = {}) => {
  const valid = sightings.filter((s) => s && s.mac && Number.isFinite(s.rssi));
  const latest = valid.reduce((max, s) => (Number.isFinite(s.ts) && s.ts > max ? s.ts : max), -Infinity);
  const cutoff = Number.isFinite(latest) ? latest - windowMs : -Infinity;
  const byMac = new Map();
  for (const s of valid) {
    if (Number.isFinite(s.ts) && s.ts < cutoff) continue;
    const prev = byMac.get(s.mac);
    if (!prev || (s.ts || 0) >= (prev.ts || 0)) byMac.set(s.mac, s);
  }
  const rows = [...byMac.values()].sort((a, b) => b.rssi - a.rssi);
  return normalizeSpectrum({
    timestamp: Number.isFinite(latest) ? new Date(latest).toISOString() : new Date().toISOString(),
    source: "fieldwatch",
    wifi: rows
      .filter((s) => s.kind === "WIFI")
      .map((s) => ({ ssid: s.name, bssid: s.mac, rssi: s.rssi, channel: s.channel, frequency: s.freq, vendor: s.vendor, hidden: s.hidden })),
    ble: rows
      .filter((s) => s.kind === "BLE")
      .map((s) => ({ address: s.mac, name: s.name, rssi: s.rssi, vendor: s.vendor, signatures: s.signatures, randomized: s.randomized })),
  });
};

// Minimal RFC-4180 line splitter: handles quoted cells ("a,b" and "" escapes).
const splitCsvLine = (line) => {
  const cells = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { cells.push(cur); cur = ""; }
    else cur += c;
  }
  cells.push(cur);
  return cells;
};

/** @returns {import("@/lib/core/types.js").SpectrumScan|null} */
export const parseFieldwatchCSV = (csvText, opts) => {
  const lines = String(csvText || "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return null;
  let header = null;
  const sightings = [];
  for (const line of lines) {
    // Exports can concatenate rotated parts, each with its own header row.
    if (/^(timestamp|kind),/.test(line)) {
      header = line.split(",").map((h) => h.trim());
      continue;
    }
    if (!header) continue;
    const cells = splitCsvLine(line);
    const row = Object.fromEntries(header.map((h, i) => [h, cells[i]]));
    sightings.push(rowToSighting(row));
  }
  return header ? sightingsToSpectrum(sightings, opts) : null;
};

/** Accepts JSONL (Fieldwatch's native log format), a JSON array, or an already-built SpectrumScan. */
export const parseFieldwatchJSON = (jsonText, opts) => {
  const text = String(jsonText || "").trim();
  if (!text) return null;
  if (text.startsWith("[") || (text.startsWith("{") && !text.includes("\n"))) {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed) && Array.isArray(parsed.wifi)) return normalizeSpectrum(parsed);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return sightingsToSpectrum(rows.map(rowToSighting), opts);
    } catch {
      // fall through to JSONL
    }
  }
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* skip a torn last line */ }
  }
  return rows.length ? sightingsToSpectrum(rows.map(rowToSighting), opts) : null;
};

/** Sniffs the format from filename/content. */
export const parseFieldwatch = (text, filename = "", opts) => {
  const trimmed = String(text || "").trimStart();
  if (/\.(jsonl?|ndjson)$/i.test(filename) || trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseFieldwatchJSON(text, opts);
  }
  return parseFieldwatchCSV(text, opts);
};

/** Cheap check used by the chat attachment path. */
export const looksLikeFieldwatch = (text) => {
  const head = String(text || "").slice(0, 400);
  return (
    /^timestamp,iso,kind,mac,/m.test(head) ||
    /^kind,mac,name,custom_name,/m.test(head) ||
    /"kind"\s*:\s*"(WIFI|BLE)"[\s\S]*"mac"/.test(head)
  );
};

/** Compact, model-friendly text version of a scan (top-N by signal). */
export const summarizeSpectrum = (scan, { maxWifi = 15, maxBle = 20 } = {}) => {
  if (!scan) return "(no spectrum)";
  const wifi = scan.wifi.slice(0, maxWifi).map((w) =>
    `  ${w.rssi}dBm  ${w.ssid || "<hidden>"}  ${w.bssid}${w.frequency ? `  ${w.frequency}MHz` : ""}${w.vendor ? `  [${w.vendor}]` : ""}`);
  const ble = scan.ble.slice(0, maxBle).map((b) =>
    `  ${b.rssi}dBm  ${b.name || "<unnamed>"}  ${b.address}${b.vendor ? `  [${b.vendor}]` : ""}${b.signatures?.length ? `  {${b.signatures.join(", ")}}` : ""}${b.randomized ? "  (random MAC)" : ""}`);
  return [
    `Spectrum @ ${scan.timestamp} (source: ${scan.source || "?"})`,
    `Wi-Fi APs: ${scan.wifi.length}${scan.wifi.length > maxWifi ? ` (top ${maxWifi} shown)` : ""}`,
    ...wifi,
    `BLE devices: ${scan.ble.length}${scan.ble.length > maxBle ? ` (top ${maxBle} shown)` : ""}`,
    ...ble,
  ].join("\n");
};
