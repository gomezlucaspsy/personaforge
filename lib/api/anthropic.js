import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicConfig } from "@/lib/anthropic-config.js";

let client = null;
let clientKey = null;

/**
 * Thin wrapper around the Anthropic SDK: one prompt in, the reply text out.
 * Uses the same ANTHROPIC_API_KEY / ANTHROPIC_MODEL config as the chat route.
 * Throws an Error with a readable message; logs the call (never the key).
 */
export const call = async (prompt, { system, maxTokens = 1024 } = {}) => {
  const config = getAnthropicConfig();
  if (!config) throw new Error("Missing ANTHROPIC_API_KEY");
  if (!client || clientKey !== config.apiKey) {
    client = new Anthropic({ apiKey: config.apiKey });
    clientKey = config.apiKey;
  }

  const started = Date.now();
  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: maxTokens,
      ...(system && { system }),
      messages: [{ role: "user", content: prompt }],
    });
    console.log(`[anthropic] ${config.model} ${Date.now() - started}ms in=${response.usage?.input_tokens} out=${response.usage?.output_tokens} stop=${response.stop_reason}`);
    if (response.stop_reason === "refusal") throw new Error("Model declined this request");
    return response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new Error("Anthropic rate limit — try again shortly");
    if (error instanceof Anthropic.AuthenticationError) throw new Error("Invalid ANTHROPIC_API_KEY");
    if (error instanceof Anthropic.APIError) {
      console.error(`[anthropic] API error ${error.status}: ${error.message}`);
      throw new Error(`Anthropic API error ${error.status ?? ""}`.trim());
    }
    throw error;
  }
};
