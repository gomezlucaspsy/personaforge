// Fake hardware for local testing: canned scans with a little RSSI jitter, and
// actuators that just log. Use it before wiring Termux or a real board.

const jitter = (base) => base + Math.round((Math.random() - 0.5) * 8);

/** @implements {import("./types.js").HardwareController} */
export class StubHardwareController {
  constructor({ log = console.log } = {}) {
    this.log = log;
  }

  async scanWiFi() {
    return [
      { ssid: "HomeNet_5G", bssid: "A4:2B:B0:11:22:33", rssi: jitter(-48), channel: 36, frequency: 5180 },
      { ssid: "Vecino-2.4", bssid: "C8:3A:35:44:55:66", rssi: jitter(-71), channel: 6, frequency: 2437 },
      { ssid: "", bssid: "F0:9F:C2:77:88:99", rssi: jitter(-83), channel: 11, frequency: 2462, hidden: true },
    ];
  }

  async scanBLE() {
    return [
      { address: "5C:F3:70:AA:BB:01", name: "Galaxy Buds", rssi: jitter(-55), vendor: "Samsung" },
      { address: "7A:1E:93:CC:DD:02", name: "", rssi: jitter(-78), randomized: true },
      { address: "D4:36:39:EE:FF:03", name: "Mi Band 7", rssi: jitter(-66), vendor: "Xiaomi" },
    ];
  }

  async vibrate(pattern) { this.log(`[stub] vibrate ${JSON.stringify(pattern)}`); }
  async setLED(intensity) { this.log(`[stub] led ${intensity.toFixed(2)}`); }
  async playSound(freq, duration) { this.log(`[stub] sound ${freq}Hz ${duration}ms`); }
}
