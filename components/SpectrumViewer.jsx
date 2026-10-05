"use client";

// Last radio snapshot: Wi-Fi APs and BLE devices, strongest first.

const bar = (rssi) => Math.max(4, Math.min(100, ((rssi + 100) / 70) * 100));

const card = {
  background: "var(--sys-panel)",
  border: "1px solid var(--sys-line)",
  borderRadius: "12px",
  padding: "14px",
  minWidth: 0,
};
const label = { fontSize: "10px", letterSpacing: "2px", color: "var(--sys-accent)", textTransform: "uppercase", marginBottom: "8px" };
const row = { display: "grid", gridTemplateColumns: "56px 1fr", gap: "8px", alignItems: "center", fontSize: "12px", padding: "3px 0" };
const mono = { fontFamily: "'JetBrains Mono', monospace", fontSize: "10px", color: "var(--sys-muted)" };

function SignalRow({ rssi, title, sub }) {
  return (
    <div style={row}>
      <div>
        <div style={{ fontSize: "11px", color: "var(--sys-text)" }}>{rssi} dBm</div>
        <div style={{ height: "3px", background: "var(--sys-line-soft)", borderRadius: "2px" }}>
          <div style={{ width: `${bar(rssi)}%`, height: "100%", background: "var(--sys-accent)", borderRadius: "2px" }} />
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</div>
        <div style={{ ...mono, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
      </div>
    </div>
  );
}

export default function SpectrumViewer({ spectrum }) {
  if (!spectrum) {
    return (
      <div style={card}>
        <div style={label}>Spectrum</div>
        <div style={{ fontSize: "12px", color: "var(--sys-muted)" }}>No scan yet — load a Fieldwatch export or use the stub scan.</div>
      </div>
    );
  }
  return (
    <div style={card}>
      <div style={label}>Spectrum</div>
      <div style={{ ...mono, marginBottom: "10px" }}>
        {new Date(spectrum.timestamp).toLocaleString()} · source: {spectrum.source || "?"}
      </div>
      <div style={{ ...label, fontSize: "9px", color: "var(--sys-muted)" }}>Wi-Fi · {spectrum.wifi.length}</div>
      <div style={{ maxHeight: "220px", overflow: "auto", marginBottom: "12px" }}>
        {spectrum.wifi.map((w) => (
          <SignalRow key={w.bssid} rssi={w.rssi} title={w.ssid || "<hidden>"}
            sub={[w.bssid, w.frequency && `${w.frequency} MHz`, w.vendor].filter(Boolean).join(" · ")} />
        ))}
      </div>
      <div style={{ ...label, fontSize: "9px", color: "var(--sys-muted)" }}>BLE · {spectrum.ble.length}</div>
      <div style={{ maxHeight: "220px", overflow: "auto" }}>
        {spectrum.ble.map((b) => (
          <SignalRow key={b.address} rssi={b.rssi} title={b.name || "<unnamed>"}
            sub={[b.address, b.vendor, b.signatures?.join("+"), b.randomized && "random MAC"].filter(Boolean).join(" · ")} />
        ))}
      </div>
    </div>
  );
}
