import { NextResponse } from "next/server";

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
    }

    const body = await request.json();
    const systemPrompt = body?.systemPrompt;
    const incomingMessages = Array.isArray(body?.messages) ? body.messages : [];

    const messages = incomingMessages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content }));

    if (!systemPrompt || messages.length === 0) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      return NextResponse.json({ error: errorText || "Anthropic request failed" }, { status: anthropicResponse.status });
    }

    const data = await anthropicResponse.json();
    const text = data?.content?.map((block) => block?.text || "").join("") || "...";

    return NextResponse.json({ text }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Unexpected server error" }, { status: 500 });
  }
}