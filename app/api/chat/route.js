import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { getOrCreateFileSystem, getFileTree, createFileOrFolder, updateFile, deleteFileOrFolder } from "../persona-files/store.js";

// Force-read .env.local to avoid stale system env override
try {
  const envLocal = readFileSync(process.cwd() + "/.env.local", "utf8");
  for (const line of envLocal.split("\n")) {
    const m = line.match(/^([^#=]+)=(.+)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  }
} catch {}

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const MAX_LINKS = 3;
const MAX_SNIPPET_LENGTH = 4000;

const extractUrls = (messages) => {
  const urlRegex = /https?:\/\/[^\s)\]}>"']+/gi;
  const allText = messages.map((message) => message.content).join("\n");
  const matches = allText.match(urlRegex) || [];
  return [...new Set(matches)].slice(0, MAX_LINKS);
};

const stripHtml = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const parseGitHubPath = (urlString) => {
  try {
    const url = new URL(urlString);
    if (url.hostname !== "github.com") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1], parts };
  } catch {
    return null;
  }
};

const fetchWithTimeout = async (url, options = {}, timeoutMs = 10000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "User-Agent": "persona-chat-link-analyzer",
        Accept: "application/json, text/plain, text/html;q=0.9,*/*;q=0.8",
        ...(options.headers || {}),
      },
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

const summarizeLink = async (url) => {
  try {
    const githubInfo = parseGitHubPath(url);

    if (githubInfo) {
      const { owner, repo, parts } = githubInfo;

      if (parts[2] === "blob" && parts.length >= 5) {
        const branch = parts[3];
        const filePath = parts.slice(4).join("/");
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`;
        const rawRes = await fetchWithTimeout(rawUrl);
        if (rawRes.ok) {
          const code = (await rawRes.text()).slice(0, MAX_SNIPPET_LENGTH);
          return `URL: ${url}\nType: GitHub file\nSummary: Raw file preview (${filePath})\nContent:\n${code}`;
        }
      }

      const repoRes = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}`);
      if (repoRes.ok) {
        const repoData = await repoRes.json();
        const readmeRes = await fetchWithTimeout(`https://api.github.com/repos/${owner}/${repo}/readme`, {
          headers: { Accept: "application/vnd.github.raw+json" },
        });
        const readmeText = readmeRes.ok ? (await readmeRes.text()).slice(0, MAX_SNIPPET_LENGTH) : "";
        return `URL: ${url}\nType: GitHub repository\nRepo: ${repoData.full_name}\nDescription: ${repoData.description || "N/A"}\nStars: ${repoData.stargazers_count || 0}\nPrimary language: ${repoData.language || "Unknown"}\nREADME excerpt:\n${readmeText || "No README available"}`;
      }
    }

    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      return `URL: ${url}\nCould not fetch content (status ${response.status}).`;
    }

    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();
    const cleaned = contentType.includes("text/html") ? stripHtml(rawText) : rawText;
    const snippet = cleaned.slice(0, MAX_SNIPPET_LENGTH);

    return `URL: ${url}\nType: Web page\nExtracted text:\n${snippet || "No readable text extracted."}`;
  } catch (error) {
    return `URL: ${url}\nFailed to analyze link: ${error?.message || "Unknown error"}`;
  }
};

export async function POST(request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Missing ANTHROPIC_API_KEY" }, { status: 500 });
    }

    const body = await request.json();
    const systemPrompt = body?.systemPrompt;
    const personaId = body?.personaId;
    const charMeta = body?.charMeta || {};
    const incomingMessages = Array.isArray(body?.messages) ? body.messages : [];

    const messages = incomingMessages
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map((m) => ({ role: m.role, content: m.content }));

    if (!systemPrompt || messages.length === 0) {
      return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });
    }

    const urls = extractUrls(messages);
    const linkSummaries = await Promise.all(urls.map((url) => summarizeLink(url)));
    const linkContext = linkSummaries.length
      ? `\n\nLink analysis context (from URLs shared in chat):\n${linkSummaries.join("\n\n---\n\n")}`
      : "";

    // Build file tree context for the AI
    let fileTreeContext = "";
    if (personaId) {
      const fs = getOrCreateFileSystem(personaId, charMeta);
      const tree = getFileTree(fs.root);
      fileTreeContext = `\nYour current MyComputer file tree:\n${tree.join("\n") || "(empty)"}\n`;
    }

    const dramaturgicalContext = `
You are a unique AI character with a 3D avatar that breathes, gestures, and expresses emotion through lip-sync and facial expressions. Stay in character but keep responses SHORT and natural (1-3 sentences usually).
${fileTreeContext}
FILE SYSTEM ACTIONS:
Format: [FILE_ACTION:action|path|name|type|content]
Examples:
[FILE_ACTION:create|/Documents|notes.txt|file|The document content goes here]
[FILE_ACTION:create|/Code|script.js|file|function test() { return 42; }]
[FILE_ACTION:create|/Archives|archive_name.txt|file|Archive content with actual data]
ALWAYS include real content - never empty files. Content can be text, code, or data.`;


    const runtimeSystemPrompt = `${dramaturgicalContext}
${systemPrompt}

CRITICAL: Keep all responses SHORT and punchy. Max 3-4 sentences per reply (longer only if absolutely needed). NO CODE DUMPS, NO LONG WALLS OF TEXT.
- Be warm, genuine, conversational. Use contractions.
- When showing code: keep it under 10 lines, use [FILE_ACTION] to save to MyComputer instead
- End with: [REPLIES: "option1" | "option2" | "option3"]
${linkContext}`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 300,
        system: runtimeSystemPrompt,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages,
      }),
    });

    if (!anthropicResponse.ok) {
      const errorText = await anthropicResponse.text();
      return NextResponse.json({ error: errorText || "Anthropic request failed" }, { status: anthropicResponse.status });
    }

    const data = await anthropicResponse.json();
    const rawText = data?.content?.map((block) => block?.text || "").join("") || "...";

    // Parse out FILE_ACTION blocks and execute them
    const fileActionRegex = /\[FILE_ACTION:([^|]+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^\]]+)\]/g;
    const fileActions = [];
    let match;
    while ((match = fileActionRegex.exec(rawText)) !== null) {
      fileActions.push({
        action: match[1].trim(),
        path: (match[2] || "/").trim(),
        name: match[3].trim(),
        type: (match[4] || "file").trim(),
        content: match[5].trim(), // Capture all content including newlines/special chars
      });
    }

    // Execute file actions if we have a personaId
    const fileResults = [];
    if (personaId && fileActions.length > 0) {
      const fs = getOrCreateFileSystem(personaId, charMeta);
      for (const fa of fileActions) {
        try {
          let result;
          switch (fa.action) {
            case "create":
              result = createFileOrFolder(fs.root, fa.path || "/", fa.name, fa.type || "file", fa.content || "");
              break;
            case "update":
              result = updateFile(fs.root, fa.path, fa.content || "");
              break;
            case "delete":
              result = deleteFileOrFolder(fs.root, fa.path);
              break;
            default:
              result = { error: `Unknown action: ${fa.action}` };
          }
          fileResults.push({ ...fa, ...result });
        } catch (e) {
          fileResults.push({ ...fa, error: e.message });
        }
      }
    }

    // Strip FILE_ACTION blocks from visible text
    let text = rawText.replace(/\n?\s*\[FILE_ACTION:[^\]]*\]/g, "").trim();

    // Parse out suggested replies
    let suggestions = [];
    const replyMatch = text.match(/\[REPLIES:\s*"([^"]+)"\s*\|\s*"([^"]+)"\s*\|\s*"([^"]+)"\s*\]/);
    if (replyMatch) {
      suggestions = [replyMatch[1], replyMatch[2], replyMatch[3]];
      text = text.replace(/\n?\s*\[REPLIES:.*?\]/, '').trim();
    }

    return NextResponse.json({ text, suggestions, fileActions: fileResults }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error?.message || "Unexpected server error" }, { status: 500 });
  }
}