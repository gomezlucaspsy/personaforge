import { emptyState } from "./types.js";

// Per-device mecha state. Serverless instances don't share memory, so this
// uses the same Upstash Redis as chat history when configured and falls back
// to an in-process Map (fine for `next dev` / Termux, best-effort on Vercel).
// Keyed by a random per-device id so one visitor never sees another's radios.

const TTL_SECONDS = 60 * 60 * 24 * 7;
const memory = globalThis.__mechaState ?? (globalThis.__mechaState = new Map());

export const DEVICE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

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

const key = (deviceId) => `mecha:${deviceId}`;

export const loadState = async (deviceId) => {
  const redis = getRedis();
  if (redis) {
    try {
      const data = await redis.get(key(deviceId));
      if (data && Array.isArray(data.history)) return data;
    } catch {}
  }
  return memory.get(deviceId) || emptyState();
};

export const saveState = async (deviceId, state) => {
  memory.set(deviceId, state);
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key(deviceId), state, { ex: TTL_SECONDS });
  } catch {}
};
