import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit.js";

// Bridge to Native Share (https://github.com/gomezlucaspsy/Native): its
// QuickShare API has no CORS headers, so the browser can't call it directly.
//   POST { name, content }  → upload a MyComputer file to QuickShare, returns { url, qr }
//   GET                      → list QuickShare items (id, name, size, url, createdAt)
//   GET ?id=<share id>       → fetch that item's text so it can be imported into MyComputer
// NATIVE_URL is fixed server-side config, never taken from the request.

const NATIVE_URL = (process.env.NATIVE_URL || "https://native-wkh7.vercel.app").replace(/\/+$/, "");
const MAX_UPLOAD_CHARS = 500_000;
const MAX_IMPORT_BYTES = 500_000;

const nativeHost = new URL(NATIVE_URL).hostname;
// Only follow share URLs that point at Vercel Blob or Native itself.
const isAllowedShareUrl = (raw) => {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && (url.hostname.endsWith(".public.blob.vercel-storage.com") || url.hostname === nativeHost);
  } catch {
    return false;
  }
};

const limited = async (request) => {
  const { allowed, retryAfter } = await checkRateLimit("native", getClientIp(request), { limit: 20, windowSeconds: 60 });
  return allowed
    ? null
    : NextResponse.json({ error: "Too many requests, slow down." }, { status: 429, headers: { "Retry-After": String(retryAfter) } });
};

const fetchNative = (path, init) => fetch(`${NATIVE_URL}${path}`, { ...init, signal: AbortSignal.timeout(15000) });

const listShares = async () => {
  const res = await fetchNative("/api/share", { cache: "no-store" });
  if (!res.ok) throw new Error(`Native responded ${res.status}`);
  const items = await res.json();
  return Array.isArray(items) ? items : [];
};

export async function GET(request) {
  const blocked = await limited(request);
  if (blocked) return blocked;
  try {
    const id = new URL(request.url).searchParams.get("id");
    const items = await listShares();
    if (!id) {
      return NextResponse.json({
        nativeUrl: NATIVE_URL,
        items: items.map(({ id, name, size, url, createdAt }) => ({ id, name, size, url, createdAt })),
      });
    }
    const item = items.find((i) => i.id === id);
    if (!item) return NextResponse.json({ error: "Share not found" }, { status: 404 });
    if (!isAllowedShareUrl(item.url)) {
      return NextResponse.json({ error: "That share lives on a LAN address and can't be fetched from here" }, { status: 422 });
    }
    if (item.size > MAX_IMPORT_BYTES) return NextResponse.json({ error: "File too large to import" }, { status: 413 });
    const res = await fetch(item.url, { redirect: "error", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return NextResponse.json({ error: `Download failed (${res.status})` }, { status: 502 });
    const content = (await res.text()).slice(0, MAX_IMPORT_BYTES);
    return NextResponse.json({ name: item.name, content });
  } catch (error) {
    console.error("[native] GET", error);
    return NextResponse.json({ error: "Native unreachable" }, { status: 502 });
  }
}

export async function POST(request) {
  const blocked = await limited(request);
  if (blocked) return blocked;
  try {
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.replace(/[^\w.\- ]/g, "_").slice(0, 120) : "";
    const content = typeof body?.content === "string" ? body.content : null;
    if (!name || content == null) return NextResponse.json({ error: "name and content required" }, { status: 400 });
    if (content.length > MAX_UPLOAD_CHARS) return NextResponse.json({ error: "File too large" }, { status: 413 });

    const form = new FormData();
    form.append("file", new Blob([content], { type: "text/plain;charset=utf-8" }), name);
    const res = await fetchNative("/api/share", { method: "POST", body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return NextResponse.json({ error: data?.error || `Native responded ${res.status}` }, { status: 502 });
    return NextResponse.json({ url: data.url, qr: data.qr, id: data.id });
  } catch (error) {
    console.error("[native] POST", error);
    return NextResponse.json({ error: "Native unreachable" }, { status: 502 });
  }
}
