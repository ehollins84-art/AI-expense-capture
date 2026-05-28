// Generates the production icon set for Manila (folder tab on terracotta).
//
// Outputs:
//   assets/icon.png             — 1024x1024 iOS + Android base icon
//   assets/adaptive-icon.png    — 1024x1024 Android adaptive foreground (folder
//                                 scaled into the safe zone so OS masks don't clip)
//   assets/splash-icon.png      — 1024x1024 splash artwork on cream
//   assets/favicon.png          —   48x48   web favicon

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const ROOT = __dirname;

const CREAM = '#FAFAF7';
const TERRA = '#C6633A';
const MANILA = '#E8D2A6';
const MANILA_DEEP = '#C8A877';

const LIFT = `
  <defs>
    <linearGradient id="lift" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="white" stop-opacity="0.07"/>
      <stop offset="0.55" stop-color="white" stop-opacity="0"/>
      <stop offset="1" stop-color="black" stop-opacity="0.10"/>
    </linearGradient>
  </defs>
`;

// The Manila folder mark. Sized to fit in a 1024 viewbox.
// Tab on top, folder body underneath.
function folder({
  cx = 512,
  cy = 512,
  width = 544,
  tabWidth = 244,
  tabHeight = 76,
  bodyHeight = 436,
  fill = MANILA,
  tabFill,
  topShadow = true,
}) {
  const tabFillResolved = tabFill ?? fill;
  const left = cx - width / 2;
  const top = cy - (tabHeight + bodyHeight) / 2;
  const tabLeft = cx - tabWidth / 2;
  const bodyTop = top + tabHeight - 2; // overlap by 2pt to avoid hairline gap
  const shadow = topShadow
    ? `<rect x="${left}" y="${bodyTop}" width="${width}" height="40" fill="${MANILA_DEEP}" opacity="0.35"/>`
    : '';
  return `
    <g>
      <rect x="${tabLeft}" y="${top}" width="${tabWidth}" height="${tabHeight}" rx="22" fill="${tabFillResolved}"/>
      <rect x="${left}" y="${bodyTop}" width="${width}" height="${bodyHeight}" rx="32" fill="${fill}"/>
      ${shadow}
    </g>
  `;
}

function iconSVG() {
  return `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${LIFT}
  <rect width="1024" height="1024" fill="${TERRA}"/>
  <rect width="1024" height="1024" fill="url(#lift)"/>
  ${folder({})}
</svg>`;
}

// Adaptive icon (Android): folder rendered on transparent so the OS-applied
// background shows through. Scaled to fit within the ~66% safe zone so
// circular/squircle/teardrop masks never clip the folder.
function adaptiveSVG() {
  return `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${folder({
    width: 380,
    tabWidth: 170,
    tabHeight: 54,
    bodyHeight: 304,
    topShadow: false,
  })}
</svg>`;
}

// Splash: same icon artwork inside an iOS-style squircle plate, centered on
// the cream splash background. Expo composites this onto backgroundColor
// from app.json at runtime.
function splashSVG() {
  return `
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  ${LIFT}
  <defs>
    <clipPath id="squircle">
      <rect x="232" y="232" width="560" height="560" rx="124" ry="124"/>
    </clipPath>
  </defs>
  <g clip-path="url(#squircle)">
    <rect x="232" y="232" width="560" height="560" fill="${TERRA}"/>
    <rect x="232" y="232" width="560" height="560" fill="url(#lift)"/>
    ${folder({
      width: 300,
      tabWidth: 134,
      tabHeight: 42,
      bodyHeight: 240,
    })}
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
