/**
 * Fixed-window rate limiter backed by the same Upstash Redis instance already
 * used for chat history / MyComputer storage. Fails open (allows the request)
 * when Redis isn't configured or unreachable — this guards an anonymous
 * single-user hobby app against runaway/abusive traffic, not an outage.
 */

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

export const getClientIp = (request) => {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
};

/**
 * @param {string} bucket - endpoint identifier, e.g. "chat"
 * @param {string} ip
 * @param {{ limit: number, windowSeconds: number }} options
 * @returns {Promise<{ allowed: boolean, retryAfter: number }>}
 */
export const checkRateLimit = async (bucket, ip, { limit, windowSeconds }) => {
  const redis = getRedis();
  if (!redis) return { allowed: true, retryAfter: 0 };

  try {
    const windowId = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `ratelimit:${bucket}:${ip}:${windowId}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    if (count > limit) {
      return { allowed: false, retryAfter: windowSeconds };
    }
    return { allowed: true, retryAfter: 0 };
  } catch {
    return { allowed: true, retryAfter: 0 };
  }
};
