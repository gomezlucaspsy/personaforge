"use client";

// What the mecha "felt" about the last scan.

export const MOOD_COLORS = {
  calm: "#6fe3b5",
  curious: "#8fd7ff",
  alert: "#ffd166",
  anxious: "#ff9f6b",
  overwhelmed: "#f25f6f",
  lonely: "#a99bff",
};

const card = {
  background: "var(--sys-panel)",
  border: "1px solid var(--sys-line)",
  borderRadius: "12px",
  padding: "14px",
  minWidth: 0,
};
const label = { fontSize: "10px", letterSpacing: "2px", color: "var(--sys-accent)", textTransform: "uppercase", marginBottom: "8px" };

export default function PerceptionDisplay({ perception }) {
  if (!perception) {
    return (
      <div style={card}>
        <div style={label}>Perception</div>
        <div style={{ fontSize: "12px", color: "var(--sys-muted)" }}>Nothing interpreted yet.</div>
      </div>
    );
  }
  const color = MOOD_COLORS[perception.emotional_state] || "var(--sys-accent)";
  const pct = Math.round(perception.confidence * 100);
  return (
    <div style={card}>
      <div style={label}>Perception</div>
      <div style={{ display: "inline-block", padding: "4px 12px", borderRadius: "999px", border: `1px solid ${color}`, color, fontSize: "13px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px" }}>
        {perception.emotional_state}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", margin: "12px 0" }}>
        {perception.patterns.map((p) => (
          <span key={p} style={{ fontSize: "10px", padding: "2px 8px", borderRadius: "4px", background: "var(--sys-accent-soft)", color: "var(--sys-text)" }}>{p}</span>
        ))}
      </div>
      <div style={{ fontSize: "10px", color: "var(--sys-muted)", marginBottom: "4px" }}>Confidence {pct}%</div>
      <div style={{ height: "6px", background: "var(--sys-line-soft)", borderRadius: "3px", marginBottom: "12px" }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: "3px" }} />
      </div>
      <pre style={{ margin: 0, whiteSpace: "pre-wrap", fontFamily: "'JetBrains Mono', monospace", fontSize: "12px", lineHeight: 1.5, color: "var(--sys-text)" }}>
        {perception.raw_text}
      </pre>
    </div>
  );
}
