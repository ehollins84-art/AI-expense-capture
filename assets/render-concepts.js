// Renders three icon-concept PNGs to assets/concepts/ at 1024x1024.
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const OUT_DIR = path.join(__dirname, 'concepts');

// Colors from lib/theme.ts.
const CREAM = '#FAFAF7';
const TERRA = '#C6633A';
const TERRA_DEEP = '#9A4F2D';
const ACCENT_SOFT = '#F4E3D7';
const INK = '#1B1B1B';

const concepts = {
  // A: Bold "E" monogram on terracotta. Confident, Apple Wallet-y.
  'A-bold-E': `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="${TERRA}"/>
  <!-- A subtle inner highlight to lift the icon -->
  <rect width="1024" height="1024" fill="url(#gradA)"/>
  <defs>
    <linearGradient id="gradA" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="white" stop-opacity="0.06"/>
      <stop offset="0.5" stop-color="white" stop-opacity="0"/>
      <stop offset="1" stop-color="black" stop-opacity="0.1"/>
    </linearGradient>
  </defs>
  <g fill="${CREAM}">
    <rect x="294" y="248" width="140" height="528" rx="28"/>
    <rect x="294" y="248" width="436" height="140" rx="28"/>
    <rect x="294" y="442" width="320" height="140" rx="28"/>
    <rect x="294" y="636" width="436" height="140" rx="28"/>
  </g>
</svg>`,

  // B: Receipt + sparkle. The receipt is a soft rounded rectangle with
  // a deckled bottom and a small AI sparkle in the corner.
  'B-receipt-sparkle': `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="${CREAM}"/>
  <!-- Receipt silhouette -->
  <g>
    <path fill="${TERRA}" d="
      M 300 220
      Q 300 200, 320 200
      L 704 200
      Q 724 200, 724 220
      L 724 760
      L 686 740
      L 648 760
      L 610 740
      L 572 760
      L 534 740
      L 496 760
      L 458 740
      L 420 760
      L 382 740
      L 344 760
      L 300 760
      Z
    "/>
    <!-- Receipt lines -->
    <g fill="${CREAM}" opacity="0.92">
      <rect x="360" y="310" width="304" height="40" rx="12"/>
      <rect x="360" y="394" width="224" height="28" rx="9"/>
      <rect x="360" y="442" width="264" height="28" rx="9"/>
      <rect x="360" y="490" width="200" height="28" rx="9"/>
      <rect x="360" y="568" width="304" height="44" rx="14"/>
    </g>
  </g>
  <!-- AI sparkle (top-right) -->
  <g transform="translate(770 254)">
    <path fill="${TERRA}" d="
      M 0 -60
      Q 14 -14, 60 0
      Q 14 14, 0 60
      Q -14 14, -60 0
      Q -14 -14, 0 -60
      Z
    "/>
    <circle cx="0" cy="0" r="14" fill="${CREAM}"/>
  </g>
</svg>`,

  // C: A folded receipt that hints at an "E". Geometric, abstract,
  // and reads as a stack of papers with a fold/curl.
  'C-folded-E': `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="${ACCENT_SOFT}"/>
  <!-- Three stacked pages -->
  <g>
    <!-- Page 3 (back) -->
    <rect x="280" y="312" width="424" height="120" rx="40" fill="${TERRA_DEEP}" opacity="0.55"/>
    <!-- Page 2 (middle) -->
    <rect x="280" y="452" width="332" height="120" rx="40" fill="${TERRA_DEEP}" opacity="0.78"/>
    <!-- Page 1 (front) -->
    <rect x="280" y="592" width="424" height="120" rx="40" fill="${TERRA}"/>
    <!-- Connecting spine -->
    <rect x="280" y="312" width="120" height="400" rx="40" fill="${TERRA}"/>
  </g>
  <!-- Subtle inner glow -->
  <rect width="1024" height="1024" fill="url(#gradC)"/>
  <defs>
    <radialGradient id="gradC" cx="0.5" cy="0.4" r="0.8">
      <stop offset="0" stop-color="white" stop-opacity="0.08"/>
      <stop offset="1" stop-color="black" stop-opacity="0.06"/>
    </radialGradient>
  </defs>
</svg>`,
};

for (const [name, svg] of Object.entries(concepts)) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1024 },
    background: 'transparent',
  });
  const png = resvg.render().asPng();
  const outPath = path.join(OUT_DIR, `${name}.png`);
  fs.writeFileSync(outPath, png);
  console.log(`Wrote ${outPath}`);
}
