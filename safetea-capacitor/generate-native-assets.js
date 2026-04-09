/**
 * Build clean iOS/Android source assets from public/icon.png
 *
 *   assets/icon.png            – 1024x1024 cup-on-pink-background (full bleed)
 *   assets/icon-foreground.png – 1024x1024 cup-only on transparent (Android adaptive foreground)
 *   assets/splash.png          – 2732x2732 cup centered on dark navy radial bg
 *
 * Run with:
 *   node generate-native-assets.js
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
// Source icon: prefer the clean cup icon committed to main/public, fall
// back to the staging copy in /tmp (used when generating from a worktree
// that hasn't pulled main yet).
const CANDIDATE_SOURCES = [
  path.resolve(ROOT, '..', 'public', 'icon.png'),     // when running from main
  path.resolve(ROOT, '.source-icon-1024.png'),         // staged via `git show main:public/icon.png`
  path.resolve(ROOT, 'www', 'icon-512.png'),           // smaller fallback
];
const SRC_ICON = CANDIDATE_SOURCES.find((p) => fs.existsSync(p));
const ASSETS_DIR = path.resolve(ROOT, 'assets');

const BRAND_BG = '#1A1A2E';   // navy
const BRAND_BG_2 = '#22223A'; // softer navy for radial center
const BRAND_PINK = '#E8A0B5';
const ICON_BG_PINK = '#F4D9E1'; // soft pink for ios solid icon background

if (!SRC_ICON) {
  console.error('Could not find a clean source icon. Tried:', CANDIDATE_SOURCES);
  process.exit(1);
}
console.log('source icon path:', SRC_ICON);
fs.mkdirSync(ASSETS_DIR, { recursive: true });

async function main() {
  const meta = await sharp(SRC_ICON).metadata();
  console.log('source icon:', meta.width + 'x' + meta.height);

  // Trim source to its content bounding box so we can confidently re-pad
  const trimmed = await sharp(SRC_ICON)
    .ensureAlpha()
    .trim({ threshold: 10 })
    .toBuffer();
  const trimmedMeta = await sharp(trimmed).metadata();
  console.log('trimmed cup:', trimmedMeta.width + 'x' + trimmedMeta.height);

  // ---- icon.png — full-bleed iOS app icon (no transparency, soft pink bg) ----
  const ICON_SIZE = 1024;
  const iconPad = Math.round(ICON_SIZE * 0.18); // 18% safe padding
  const cupSize = ICON_SIZE - iconPad * 2;
  const cupResized = await sharp(trimmed)
    .resize(cupSize, cupSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await sharp({
    create: {
      width: ICON_SIZE,
      height: ICON_SIZE,
      channels: 4,
      background: ICON_BG_PINK,
    },
  })
    .composite([{ input: cupResized, gravity: 'center' }])
    .png()
    .toFile(path.join(ASSETS_DIR, 'icon.png'));
  console.log('wrote assets/icon.png (' + ICON_SIZE + 'x' + ICON_SIZE + ' solid pink bg)');

  // ---- icon-foreground.png — cup on transparent for Android adaptive icons ----
  // Android adaptive icons reserve a ~33% safe area, so pad more aggressively.
  const FG_SIZE = 1024;
  const fgPad = Math.round(FG_SIZE * 0.26);
  const fgCup = FG_SIZE - fgPad * 2;
  const fgResized = await sharp(trimmed)
    .resize(fgCup, fgCup, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  await sharp({
    create: {
      width: FG_SIZE,
      height: FG_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: fgResized, gravity: 'center' }])
    .png()
    .toFile(path.join(ASSETS_DIR, 'icon-foreground.png'));
  console.log('wrote assets/icon-foreground.png (' + FG_SIZE + 'x' + FG_SIZE + ' transparent bg)');

  // ---- splash.png — large branded splash, navy bg with cup centered ----
  // Capacitor splash assets must be 2732x2732 (with 1200x1200 safe area in center).
  const SPLASH_SIZE = 2732;
  const splashCup = 880; // sits comfortably inside 1200 safe area
  const splashCupBuf = await sharp(trimmed)
    .resize(splashCup, splashCup, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  // Build a subtle radial-ish gradient using SVG (sharp doesn't ship with radial primitives natively).
  const bgSvg = `
    <svg width="${SPLASH_SIZE}" height="${SPLASH_SIZE}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="g" cx="50%" cy="50%" r="60%">
          <stop offset="0%"  stop-color="${BRAND_BG_2}"/>
          <stop offset="100%" stop-color="${BRAND_BG}"/>
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>
  `;
  const bgBuf = await sharp(Buffer.from(bgSvg)).png().toBuffer();

  await sharp(bgBuf)
    .composite([{ input: splashCupBuf, gravity: 'center' }])
    .png()
    .toFile(path.join(ASSETS_DIR, 'splash.png'));
  console.log('wrote assets/splash.png (' + SPLASH_SIZE + 'x' + SPLASH_SIZE + ' navy radial)');

  console.log('\nDone. Run `npm run assets` to regenerate native iOS/Android icon sets.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
