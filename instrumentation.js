// Runs once per cold start, before any request is handled. Fails loud in the server log if
// a required secret is missing so a misconfigured deploy shows up immediately instead of as
// a wall of per-request 500s from getAnthropicConfig(). Never logs the key itself.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { readFileSync } = await import("fs");
  try {
    const envLocal = readFileSync(process.cwd() + "/.env.local", "utf8");
    for (const line of envLocal.split("\n")) {
      const match = line.match(/^([^#=]+)=(.+)$/);
      if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
    }
  } catch {}

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "[startup] ANTHROPIC_API_KEY is not set — /api/chat and /api/character-build will return 500 until it's configured."
    );
  }
}
