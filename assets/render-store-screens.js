// Generates App Store marketing screenshots for Manila at 1290x2796 (6.7").
// Each composition: a soft background, a two-line headline, and a faithful
// reconstruction of the screen in a bezel-less rounded "device" with shadow.
//
// These are MARKETING mockups built from the real theme tokens — not live
// captures. Swap to real device captures later if you want pixel-exact, but
// these are upload-ready and on-brand.

const fs = require('fs');
const path = require('path');
const { Resvg } = require('@resvg/resvg-js');

const OUT = path.join(__dirname, 'store-screens');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT);

// Theme (from lib/theme.ts)
const C = {
  bg: '#FAFAF7',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F2EC',
  border: '#ECE9E1',
  text: '#1B1B1B',
  textMuted: '#6B6B6B',
  textSubtle: '#9A968B',
  accent: '#C6633A',
  accentSoft: '#F4E3D7',
  success: '#3F7D5C',
  manila: '#E8D2A6',
};

const W = 1290;
const H = 2796;
const FONT = 'DejaVu Sans';

// Device geometry
const DEV_W = 1080;
const DEV_X = (W - DEV_W) / 2;
const DEV_Y = 880;
const DEV_H = H - DEV_Y - 90;
const DEV_R = 96;
const PAD = 72; // inner screen padding

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function text(x, y, s, { size = 40, weight = 400, fill = C.text, anchor = 'start', spacing = 0, family = FONT } = {}) {
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ''}>${esc(s)}</text>`;
}

function rrect(x, y, w, h, r, fill, extra = '') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" ${extra}/>`;
}

// Compose one screenshot: bg color, headline lines, and screen-content SVG.
function compose({ bg, headlineColor, lines, screenInner }) {
  const headline = lines
    .map((ln, i) => text(W / 2, 250 + i * 96, ln, { size: 78, weight: 700, fill: headlineColor, anchor: 'middle', spacing: -1 }))
    .join('');

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${bg}"/>
  ${headline}
  <!-- device shadow -->
  <rect x="${DEV_X}" y="${DEV_Y + 10}" width="${DEV_W}" height="${DEV_H}" rx="${DEV_R}" fill="#000" opacity="0.10"/>
  <!-- device screen -->
  <rect x="${DEV_X}" y="${DEV_Y}" width="${DEV_W}" height="${DEV_H}" rx="${DEV_R}" fill="${C.bg}"/>
  <defs><clipPath id="screen"><rect x="${DEV_X}" y="${DEV_Y}" width="${DEV_W}" height="${DEV_H}" rx="${DEV_R}"/></clipPath></defs>
  <g clip-path="url(#screen)">${screenInner}</g>
</svg>`;
}

// ---- Screen content builders (origin-relative helpers) ----
// Coordinates are within the device; sx/sy translate to screen space.
const sx = (x) => DEV_X + x;
const sy = (y) => DEV_Y + y;

function chip(x, y, label, { active = false, w } = {}) {
  const width = w ?? (label.length * 22 + 64);
  const bg = active ? C.text : C.surface;
  const fg = active ? C.bg : C.text;
  const border = active ? C.text : C.border;
  return `${rrect(sx(x), sy(y), width, 72, 36, bg, `stroke="${border}" stroke-width="2"`)}
    ${text(sx(x) + width / 2, sy(y) + 47, label, { size: 30, weight: 600, fill: fg, anchor: 'middle' })}`;
}

function circleBtn(x, y) {
  return rrect(sx(x), sy(y), 80, 80, 40, C.surface, `stroke="${C.border}" stroke-width="2"`);
}

// SCREEN 1 — Home
function home() {
  const innerW = DEV_W - PAD * 2;
  let s = '';
  // header
  s += circleBtn(PAD, 70);
  // magnifier glyph
  s += `<circle cx="${sx(PAD + 33)}" cy="${sy(105)}" r="16" fill="none" stroke="${C.text}" stroke-width="5"/>`;
  s += `<line x1="${sx(PAD + 46)}" y1="${sy(118)}" x2="${sx(PAD + 58)}" y2="${sy(130)}" stroke="${C.text}" stroke-width="5" stroke-linecap="round"/>`;
  s += circleBtn(DEV_W - PAD - 80, 70);
  s += text(sx(DEV_W - PAD - 40), sy(122), '⚙', { size: 40, anchor: 'middle', fill: C.text });
  // project chips
  s += chip(PAD, 200, 'Evi Studio', { active: true });
  s += chip(PAD + 280, 200, '123 Main St');
  // eyebrow + total
  s += text(sx(PAD), sy(380), 'TOTAL · 2026', { size: 30, weight: 600, fill: C.textMuted, spacing: 2 });
  s += text(sx(PAD), sy(510), '$48,212', { size: 150, weight: 700, fill: C.text, spacing: -3 });
  // year chips
  s += chip(PAD, 580, '2026', { active: false, w: 110 });
  s += rrect(sx(PAD), sy(580), 110, 72, 36, C.accent);
  s += text(sx(PAD + 55), sy(627), '2026', { size: 30, weight: 700, fill: '#fff', anchor: 'middle' });
  s += chip(PAD + 130, 580, '2025', { w: 110 });
  s += chip(PAD + 260, 580, '2024', { w: 110 });
  // category rows with bars
  const cats = [
    ['Supplies', '$18,420', 1.0],
    ['Repairs', '$12,650', 0.69],
    ['Utilities', '$8,100', 0.44],
    ['Insurance', '$5,900', 0.32],
    ['Cleaning', '$3,142', 0.17],
  ];
  let cy = 760;
  for (const [name, amt, frac] of cats) {
    s += text(sx(PAD), sy(cy + 34), name, { size: 38, weight: 400, fill: C.text });
    s += text(sx(DEV_W - PAD), sy(cy + 34), amt, { size: 38, weight: 700, fill: C.text, anchor: 'end' });
    s += rrect(sx(PAD), sy(cy + 58), innerW, 6, 3, C.surfaceAlt);
    s += rrect(sx(PAD), sy(cy + 58), innerW * frac, 6, 3, C.accent);
    cy += 116;
  }
  // FAB
  const fabR = 92;
  s += `<circle cx="${sx(DEV_W - PAD - 10)}" cy="${sy(DEV_H - 150)}" r="${fabR / 2 + 30}" fill="${C.accent}"/>`;
  // camera glyph
  const fcx = sx(DEV_W - PAD - 10), fcy = sy(DEV_H - 150);
  s += `<rect x="${fcx - 34}" y="${fcy - 22}" width="68" height="52" rx="12" fill="none" stroke="#fff" stroke-width="5"/>`;
  s += `<circle cx="${fcx}" cy="${fcy + 4}" r="16" fill="none" stroke="#fff" stroke-width="5"/>`;
  return s;
}

// SCREEN 2 — AI extraction (scanning receipt)
function capture() {
  let s = '';
  s += rrect(DEV_X, DEV_Y, DEV_W, DEV_H, DEV_R, C.bg);
  // centered receipt
  const rw = 520, rh = 680;
  const rx = sx((DEV_W - rw) / 2), ry = sy(420);
  s += rrect(rx, ry, rw, rh, 28, C.surfaceAlt);
  // receipt "lines"
  s += rrect(rx + 60, ry + 70, 200, 38, 8, '#D9CFC0'); // logo block
  let ly = ry + 170;
  const widths = [380, 300, 340, 260, 360, 220];
  for (const w of widths) { s += rrect(rx + 60, ly, w, 16, 6, '#DDD4C6'); ly += 54; }
  s += rrect(rx + 60, ly + 30, 400, 26, 8, '#CFC4B2'); // total line
  // scan line + glow
  const scanY = ry + 430;
  s += rrect(rx, scanY, rw, 56, 0, C.accent, 'opacity="0.18"');
  s += `<rect x="${rx}" y="${scanY}" width="${rw}" height="4" fill="${C.accent}"/>`;
  // corner brackets
  const br = 36, bw = 6;
  const corners = [[rx + 14, ry + 14, 1, 1], [rx + rw - 14 - br, ry + 14, -1, 1], [rx + 14, ry + rh - 14 - br, 1, -1], [rx + rw - 14 - br, ry + rh - 14 - br, -1, -1]];
  for (const [cx2, cy2, hx, hy] of corners) {
    s += `<line x1="${cx2}" y1="${hy > 0 ? cy2 : cy2 + br}" x2="${cx2 + br}" y2="${hy > 0 ? cy2 : cy2 + br}" stroke="${C.accent}" stroke-width="${bw}"/>`;
    s += `<line x1="${hx > 0 ? cx2 : cx2 + br}" y1="${cy2}" x2="${hx > 0 ? cx2 : cx2 + br}" y2="${cy2 + br}" stroke="${C.accent}" stroke-width="${bw}"/>`;
  }
  // step text
  s += text(sx(DEV_W / 2), ry + rh + 110, 'Pulling the total…', { size: 44, weight: 400, fill: C.text, anchor: 'middle' });
  // dots
  const dotsY = ry + rh + 180;
  const dotXs = [-110, -55, 0, 55, 110];
  dotXs.forEach((dx, i) => {
    const active = i === 2;
    const done = i < 2;
    if (active) s += rrect(sx(DEV_W / 2) + dx - 27, dotsY, 54, 14, 7, C.accent);
    else s += `<circle cx="${sx(DEV_W / 2) + dx}" cy="${dotsY + 7}" r="7" fill="${done ? C.accent : C.border}"/>`;
  });
  return s;
}

// SCREEN 3 — Expense detail
function detail() {
  let s = '';
  s += circleBtn(PAD, 70);
  s += text(sx(PAD + 40), sy(122), '←', { size: 44, anchor: 'middle', fill: C.text });
  s += text(sx(DEV_W - PAD), sy(120), 'Delete', { size: 34, fill: C.accent, anchor: 'end' });
  // amount
  s += text(sx(PAD), sy(290), '$74.03', { size: 120, weight: 700, fill: C.text, spacing: -2 });
  s += text(sx(PAD + 430), sy(290), 'USD', { size: 50, weight: 600, fill: C.textMuted });
  // title
  s += text(sx(PAD), sy(390), 'Home Depot — Plants', { size: 48, weight: 600, fill: C.text });
  // meta card
  const cardY = 470, cardH = 380;
  s += rrect(sx(PAD), sy(cardY), DEV_W - PAD * 2, cardH, 32, C.surface, `stroke="${C.border}" stroke-width="2"`);
  const rows = [['Date', 'May 22, 2026'], ['Category', 'Supplies'], ['Project', 'Evi Studio']];
  let ry = cardY + 90;
  rows.forEach(([k, v], i) => {
    s += text(sx(PAD + 50), sy(ry), k, { size: 34, fill: C.textMuted });
    s += text(sx(DEV_W - PAD - 50), sy(ry), v, { size: 36, fill: C.text, anchor: 'end' });
    if (i < 2) s += `<line x1="${sx(PAD + 50)}" y1="${sy(ry + 45)}" x2="${sx(DEV_W - PAD - 50)}" y2="${sy(ry + 45)}" stroke="${C.border}" stroke-width="2"/>`;
    ry += 122;
  });
  // RECEIPT eyebrow + thumbnail
  s += text(sx(DEV_W / 2), sy(cardY + cardH + 110), 'RECEIPT', { size: 28, weight: 600, fill: C.textMuted, anchor: 'middle', spacing: 3 });
  const tw = 300, th = 396;
  const tx = sx((DEV_W - tw) / 2), ty = sy(cardY + cardH + 160);
  s += rrect(tx, ty, tw, th, 28, C.surfaceAlt);
  s += rrect(tx + 40, ty + 50, 130, 26, 6, '#D9CFC0');
  let tl = ty + 130; for (const w of [200, 150, 180, 120]) { s += rrect(tx + 40, tl, w, 12, 6, '#DDD4C6'); tl += 44; }
  return s;
}

// SCREEN 4 — Search
function search() {
  let s = '';
  // search pill
  s += rrect(sx(PAD), sy(90), DEV_W - PAD * 2 - 150, 84, 42, C.surfaceAlt);
  s += `<circle cx="${sx(PAD + 48)}" cy="${sy(132)}" r="16" fill="none" stroke="${C.textMuted}" stroke-width="5"/>`;
  s += `<line x1="${sx(PAD + 60)}" y1="${sy(144)}" x2="${sx(PAD + 72)}" y2="${sy(156)}" stroke="${C.textMuted}" stroke-width="5" stroke-linecap="round"/>`;
  s += text(sx(PAD + 90), sy(146), 'depot', { size: 38, fill: C.text });
  s += text(sx(DEV_W - PAD - 60), sy(146), 'Cancel', { size: 36, fill: C.accent, anchor: 'end' });
  // filter pills
  s += chip(PAD, 220, 'Evi Studio', { active: true });
  s += chip(PAD + 280, 220, 'All years', { w: 200 });
  // results
  const results = [
    ['Home Depot — Plants', 'Evi Studio · Supplies · May 22', '$74.03'],
    ['Home Depot — Lumber', 'Evi Studio · Repairs · Apr 03', '$211.40'],
    ['Home Depot — Paint', '123 Main St · Repairs · Mar 19', '$58.20'],
  ];
  let ry = 380;
  for (const [title, meta, amt] of results) {
    // bold "Depot" inside title by splitting
    s += text(sx(PAD), sy(ry + 40), title, { size: 40, fill: C.textMuted });
    s += text(sx(PAD), sy(ry + 90), meta, { size: 28, fill: C.textMuted });
    s += text(sx(DEV_W - PAD), sy(ry + 40), amt, { size: 40, weight: 700, fill: C.text, anchor: 'end' });
    s += `<line x1="${sx(PAD)}" y1="${sy(ry + 130)}" x2="${sx(DEV_W - PAD)}" y2="${sy(ry + 130)}" stroke="${C.border}" stroke-width="2"/>`;
    ry += 170;
  }
  return s;
}

// SCREEN 5 — Category drill-down
function category() {
  let s = '';
  s += circleBtn(PAD, 70);
  s += text(sx(PAD + 40), sy(122), '←', { size: 44, anchor: 'middle', fill: C.text });
  s += text(sx(PAD), sy(280), 'SUPPLIES · 2026', { size: 32, weight: 600, fill: C.textMuted, spacing: 2 });
  s += text(sx(PAD), sy(410), '$18,420', { size: 140, weight: 700, fill: C.text, spacing: -3 });
  s += text(sx(PAD), sy(490), '24 receipts', { size: 40, fill: C.textMuted });
  const rows = [
    ['Home Depot — Plants', 'May 22, 2026', '$74.03'],
    ['Lowe’s — Mulch', 'May 14, 2026', '$133.88'],
    ['Ace — Fasteners', 'May 02, 2026', '$21.40'],
    ['Costco — Bulk Soil', 'Apr 28, 2026', '$248.10'],
  ];
  let ry = 600;
  for (const [title, date, amt] of rows) {
    s += text(sx(PAD), sy(ry + 40), title, { size: 40, fill: C.text });
    s += text(sx(PAD), sy(ry + 86), date, { size: 28, fill: C.textMuted });
    s += text(sx(DEV_W - PAD), sy(ry + 40), amt, { size: 40, weight: 700, fill: C.text, anchor: 'end' });
    s += `<line x1="${sx(PAD)}" y1="${sy(ry + 126)}" x2="${sx(DEV_W - PAD)}" y2="${sy(ry + 126)}" stroke="${C.border}" stroke-width="2"/>`;
    ry += 166;
  }
  return s;
}

const screens = [
  { file: '1-home', bg: C.accentSoft, headlineColor: C.text, lines: ['Every receipt,', 'sorted for tax time.'], inner: home },
  { file: '2-capture', bg: C.bg, headlineColor: C.accent, lines: ['Snap it.', 'The AI reads it.'], inner: capture },
  { file: '3-detail', bg: C.surfaceAlt, headlineColor: C.text, lines: ['Fix anything', 'with a tap.'], inner: detail },
  { file: '4-search', bg: C.accentSoft, headlineColor: C.text, lines: ['Find any receipt', 'in seconds.'], inner: search },
  { file: '5-category', bg: C.bg, headlineColor: C.text, lines: ['See where', 'every dollar goes.'], inner: category },
];

for (const sc of screens) {
  const svg = compose({ bg: sc.bg, headlineColor: sc.headlineColor, lines: sc.lines, screenInner: sc.inner() });
  const png = new Resvg(svg, { font: { loadSystemFonts: true }, fitTo: { mode: 'width', value: W } }).render().asPng();
  const out = path.join(OUT, `${sc.file}.png`);
  fs.writeFileSync(out, png);
  console.log(`Wrote ${out} (${(png.length / 1024).toFixed(0)} KB)`);
}
