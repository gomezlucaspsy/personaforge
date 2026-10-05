// The phone itself as the mecha body: the installed PWA can vibrate, glow and
// beep. A browser can't scan Wi-Fi/BLE, so scans come from whatever Fieldwatch
// export was loaded last (setSpectrum).

/** @implements {import("./types.js").HardwareController} */
export class BrowserHardwareController {
  /** @param {{ onLED?: (intensity:number) => void }} opts */
  constructor({ onLED } = {}) {
    this.onLED = onLED;
    this.spectrum = { wifi: [], ble: [] };
    this.audio = null;
  }

  setSpectrum(scan) {
    this.spectrum = scan || { wifi: [], ble: [] };
  }

  async scanWiFi() { return this.spectrum.wifi; }
  async scanBLE() { return this.spectrum.ble; }

  async vibrate(pattern) {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
  }

  async setLED(intensity) {
    this.onLED?.(Math.max(0, Math.min(1, intensity)));
  }

  async playSound(freq, duration) {
    if (typeof window === "undefined") return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.audio ||= new Ctx();
    // Autoplay policy: a context created outside a tap starts suspended.
    // Without a prior tap resume() can stay pending, so don't let it stall the loop.
    if (this.audio.state === "suspended") {
      await Promise.race([this.audio.resume().catch(() => {}), new Promise((r) => setTimeout(r, 200))]);
      if (this.audio.state !== "running") return;
    }
    const osc = this.audio.createOscillator();
    const gain = this.audio.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(this.audio.destination);
    osc.start();
    await new Promise((r) => setTimeout(r, duration));
    osc.stop();
    osc.disconnect();
    gain.disconnect();
  }
}
