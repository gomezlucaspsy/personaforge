"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ControlPanel from "@/components/ControlPanel";
import PerceptionDisplay, { MOOD_COLORS } from "@/components/PerceptionDisplay";
import SpectrumViewer from "@/components/SpectrumViewer";
import { ElectromagneticConsciousness } from "@/lib/core/consciousness.js";
import { normalizeSpectrum } from "@/lib/core/types.js";
import { BrowserHardwareController } from "@/lib/hardware/browser.js";
import { StubHardwareController } from "@/lib/hardware/stub.js";
import { parseFieldwatch } from "@/lib/utils/fieldwatch-parser.js";

// Same look as the chat (Aurora Shell tokens from PersonaChat.jsx).
const THEME = {
  "--sys-bg": "#030714",
  "--sys-panel": "rgba(8,15,32,.82)",
  "--sys-panel-soft": "rgba(17,32,64,.66)",
  "--sys-line": "rgba(123,183,255,.24)",
  "--sys-line-soft": "rgba(123,183,255,.16)",
  "--sys-text": "#edf6ff",
  "--sys-muted": "rgba(176,220,255,.78)",
  "--sys-accent": "#8fd7ff",
  "--sys-accent-strong": "#5ec2ff",
  "--sys-accent-soft": "rgba(127,216,255,.35)",
  "--sys-danger": "#f25f6f",
};

// Shares the chat's per-browser id, so state is private to this device.
const getDeviceId = () => {
  try {
    let id = localStorage.getItem("pf_visitor_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("pf_visitor_id", id);
    }
    return id;
  } catch {
    return null;
  }
};

const stub = new StubHardwareController({ log: () => {} });
const stubScan = async () =>
  normalizeSpectrum({ timestamp: new Date().toISOString(), source: "stub", wifi: await stub.scanWiFi(), ble: await stub.scanBLE() });

export default function SpectrumPage() {
  const [deviceId, setDeviceId] = useState(null);
  const [state, setState] = useState(null);
  const [scan, setScan] = useState(null);
  const [intervalMs, setIntervalMs] = useState(5000);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [led, setLed] = useState(0);

  const mindRef = useRef(null);
  const hardwareRef = useRef(null);
  const lastSeenAt = useRef(undefined); // newest history entry we've already reacted to
  const scanRef = useRef(null);
  scanRef.current = scan;

  useEffect(() => {
    setDeviceId(getDeviceId());
    hardwareRef.current = new BrowserHardwareController({ onLED: setLed });
    mindRef.current = new ElectromagneticConsciousness({ hardware: hardwareRef.current, interpreter: null, log: () => {} });
  }, []);

  // Poll server state every 2s. This also picks up cycles driven by
  // scripts/spectrum-poller.mjs (Termux/PC), and the phone reacts to them.
  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/state?deviceId=${encodeURIComponent(deviceId)}`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const next = await res.json();
        const newest = next.history?.[0];
        if (lastSeenAt.current !== undefined && newest && newest.at !== lastSeenAt.current) {
          mindRef.current?.execute(newest.actions || []);
        }
        lastSeenAt.current = newest?.at ?? null;
        setState(next);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(id); };
  }, [deviceId]);

  const runCycle = useCallback(async () => {
    if (!deviceId) return;
    let spectrum = scanRef.current;
    if (!spectrum || spectrum.source === "stub") {
      spectrum = await stubScan();
      setScan(spectrum);
    }
    setError("");
    const res = await fetch("/api/sense", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId, spectrum }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Sense failed");
    lastSeenAt.current = data.state.history[0]?.at ?? null; // we're executing it ourselves
    setState(data.state);
    await mindRef.current.execute(data.actions);
  }, [deviceId]);

  const cycleOnce = async () => {
    setBusy(true);
    try { await runCycle(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  // Self-scheduling loop: next cycle starts intervalMs after the previous one finished.
  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let timer;
    const loop = async () => {
      try { await runCycle(); } catch (e) { setError(e.message); }
      if (!stopped) timer = setTimeout(loop, Math.max(2000, intervalMs));
    };
    loop();
    return () => { stopped = true; clearTimeout(timer); };
  }, [running, intervalMs, runCycle]);

  const loadFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = parseFieldwatch(await file.text(), file.name);
      if (!parsed || (parsed.wifi.length === 0 && parsed.ble.length === 0)) throw new Error("No Wi-Fi/BLE rows found — is this a Fieldwatch log or sit export?");
      setScan(parsed);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  };

  const shownSpectrum = scan || state?.last_spectrum || null;
  const mood = state?.mood || "calm";

  return (
    <main style={{ ...THEME, minHeight: "100vh", background: "var(--sys-bg)", color: "var(--sys-text)", fontFamily: "system-ui, sans-serif", padding: "16px" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "20px", letterSpacing: "3px" }}>SPECTRUM</h1>
            <div style={{ fontSize: "11px", color: "var(--sys-muted)" }}>sense → interpret → decide → execute · Fieldwatch radios in, phone body out</div>
          </div>
          <a href="/" style={{ fontSize: "12px", color: "var(--sys-accent)" }}>← chat</a>
        </header>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px", marginBottom: "12px" }}>
          <ControlPanel
            mood={mood} running={running} busy={busy} intervalMs={intervalMs} led={led} error={error}
            onIntervalChange={setIntervalMs}
            onCycle={cycleOnce}
            onStart={() => setRunning(true)}
            onPause={() => setRunning(false)}
            onLoadFile={loadFile}
            onStubScan={async () => setScan(await stubScan())}
          />
          <PerceptionDisplay perception={state?.last_perception || null} />
          <SpectrumViewer spectrum={shownSpectrum} />
        </div>

        <section style={{ background: "var(--sys-panel)", border: "1px solid var(--sys-line)", borderRadius: "12px", padding: "14px" }}>
          <div style={{ fontSize: "10px", letterSpacing: "2px", color: "var(--sys-accent)", textTransform: "uppercase", marginBottom: "8px" }}>Last {state?.history?.length || 0} cycles</div>
          {(state?.history || []).map((h) => (
            <div key={h.at} style={{ display: "grid", gridTemplateColumns: "auto auto 1fr", gap: "10px", fontSize: "12px", padding: "4px 0", borderBottom: "1px solid var(--sys-line-soft)" }}>
              <span style={{ color: "var(--sys-muted)", fontFamily: "monospace" }}>{new Date(h.at).toLocaleTimeString()}</span>
              <span style={{ color: MOOD_COLORS[h.mood] }}>{h.mood} {Math.round(h.confidence * 100)}%</span>
              <span style={{ color: "var(--sys-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {h.wifiCount} Wi-Fi · {h.bleCount} BLE · {h.patterns.join(", ")}
              </span>
            </div>
          ))}
          {deviceId && (
            <div style={{ marginTop: "12px", fontSize: "10px", color: "var(--sys-muted)", wordBreak: "break-all" }}>
              device id (for MECHA_DEVICE_ID in the poller): <code>{deviceId}</code>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
