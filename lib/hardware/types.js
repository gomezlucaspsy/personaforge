// Hardware abstraction for the mecha loop. Anything that implements these five
// methods can be plugged into ElectromagneticConsciousness: the console stub,
// the browser (phone vibration / screen glow / WebAudio), or later a Termux or
// ESP32 bridge.

/**
 * @typedef {Object} HardwareController
 * @property {() => Promise<import("@/lib/core/types.js").WifiNetwork[]>} scanWiFi
 * @property {() => Promise<import("@/lib/core/types.js").BLEDevice[]>} scanBLE
 * @property {(pattern: number[]) => Promise<void>} vibrate   ms on/off pairs, navigator.vibrate style
 * @property {(intensity: number) => Promise<void>} setLED     0..1
 * @property {(freq: number, duration: number) => Promise<void>} playSound  Hz, ms
 */

export {};
