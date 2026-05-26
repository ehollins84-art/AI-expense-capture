// Mock up Manila icon concepts at 1024x1024.
const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const OUT_DIR = path.join(__dirname, 'concepts-manila');
if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

const CREAM = '#FAFAF7';
const TERRA = '#C6633A';
const TERRA_DEEP = '#9A4F2D';
const MANILA = '#E8D2A6'; // warm manila folder color
const MANILA_DEEP = '#C8A877';
const INK = '#1B1B1B';

// Subtle inner light/shade gradient for a tactile feel.
const LIFT = `
  <defs>
    <linearGradient id="lift" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="white" stop-opacity="0.07"/>
      <stop offset="0.55" stop-color="white" stop-opacity="0"/>
      <stop offset="1" stop-color="black" stop-opacity="0.10"/>
    </linearGradient>
  </defs>
`;

const concepts = {
  // A: Manila folder tab silhouette on terracotta — the most literal mark.
  // A solid cream/manila folder shape with a slight tab visible at top,
  // centered on a terracotta squircle.
  'A-folder-tab': `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${LIFT}
  <rect width="1024" height="1024" fill="${TERRA}"/>
  <rect width="1024" height="1024" fill="url(#lift)"/>
  <!-- Folder tab (smaller rect on top) -->
  <rect x="306" y="280" width="244" height="76" rx="22" fill="${MANILA}"/>
  <!-- Folder body (larger rect under tab) -->
  <rect x="240" y="334" width="544" height="436" rx="32" fill="${MANILA}"/>
  <!-- Subtle inner shadow on folder -->
  <rect x="240" y="334" width="544" height="40" rx="0" fill="${MANILA_DEEP}" opacity="0.4"/>
</svg>`,

  // B: Folded corner / dog-ear — a single rectangle (folder face) with the
  // top-right corner flipped down to reveal terracotta beneath.
  'B-folded-corner': `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${LIFT}
  <rect width="1024" height="1024" fill="${TERRA}"/>
  <rect width="1024" height="1024" fill="url(#lift)"/>
  <!-- Main folder face with rounded corners, but cut off at top-right -->
  <path fill="${MANILA}" d="
    M 296 280
    Q 268 280, 268 308
    L 268 716
    Q 268 744, 296 744
    L 728 744
    Q 756 744, 756 716
    L 756 396
    L 612 280
    Z
  "/>
  <!-- The folded corner (smaller triangle) showing back of paper -->
  <path fill="${MANILA_DEEP}" d="
    M 612 280
    L 756 396
    L 612 396
    Z
  "/>
</svg>`,

  // C: Custom "M" letterform built from two folder-tab shapes side by side.
  // Reads as both an M and as filed paperwork.
  'C-folder-M': `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${LIFT}
  <rect width="1024" height="1024" fill="${TERRA}"/>
  <rect width="1024" height="1024" fill="url(#lift)"/>
  <!-- Two folder shapes overlapping to form M -->
  <g fill="${MANILA}">
    <!-- Left folder body -->
    <rect x="260" y="320" width="220" height="400" rx="28"/>
    <!-- Right folder body -->
    <rect x="544" y="320" width="220" height="400" rx="28"/>
    <!-- Connecting "V" via two angled rectangles forming the middle of M -->
    <path d="
      M 384 320
      L 480 320
      L 540 540
      L 480 540
      Z
    "/>
    <path d="
      M 544 320
      L 640 320
      L 580 540
      L 540 540
      Z
    "/>
  </g>
</svg>`,

  // D: Minimalist — just a manila-colored squircle with a thin terracotta
  // tab at the top, debossed/peeking out. Most Apple-restrained option.
  'D-minimal-tab': `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${LIFT}
  <rect width="1024" height="1024" fill="${MANILA}"/>
  <rect width="1024" height="1024" fill="url(#lift)"/>
  <!-- Tab at top -->
  <rect x="360" y="280" width="240" height="60" rx="14" fill="${TERRA}"/>
  <!-- Subtle horizontal line below tab suggesting the folder body edge -->
  <rect x="240" y="380" width="544" height="2" rx="1" fill="${TERRA}" opacity="0.18"/>
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
