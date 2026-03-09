/**
 * Generates PNG icons (192x192 and 512x512) from the SVG icon.
 * Run once: node scripts/generate-icons.mjs
 *
 * Requires: npm install --save-dev sharp
 */

import { readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconsDir = join(__dirname, "../public/icons");

let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  console.error("\n❌  'sharp' is not installed. Run: npm install --save-dev sharp\n");
  process.exit(1);
}

mkdirSync(iconsDir, { recursive: true });

const svgBuffer = readFileSync(join(iconsDir, "icon.svg"));

for (const size of [192, 512]) {
  const outPath = join(iconsDir, `icon-${size}.png`);
  await sharp(svgBuffer).resize(size, size).png().toFile(outPath);
  console.log(`✅  Generated ${outPath}`);
}

console.log("\nDone! PNG icons are ready for PWA.\n");
