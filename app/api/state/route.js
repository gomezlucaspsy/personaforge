import { NextResponse } from "next/server";
import { DEVICE_ID_RE, loadState } from "@/lib/core/state-store.js";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.js";

export const dynamic = "force-dynamic";

// GET /api/state?deviceId=… → InternalState { history, mood, last_spectrum, last_perception }
export async function GET(request) {
  // /spectrum polls every 2s (30/min); leave headroom for a second tab.
  const { allowed, retryAfter } = await checkRateLimit("state", getClientIp(request), { limit: 60, windowSeconds: 60 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
  }
  const deviceId = new URL(request.url).searchParams.get("deviceId");
  if (!deviceId || !DEVICE_ID_RE.test(deviceId)) {
    return NextResponse.json({ error: "deviceId required" }, { status: 400 });
  }
  const state = await loadState(deviceId);
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
