import { readFileSync } from "fs";

// Force-read .env.local so a stale system env var cannot override it.
// Runs once per cold start; safe to call from every route that needs it.
let loaded = false;
const loadEnvLocal = () => {
  if (loaded) return;
  loaded = true;
  try {
    const envLocal = readFileSync(process.cwd() + "/.env.local", "utf8");
    for (const line of envLocal.split("\n")) {
      const m = line.match(/^([^#=]+)=(.+)$/);
      if (m) process.env[m[1].trim()] = m[2].trim();
    }
  } catch {}
};

const DEFAULT_MODEL = "claude-haiku-4-5";

/**
 * Returns { apiKey, model } once ANTHROPIC_API_KEY is confirmed present, or
 * null if it's missing so the caller can fail the request fast with a clear
 * error instead of sending an unauthenticated request to Anthropic.
 * Never logs the key itself.
 */
export const getAnthropicConfig = () => {
  loadEnvLocal();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  return { apiKey, model };
};
