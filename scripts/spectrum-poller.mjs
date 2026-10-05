#!/usr/bin/env node
// Watches a folder of Fieldwatch exports and feeds the newest one to /api/sense.
// Meant for Termux on the phone (Fieldwatch → Share log → save to that folder)
// or a PC that syncs the folder. Not an API route: Vercel has no access to your
// files, so this runs wherever the exports are.
//
//   FIELDWATCH_EXPORT_PATH=/sdcard/Download/fieldwatch \
//   MECHA_DEVICE_ID=<id shown at the bottom of /spectrum> \
//   SENSE_URL=https://claude-gamma-virid.vercel.app/api/sense \
//   node scripts/spectrum-poller.mjs
//
// Only re-sends when the newest file changes (mtime/size), so an idle folder
// costs no API calls. Pass --once to send one scan and exit.

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseFieldwatch } from "../lib/utils/fieldwatch-parser.js";

const dir = process.env.FIELDWATCH_EXPORT_PATH;
const deviceId = process.env.MECHA_DEVICE_ID;
const senseUrl = process.env.SENSE_URL || "http://localhost:3000/api/sense";
const intervalMs = Math.max(2000, Number(process.env.SPECTRUM_POLL_INTERVAL_MS) || 5000);
const once = process.argv.includes("--once");

if (!dir || !deviceId) {
  console.error("Set FIELDWATCH_EXPORT_PATH and MECHA_DEVICE_ID (see the header of this file).");
  process.exit(1);
}

const EXPORT_RE = /\.(csv|jsonl|json)$/i;
let lastKey = null;

const newestExport = async () => {
  const names = (await readdir(dir)).filter((n) => EXPORT_RE.test(n));
  const stats = await Promise.all(names.map(async (name) => ({ name, info: await stat(path.join(dir, name)) })));
  const files = stats.filter((s) => s.info.isFile()).sort((a, b) => b.info.mtimeMs - a.info.mtimeMs);
  return files[0] ? { name: files[0].name, mtimeMs: files[0].info.mtimeMs, size: files[0].info.size } : null;
};

const tick = async () => {
  const file = await newestExport();
  if (!file) return console.log(`[poller] no .csv/.jsonl in ${dir} yet`);
  const key = `${file.name}:${file.mtimeMs}:${file.size}`;
  if (key === lastKey) return;

  const spectrum = parseFieldwatch(await readFile(path.join(dir, file.name), "utf8"), file.name);
  if (!spectrum) {
    lastKey = key; // don't retry a file we can't parse until it changes
    return console.log(`[poller] ${file.name}: not a Fieldwatch export`);
  }
  const res = await fetch(senseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ deviceId, spectrum }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return console.error(`[poller] ${res.status} ${data.error || ""}`);
  lastKey = key;
  const p = data.perception;
  console.log(`[poller] ${file.name}: ${spectrum.wifi.length} Wi-Fi, ${spectrum.ble.length} BLE → ${p.emotional_state} (${Math.round(p.confidence * 100)}%) ${p.raw_text}`);
};

const loop = async () => {
  try {
    await tick();
  } catch (error) {
    console.error(`[poller] ${error.message}`);
  }
  if (!once) setTimeout(loop, intervalMs);
};

loop();
