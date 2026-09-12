import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.js";

// Lazily instantiate Redis only when env vars are present.
// Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN in your Vercel project
// (Storage → Upstash Redis → Connect, then "Pull env vars").
const getRedis = () => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const { Redis } = require("@upstash/redis");
    return new Redis({ url, token });
  } catch {
    return null;
  }
};

const MAX_MESSAGES = 300;
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30-day auto-delete for chat history

// charId alone isn't unique across browsers — the default character ships with a fixed,
// shared id, so without a per-visitor namespace every visitor would read/overwrite the same
// history. The client sends a random per-browser visitorId (see getVisitorId in
// PersonaChat.jsx) that gets folded into the key. Reject requests missing either id rather
// than falling back to a shared bucket.
const historyKey = (visitorId, charId) => `history:${visitorId}:${charId}`;

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const charId = searchParams.get("charId");
  const visitorId = searchParams.get("visitorId");
  if (!charId || !visitorId) return NextResponse.json({ messages: [] });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ messages: [], error: "DB not configured" });

  try {
    const data = await redis.get(historyKey(visitorId, charId));
    const messages = Array.isArray(data) ? data : [];
    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}

export async function POST(req) {
  const ip = getClientIp(req);
  const { allowed, retryAfter } = await checkRateLimit("history", ip, { limit: 60, windowSeconds: 60 });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests, slow down." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { charId, visitorId, messages } = body;
  if (!charId || !visitorId || !Array.isArray(messages)) {
    return NextResponse.json({ error: "Missing charId, visitorId, or messages" }, { status: 400 });
  }

  const redis = getRedis();
  if (!redis) return NextResponse.json({ ok: false, error: "DB not configured" });

  try {
    const trimmed = messages.slice(-MAX_MESSAGES);
    await redis.set(historyKey(visitorId, charId), trimmed, { ex: TTL_SECONDS });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

export async function DELETE(req) {
  const { searchParams } = new URL(req.url);
  const charId = searchParams.get("charId");
  const visitorId = searchParams.get("visitorId");
  if (!charId || !visitorId) return NextResponse.json({ error: "Missing charId or visitorId" }, { status: 400 });

  const redis = getRedis();
  if (!redis) return NextResponse.json({ ok: false, error: "DB not configured" });

  try {
    await redis.del(historyKey(visitorId, charId));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
