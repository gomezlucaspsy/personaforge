import { NextResponse } from "next/server";
import { call } from "@/lib/api/anthropic.js";
import { getAnthropicConfig } from "@/lib/anthropic-config.js";
import { ElectromagneticConsciousness } from "@/lib/core/consciousness.js";
import { DEVICE_ID_RE, loadState, saveState } from "@/lib/core/state-store.js";
import { normalizeSpectrum } from "@/lib/core/types.js";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.js";

// The server only interprets: it has no radios and no body. The caller (the
// /spectrum page or scripts/spectrum-poller.mjs) sends a SpectrumScan and runs
// the returned actions on its own hardware.
const noHardware = {
  scanWiFi: async () => [],
  scanBLE: async () => [],
  vibrate: async () => {},
  setLED: async () => {},
  playSound: async () => {},
};

export async function POST(request) {
  if (!getAnthropicConfig()) {
    return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
  }
  const ip = getClientIp(request);
  const { allowed, retryAfter } = await checkRateLimit("sense", ip, { limit: 30, windowSeconds: 60 });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests, slow down." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const deviceId = body?.deviceId;
  if (typeof deviceId !== "string" || !DEVICE_ID_RE.test(deviceId)) {
    return NextResponse.json({ error: "deviceId required (8-64 chars, A-Z a-z 0-9 _ -)" }, { status: 400 });
  }
  const spectrum = normalizeSpectrum(body?.spectrum);
  if (!spectrum) {
    return NextResponse.json({ error: "spectrum must have wifi and ble arrays" }, { status: 400 });
  }

  try {
    const mind = new ElectromagneticConsciousness({ hardware: noHardware, interpreter: call, log: () => {} });
    mind.setState(await loadState(deviceId));
    const perception = await mind.interpret(spectrum);
    const actions = mind.decide(perception);
    mind.remember(spectrum, perception, actions);
    await saveState(deviceId, mind.getState());
    return NextResponse.json({ perception, actions, state: mind.getState() });
  } catch (error) {
    console.error("[sense]", error);
    return NextResponse.json({ error: "Interpretation failed" }, { status: 502 });
  }
}
