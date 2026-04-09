/**
 * Build clean SafeTea icon assets from the brand logo source image.
 *
 * Source: full brand artwork (cup + steam + heart-tag + wordmark on dark navy)
 *         lives at .source-brand-logo.png in this folder. The script crops the
 *         cup region only (no wordmark) using a luminance bbox scan, then
 *         outputs every icon variant the project needs.
 *
 * Outputs (regenerated every run):
 *   safetea-capacitor/assets/icon.png            – 1024x1024 cup on navy (full bleed iOS app icon)
 *   safetea-capacitor/assets/icon-foreground.png – 1024x1024 cup on transparent (Android adaptive)
 *   safetea-capacitor/assets/splash.png          – 2732x2732 cup on navy radial (Capacitor splash)
 *   safetea-capacitor/www/icon-512.png           – cold-start splash logo
 *   safetea-capacitor/www/icon-192.png           – cold-start splash logo (smaller)
 *
 * If running with --web, also writes the public/ web icon set:
 *   ../public/icon.png            (1024)
 *   ../public/icon-512.png        (512)
 *   ../public/icon-192.png        (192)
 *   ../public/apple-touch-icon.png(180)
 *   ../public/favicon-32.png      (32)
 *   ../public/favicon-16.png      (16)
 *
 * Run with:
 *   node generate-native-assets.js          # native + cold-start only
 *   node generate-native-assets.js --web    # also regenerate public/ web icons
 */
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const ROOT = __dirname;
const ASSETS_DIR = path.resolve(ROOT, 'assets');
const WWW_DIR = path.resolve(ROOT, 'www');
const PUBLIC_DIR = path.resolve(ROOT, '..', 'public');

// Source brand logo (cup + wordmark on dark navy). Staged via:
//   cp /path/to/brand/logo.png .source-brand-logo.png
const CANDIDATE_SOURCES = [
  path.resolve(ROOT, '.source-brand-logo.png'),  // current brand source
  path.resolve(ROOT, '.source-icon-1024.png'),   // legacy fallback
  path.resolve(ROOT, '..', 'public', 'icon.png'),
];
const SRC_LOGO = CANDIDATE_SOURCES.find((p) => fs.existsSync(p));

if (!SRC_LOGO) {
  console.error('Could not find a brand logo source. Tried:', CANDIDATE_SOURCES);
  console.error('Stage one with:  cp /path/to/logo.png .source-brand-logo.png');
  process.exit(1);
}

const ALSO_WEB = process.argv.includes('--web');

// Brand palette — navy matches the source logo background exactly.
const NAVY        = { r: 24, g: 25, b: 39 }; // #181927 — sampled from source
const NAVY_HEX    = '#181927';
const NAVY_2_HEX  = '#22223A';
const PINK_BG_HEX = '#F4D9E1';

console.log('source brand logo:', SRC_LOGO);
fs.mkdirSync(ASSETS_DIR, { recursive: true });
fs.mkdirSync(WWW_DIR, { recursive: true });

/**
 * Find a tight bounding box around the cup by scanning luminance.
 * The cup pixels are bright pink (~rgb 220,150,160) and the navy background is
 * dark (~rgb 24,25,39, luminance ~26). Anything with luminance > threshold is
 * considered cup content. The wordmark "SafeTea" lives in the right half of
 * the source image, so we restrict the scan to the left 50% to avoid grabbing
 * letters.
 */
async function findCupBounds(srcPath) {
  const meta = await sharp(srcPath).metadata();
  // Restrict scan to left 43% — the "SafeTea" wordmark "S" starts around 47%
  // of the source image width, so 43% gives a comfortable buffer.
  const scanWidth = Math.floor(meta.width * 0.43);
  const { data, info } = await sharp(srcPath)
    .extract({ left: 0, top: 0, width: scanWidth, height: meta.height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const w = info.width, h = info.height, ch = info.channels;
  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum > 60) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX === 0 || maxY === 0) {
    throw new Error('Could not find cup pixels in source — luminance scan failed.');
  }
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1, srcMeta: meta };
}

/**
 * Extract the cup region from the source as an RGBA buffer with the navy
 * background replaced by transparency. Uses a soft luminance mask so the cup
 * edges stay anti-aliased instead of getting jagged.
 */
async function extractCupTransparent(srcPath, bounds) {
  const padX = Math.round(bounds.width * 0.05);
  const padY = Math.round(bounds.height * 0.05);
  const left = Math.max(0, bounds.minX - padX);
  const top = Math.max(0, bounds.minY - padY);
  const width = Math.min(bounds.srcMeta.width - left, bounds.width + padX * 2);
  const height = Math.min(bounds.srcMeta.height - top, bounds.height + padY * 2);

  const { data, info } = await sharp(srcPath)
    .extract({ left, top, width, height })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width, h = info.height;
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = (r + g + b) / 3;
    // Soft alpha ramp: navy (lum<=30) -> 0, mid (30..70) -> ramp, cup (>70) -> 255
    let alpha;
    if (lum <= 30)      alpha = 0;
    else if (lum >= 70) alpha = 255;
    else                alpha = Math.round(((lum - 30) / 40) * 255);
    out[j] = r;
    out[j + 1] = g;
    out[j + 2] = b;
    out[j + 3] = alpha;
  }
  return await sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function main() {
  const meta = await sharp(SRC_LOGO).metadata();
  console.log('source dims:', meta.width + 'x' + meta.height);

  const bounds = await findCupBounds(SRC_LOGO);
  console.log('cup bounds:', bounds.minX, bounds.minY, '->', bounds.maxX, bounds.maxY,
              '(' + bounds.width + 'x' + bounds.height + ')');

  const cupTransparent = await extractCupTransparent(SRC_LOGO, bounds);
  const cupMeta = await sharp(cupTransparent).metadata();
  console.log('cup transparent buffer:', cupMeta.width + 'x' + cupMeta.height);

  // ---- assets/icon.png — full-bleed iOS app icon (cup on navy, no transparency) ----
  {
    const SIZE = 1024;
    const pad = Math.round(SIZE * 0.18);
    const cupSize = SIZE - pad * 2;
    const fitted = await sharp(cupTransparent)
      .resize(cupSize, cupSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();
    await sharp({
      create: { width: SIZE, height: SIZE, channels: 4, background: NAVY },
    })
      .composite([{ input: fitted, gravity: 'center' }])
      .png()
      .toFile(path.join(ASSETS_DIR, 'icon.png'));
    console.log('wrote assets/icon.png (' + SIZE + 'x' + SIZE + ' cup on navy)');
  }

  // ---- assets/icon-foreground.png — cup on transparent for Android adaptive ----
  // Android adaptive icons reserve a ~33% safe area, so pad more aggressively.
  {
    const SIZE = 1024;
    const pad = Math.round(SIZE * 0.26);
    const cupSize = SIZE - pad * 2;
    const fitted = await sharp(cupTransparent)
      .resize(cupSize, cupSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();
    await sharp({
      create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: fitted, gravity: 'center' }])
      .png()
      .toFile(path.join(ASSETS_DIR, 'icon-foreground.png'));
    console.log('wrote assets/icon-foreground.png (' + SIZE + 'x' + SIZE + ' transparent)');
  }

  // ---- assets/splash.png — 2732x2732 cup on navy radial ----
  {
    const SIZE = 2732;
    const splashCup = 1000;
    const fitted = await sharp(cupTransparent)
      .resize(splashCup, splashCup, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .toBuffer();
    const bgSvg = `
      <svg width="${SIZE}" height="${SIZE}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="g" cx="50%" cy="50%" r="60%">
            <stop offset="0%"  stop-color="${NAVY_2_HEX}"/>
            <stop offset="100%" stop-color="${NAVY_HEX}"/>
          </radialGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#g)"/>
      </svg>
    `;
    const bgBuf = await sharp(Buffer.from(bgSvg)).png().toBuffer();
    await sharp(bgBuf)
      .composite([{ input: fitted, gravity: 'center' }])
      .png()
      .toFile(path.join(ASSETS_DIR, 'splash.png'));
    console.log('wrote assets/splash.png (' + SIZE + 'x' + SIZE + ' navy radial)');
  }

  // ---- www/icon-512.png + www/icon-192.png — cold-start splash logo ----
  {
    const sizes = [512, 192];
    for (const size of sizes) {
      const pad = Math.round(size * 0.10);
      const cupSize = size - pad * 2;
      const fitted = await sharp(cupTransparent)
        .resize(cupSize, cupSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();
      await sharp({
        create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
      })
        .composite([{ input: fitted, gravity: 'center' }])
        .png()
        .toFile(path.join(WWW_DIR, `icon-${size}.png`));
      console.log('wrote www/icon-' + size + '.png');
    }
  }

  // ---- public/ web icon set (only when --web flag set) ----
  if (ALSO_WEB && fs.existsSync(PUBLIC_DIR)) {
    const PUBLIC_SIZES = [
      { name: 'icon.png',             size: 1024, padPct: 0.10, bg: 'transparent' },
      { name: 'icon-512.png',         size: 512,  padPct: 0.10, bg: 'transparent' },
      { name: 'icon-192.png',         size: 192,  padPct: 0.10, bg: 'transparent' },
      { name: 'apple-touch-icon.png', size: 180,  padPct: 0.12, bg: PINK_BG_HEX  }, // iOS rounds it, so flat bg looks best
      { name: 'favicon-32.png',       size: 32,   padPct: 0.06, bg: 'transparent' },
      { name: 'favicon-16.png',       size: 16,   padPct: 0.04, bg: 'transparent' },
    ];
    for (const { name, size, padPct, bg } of PUBLIC_SIZES) {
      const pad = Math.round(size * padPct);
      const cupSize = size - pad * 2;
      const fitted = await sharp(cupTransparent)
        .resize(cupSize, cupSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();
      const base = sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: bg === 'transparent' ? { r: 0, g: 0, b: 0, alpha: 0 } : bg,
        },
      });
      await base
        .composite([{ input: fitted, gravity: 'center' }])
        .png()
        .toFile(path.join(PUBLIC_DIR, name));
      console.log('wrote public/' + name + ' (' + size + 'x' + size + ', bg=' + bg + ')');
    }
  } else if (ALSO_WEB) {
    console.warn('--web flag set but ' + PUBLIC_DIR + ' does not exist; skipping web icons');
  }

  console.log('\nDone. Run `npm run assets` to regenerate native iOS/Android icon sets via capacitor-assets.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
