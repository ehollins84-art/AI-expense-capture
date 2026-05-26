// Generates the production icon set for Schedule E AI.
//
// Outputs:
//   assets/icon.png             — 1024x1024 iOS + Android base icon
//   assets/adaptive-icon.png    — 1024x1024 Android adaptive foreground
//                                 (E centered in the safe zone, transparent bg)
//   assets/splash-icon.png      — 1024x1024 splash screen image (the icon itself)
//   assets/favicon.png          —   48x48   web favicon

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const ROOT = __dirname;

const CREAM = '#FAFAF7';
const TERRA = '#C6633A';

// The "E" glyph as a group of rounded rects, sized to a 1024 canvas.
// Returns SVG markup positioned at the canvas center.
function eGlyph({
  cx = 512,
  cy = 512,
  width = 436, // overall glyph width
  height = 528, // overall glyph height
  color = CREAM,
}) {
  const spineW = Math.round(width * 0.32);
  const barH = Math.round(height * 0.265);
  const midBarW = Math.round(width * 0.74);
  const radius = Math.round(barH * 0.235);

  const left = cx - width / 2;
  const top = cy - height / 2;

  return `
    <g fill="${color}">
      <!-- spine -->
      <rect x="${left}" y="${top}" width="${spineW}" height="${height}" rx="${radius}"/>
      <!-- top bar -->
      <rect x="${left}" y="${top}" width="${width}" height="${barH}" rx="${radius}"/>
      <!-- middle bar -->
      <rect x="${left}" y="${cy - barH / 2}" width="${midBarW}" height="${barH}" rx="${radius}"/>
      <!-- bottom bar -->
      <rect x="${left}" y="${top + height - barH}" width="${width}" height="${barH}" rx="${radius}"/>
    </g>
  `;
}

// Full app icon: terracotta background + cream E + subtle inner light/shade.
function iconSVG({ size = 1024 } = {}) {
  return `
<svg width="${size}" height="${size}" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="lift" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="white" stop-opacity="0.07"/>
      <stop offset="0.55" stop-color="white" stop-opacity="0"/>
      <stop offset="1" stop-color="black" stop-opacity="0.10"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" fill="${TERRA}"/>
  <rect width="1024" height="1024" fill="url(#lift)"/>
  ${eGlyph({})}
</svg>`;
}

// Adaptive icon: E in TERRACOTTA on transparent, centered and scaled into
// the Android safe zone (~66% of the canvas) so OS masks (circle, squircle,
// teardrop) never clip the glyph. Background color is set via app.json.
function adaptiveSVG({ size = 1024 } = {}) {
  return `
<svg width="${size}" height="${size}" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${eGlyph({ width: 320, height: 388, color: CREAM })}
</svg>`;
}

// Splash icon — same artwork as the app icon, smaller, rendered on cream
// (Expo composites it onto the splash background color from app.json).
function splashSVG({ size = 1024 } = {}) {
  return `
<svg width="${size}" height="${size}" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <!-- Rounded square plate matching the iOS app-icon mask, on cream bg -->
  <defs>
    <clipPath id="squircle">
      <rect x="232" y="232" width="560" height="560" rx="124" ry="124"/>
    </clipPath>
    <linearGradient id="lift" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="white" stop-opacity="0.07"/>
      <stop offset="0.55" stop-color="white" stop-opacity="0"/>
      <stop offset="1" stop-color="black" stop-opacity="0.10"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#squircle)">
    <rect x="232" y="232" width="560" height="560" fill="${TERRA}"/>
    <rect x="232" y="232" width="560" height="560" fill="url(#lift)"/>
    ${eGlyph({ width: 240, height: 290 })}
  </g>
</svg>`;
}

function render(svg, size, outPath) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    background: 'transparent',
  });
  const png = resvg.render().asPng();
  fs.writeFileSync(outPath, png);
  console.log(`Wrote ${outPath} (${size}x${size}, ${(png.length / 1024).toFixed(1)} KB)`);
}

render(iconSVG(),     1024, path.join(ROOT, 'icon.png'));
render(adaptiveSVG(), 1024, path.join(ROOT, 'adaptive-icon.png'));
render(splashSVG(),   1024, path.join(ROOT, 'splash-icon.png'));
render(iconSVG(),       48, path.join(ROOT, 'favicon.png'));
