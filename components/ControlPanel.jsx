"use client";

import { MOOD_COLORS } from "./PerceptionDisplay";

// Manual driver for the mecha loop. The loop itself lives in app/spectrum/page.jsx;
// this only renders the controls.

const card = {
  background: "var(--sys-panel)",
  border: "1px solid var(--sys-line)",
  borderRadius: "12px",
  padding: "14px",
  minWidth: 0,
};
const label = { fontSize: "10px", letterSpacing: "2px", color: "var(--sys-accent)", textTransform: "uppercase", marginBottom: "8px" };
const btn = (primary) => ({
  padding: "8px 12px",
  fontSize: "12px",
  borderRadius: "6px",
  cursor: "pointer",
  border: primary ? "none" : "1px solid var(--sys-line)",
  background: primary ? "var(--sys-accent-strong)" : "transparent",
  color: primary ? "#fff" : "var(--sys-text)",
});

export default function ControlPanel({ mood, running, busy, intervalMs, onIntervalChange, onCycle, onStart, onPause, onLoadFile, onStubScan, error, led }) {
  const color = MOOD_COLORS[mood] || "var(--sys-accent)";
  return (
    <div style={card}>
      <div style={label}>Control</div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        {/* Screen "LED": the browser hardware controller drives this glow */}
        <div aria-label={`LED ${Math.round(led * 100)}%`} style={{ width: "22px", height: "22px", borderRadius: "50%", background: color, opacity: 0.15 + led * 0.85, boxShadow: `0 0 ${6 + led * 24}px ${color}` }} />
        <div style={{ fontSize: "12px", color: "var(--sys-text)" }}>
          mood: <b style={{ color }}>{mood}</b> · {running ? "looping" : "idle"}
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "12px" }}>
        <button style={btn(true)} onClick={onCycle} disabled={busy || running}>{busy ? "…" : "Run One Cycle"}</button>
        {running
          ? <button style={btn(false)} onClick={onPause}>Pause Loop</button>
          : <button style={btn(false)} onClick={onStart} disabled={busy}>Start Loop</button>}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", color: "var(--sys-muted)", marginBottom: "12px" }}>
        interval (ms)
        <input type="number" min={2000} step={500} value={intervalMs}
          onChange={(e) => onIntervalChange(Number(e.target.value))}
          style={{ width: "90px", padding: "6px", background: "var(--sys-bg)", border: "1px solid var(--sys-line)", borderRadius: "4px", color: "var(--sys-text)" }} />
      </label>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
        <label style={{ ...btn(false), display: "inline-block" }}>
          Load Fieldwatch export
          <input type="file" accept=".csv,.jsonl,.json,.txt" onChange={onLoadFile} style={{ display: "none" }} />
        </label>
        <button style={btn(false)} onClick={onStubScan}>Stub scan</button>
      </div>

      {error && <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--sys-danger)" }}>{error}</div>}
    </div>
  );
}
