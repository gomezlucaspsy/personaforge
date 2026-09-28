import { NextResponse } from "next/server";
import {
  buildDuplicateMarker,
  getPrAutomationConfig,
  processPullRequestWebhook,
  verifyGitHubWebhookSignature,
} from "@/lib/github-pr-automation.js";

export const runtime = "nodejs";

const SUPPORTED_EVENT = "pull_request";
const SUPPORTED_ACTIONS = new Set(["opened", "synchronize"]);

export async function POST(request) {
  const rawBody = await request.text();
  const config = getPrAutomationConfig();

  if (!config.enabled) {
    return NextResponse.json({ ok: true, ignored: true, reason: "PR automation disabled" }, { status: 202 });
  }

  if (!config.webhookSecret || !config.githubToken) {
    return NextResponse.json(
      { error: "Missing GITHUB_WEBHOOK_SECRET or GITHUB_TOKEN" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyGitHubWebhookSignature(config.webhookSecret, rawBody, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  if (event !== SUPPORTED_EVENT) {
    return NextResponse.json({ ok: true, ignored: true, reason: `Ignored event ${event || "unknown"}` }, { status: 202 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!SUPPORTED_ACTIONS.has(payload?.action)) {
    return NextResponse.json(
      { ok: true, ignored: true, reason: `Ignored action ${payload?.action || "unknown"}` },
      { status: 202 }
    );
  }

  try {
    const result = await processPullRequestWebhook(payload, config);
    const duplicateMarker = payload?.pull_request?.head?.sha
      ? buildDuplicateMarker(payload.pull_request.head.sha)
      : null;

    return NextResponse.json(
      {
        ok: true,
        result,
        duplicateMarker,
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to process pull request webhook" },
      { status: 500 }
    );
  }
}
