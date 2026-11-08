/**
 * Procedural canvas textures for every placed item. Everything is stylized
 * (not official artwork) so the app needs no licensed assets; DUI/SSI/patch
 * art can be replaced by uploads.
 */
import * as THREE from 'three';
import type { InsigniaArt } from '../regs/build';
import type { Rank } from '../regs/types';
import type { RackRibbon, TextureSpec } from '../regs/layout';
import { rackRows } from '../regs/layout';
import { artImage, artVersion } from '../ui/art';
import { chevronGeometry, overseasBarSpec, serviceStripeSpec, serviceStripesSize } from '../regs/insigniaSpec';

const PPI = 96; // pixels per inch
const cache = new Map<string, THREE.CanvasTexture>();

const GOLD = ['#f7e08a', '#c9a227', '#8a6d12'];
const SILVER = ['#f4f6f8', '#b8bec6', '#6f7782'];
const BRONZE = '#a0682a';

function metal(ctx: CanvasRenderingContext2D, h: number, stops: string[]) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, stops[0]);
  g.addColorStop(0.5, stops[1]);
  g.addColorStop(1, stops[2]);
  return g;
}

function canvas(wIn: number, hIn: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(8, Math.round(wIn * PPI));
  c.height = Math.max(8, Math.round(hIn * PPI));
  const ctx = c.getContext('2d')!;
  return { c, ctx, W: c.width, H: c.height };
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.42 : r;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ------------------------------------------------------------------ ribbons

function drawRibbon(ctx: CanvasRenderingContext2D, r: RackRibbon, x: number, y: number, w: number, h: number) {
  const img = r.id ? artImage(r.id) : undefined;
  if (img) {
    ctx.drawImage(img, x, y, w, h);
    drawDevices(ctx, r, x, y, w, h);
    return;
  }
  const total = r.stripes.reduce((s, [, n]) => s + n, 0);
  let cx = x;
  r.stripes.forEach(([col, n]) => {
    const sw = (n / total) * w;
    ctx.fillStyle = col;
    ctx.fillRect(cx, y, sw + 0.5, h);
    cx += sw;
  });
  // subtle weave shading
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  if (r.framed) {
    ctx.strokeStyle = GOLD[1];
    ctx.lineWidth = h * 0.12;
    ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
  }
  drawDevices(ctx, r, x, y, w, h);
}

const DEVICE_ART: Partial<Record<string, string>> = {
  olc: 'OLC_BRONZE',
  star: 'STAR_BRONZE',
  knot: 'KNOT_BRONZE',
  V: 'V_BRONZE',
  C: 'C_DEVICE',
  R: 'R_DEVICE',
  M: 'M_DEVICE',
  hourglass: 'HOURGLASS_BRONZE',
  arrowhead: 'ARROWHEAD',
};

export function drawDevices(ctx: CanvasRenderingContext2D, r: RackRibbon, x: number, y: number, w: number, h: number) {
  const n = Math.min(r.count ?? 0, 4);
  if (!r.device || !n) return;
  const cy = y + h / 2;
  const s = h * 0.32;
  const positions = Array.from({ length: n }, (_, i) => x + w / 2 + (i - (n - 1) / 2) * s * 2.4);
  const devArt = r.device !== 'numeral' && DEVICE_ART[r.device] ? artImage(DEVICE_ART[r.device]!) : undefined;
  if (devArt) {
    const dh = h * 0.8;
    const dw = (devArt.naturalWidth / devArt.naturalHeight) * dh;
    positions.forEach((px) => ctx.drawImage(devArt, px - dw / 2, cy - dh / 2, dw, dh));
    return;
  }
  ctx.fillStyle = r.device === 'star' ? BRONZE : r.device === 'knot' ? GOLD[1] : BRONZE;
  switch (r.device) {
    case 'olc':
      positions.forEach((px) => {
        ctx.beginPath();
        ctx.ellipse(px, cy, s * 1.1, s * 0.6, -0.4, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    case 'star':
      positions.forEach((px) => star(ctx, px, cy, s));
      break;
    case 'knot':
      ctx.strokeStyle = GOLD[1];
      ctx.lineWidth = s * 0.35;
      positions.forEach((px) => {
        ctx.beginPath();
        ctx.ellipse(px, cy, s * 0.9, s * 0.55, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      break;
    case 'numeral':
      ctx.fillStyle = GOLD[1];
      ctx.font = `bold ${h * 0.8}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(r.count), x + w / 2, cy + 1);
      break;
    default: {
      ctx.fillStyle = BRONZE;
      ctx.font = `bold ${h * 0.75}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const letter = r.device === 'hourglass' ? '⧗' : r.device === 'arrowhead' ? '▲' : r.device;
      ctx.fillText(letter, x + w / 2, cy + 1);
    }
  }
}

function drawRack(spec: Extract<TextureSpec, { type: 'rack' }>, wIn: number, hIn: number) {
  const { c, ctx, W, H } = canvas(wIn, hIn);
  const rows = rackRows(spec.ribbons, spec.perRow);
  const rh = H / rows.length;
  const rw = W / Math.min(spec.perRow, spec.ribbons.length);
  rows.forEach((row, ri) => {
    const offset = (W - row.length * rw) / 2;
    row.forEach((rb, i) => {
      // Within a row, higher precedence sits to the wearer's right (viewer's left).
      drawRibbon(ctx, rb, offset + i * rw, ri * rh, rw, rh);
    });
  });
  return c;
}

// ------------------------------------------------------------------ badges

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Artwork ids to try for a badge, most specific first (see manifest schema). */
export function badgeArtIds(id: string, level?: string, levels?: string[]) {
  const ids: string[] = [];
  if (level && levels?.includes(level)) ids.push(`${id}__${slug(level)}`);
  ids.push(id);
  return ids;
}

function drawImageFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, W: number, H: number) {
  const s = Math.min(W / img.naturalWidth, H / img.naturalHeight);
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

function drawBadge(spec: Extract<TextureSpec, { type: 'badge' }>, wIn: number, hIn: number) {
  const { c, ctx, W, H } = canvas(wIn, hIn);
  const d = spec.def;
  for (const id of badgeArtIds(d.id, spec.level, d.levels)) {
    const img = artImage(id);
    if (img) {
      drawImageFit(ctx, img, W, H);
      return c;
    }
  }
  const stops = d.metal === 'gold' ? GOLD : d.metal === 'oxidized' ? ['#d8d0c0', '#8c8270', '#4b4436'] : SILVER;
  ctx.fillStyle = metal(ctx, H, stops);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 2;

  if (d.kind === 'combat' || d.id === 'EIB') {
    // rectangle with rifle, wreath arc for combat badges
    const bw = W * 0.8;
    const bh = H * 0.32;
    roundRect(ctx, (W - bw) / 2, H * 0.12, bw, bh, 3);
    ctx.fillStyle = d.metal === 'blue-silver' ? '#2f6fb3' : metal(ctx, H, stops);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = metal(ctx, H, SILVER);
    ctx.fillRect(W * 0.18, H * 0.25, W * 0.64, H * 0.06);
    if (d.kind === 'combat') {
      ctx.strokeStyle = metal(ctx, H, SILVER);
      ctx.lineWidth = H * 0.1;
      ctx.beginPath();
      ctx.arc(W / 2, H * 0.1, W * 0.36, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
      const awards = spec.level ? parseInt(spec.level, 10) - 1 : 0;
      ctx.fillStyle = metal(ctx, H, SILVER);
      for (let i = 0; i < awards; i++) star(ctx, W / 2 + (i - (awards - 1) / 2) * W * 0.12, H * 0.08, H * 0.09);
    }
  } else if (d.kind === 'id' || d.kind === 'foreign') {
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.44, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    // wings: parachutist/aviator/etc and marksmanship
    if (d.kind === 'marksmanship') {
      roundRect(ctx, W * 0.15, H * 0.05, W * 0.7, H * 0.45, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(W * 0.3, H * 0.55, W * 0.4, H * 0.12);
      ctx.fillRect(W * 0.47, H * 0.5, W * 0.06, H * 0.35);
      ctx.fillRect(W * 0.25, H * 0.8, W * 0.5, H * 0.14);
    } else {
      ctx.beginPath();
      ctx.moveTo(W * 0.5, H * 0.2);
      ctx.quadraticCurveTo(W * 0.15, H * 0.05, W * 0.02, H * 0.5);
      ctx.quadraticCurveTo(W * 0.25, H * 0.65, W * 0.5, H * 0.85);
      ctx.quadraticCurveTo(W * 0.75, H * 0.65, W * 0.98, H * 0.5);
      ctx.quadraticCurveTo(W * 0.85, H * 0.05, W * 0.5, H * 0.2);
      ctx.fill();
      ctx.stroke();
      const lvl = d.levels?.indexOf(spec.level ?? '') ?? -1;
      if (lvl >= 1) {
        ctx.fillStyle = metal(ctx, H, SILVER);
        star(ctx, W / 2, H * 0.12, H * 0.12);
        if (lvl === 2) {
          ctx.strokeStyle = metal(ctx, H, SILVER);
          ctx.lineWidth = H * 0.05;
          ctx.beginPath();
          ctx.arc(W / 2, H * 0.12, H * 0.2, Math.PI * 0.1, Math.PI * 0.9);
          ctx.stroke();
        }
      }
    }
  }
  ctx.fillStyle = '#1b1b1b';
  ctx.font = `bold ${Math.min(H * 0.24, (W / Math.max(4, d.label.length)) * 1.5)}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(d.label, W / 2, d.kind === 'combat' || d.id === 'EIB' ? H * 0.72 : H * 0.52);
  if (d.kind === 'marksmanship' && spec.level) {
    ctx.font = `bold ${H * 0.13}px sans-serif`;
    ctx.fillStyle = '#111';
    ctx.fillText(spec.level.toUpperCase(), W / 2, H * 0.87);
  }
  return c;
}

// ------------------------------------------------------------------ insignia art (DUI / SSI)

function shapePath(ctx: CanvasRenderingContext2D, shape: InsigniaArt['shape'], W: number, H: number) {
  const m = Math.min(W, H) * 0.05;
  ctx.beginPath();
  switch (shape) {
    case 'circle':
      ctx.arc(W / 2, H / 2, Math.min(W, H) / 2 - m, 0, Math.PI * 2);
      break;
    case 'oval':
      ctx.ellipse(W / 2, H / 2, W / 2 - m, H / 2 - m, 0, 0, Math.PI * 2);
      break;
    case 'square':
      roundRect(ctx, m, m, W - 2 * m, H - 2 * m, W * 0.08);
      break;
    case 'arrowhead':
      ctx.moveTo(W / 2, m);
      ctx.lineTo(W - m, H * 0.35);
      ctx.lineTo(W * 0.8, H - m);
      ctx.lineTo(W * 0.2, H - m);
      ctx.lineTo(m, H * 0.35);
      ctx.closePath();
      break;
    default: // shield
      ctx.moveTo(m, m);
      ctx.lineTo(W - m, m);
      ctx.lineTo(W - m, H * 0.5);
      ctx.quadraticCurveTo(W - m, H * 0.85, W / 2, H - m);
      ctx.quadraticCurveTo(m, H * 0.85, m, H * 0.5);
      ctx.closePath();
  }
}

function drawArt(art: InsigniaArt, wIn: number, hIn: number, onUpdate: () => void) {
  const { c, ctx, W, H } = canvas(wIn, hIn);
  if (art.mode === 'upload' && art.dataUrl) {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(W / img.width, H / img.height);
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
      onUpdate();
    };
    img.src = art.dataUrl;
    return c;
  }
  shapePath(ctx, art.shape, W, H);
  ctx.fillStyle = art.field;
  ctx.fill();
  ctx.lineWidth = Math.min(W, H) * 0.06;
  ctx.strokeStyle = art.accent;
  ctx.stroke();
  ctx.save();
  shapePath(ctx, art.shape, W, H);
  ctx.clip();
  const g = ctx.createRadialGradient(W * 0.35, H * 0.3, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
  g.addColorStop(0, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0.2)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  ctx.fillStyle = art.accent;
  const t = art.text || '';
  const size = t.length <= 2 ? H * 0.5 : Math.min(H * 0.2, (W / t.length) * 1.6);
  ctx.font = `bold ${size}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(t, W / 2, H * 0.52);
  return c;
}

// ------------------------------------------------------------------ rank

/** Heritage tan 566 on heritage green 564 (AGSU); golden-light on Army blue (ASU). DA PAM 670-1 21-7b. */
const SEWN = {
  AGSU: { bg: '#2f4637', fg: ['#f0d08a', '#d9b468', '#b8924a'] },
  ASU: { bg: '#1b2748', fg: ['#f5dc8c', '#e0bd5c', '#b8933a'] },
} as const;

function drawChevrons(rank: Rank, uniform: 'AGSU' | 'ASU', small: boolean, wIn: number, hIn: number) {
  const { c, ctx, W, H } = canvas(wIn, hIn);
  const k = W / wIn; // px per inch
  const col = SEWN[uniform];
  const fg = (() => {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, col.fg[0]);
    g.addColorStop(0.5, col.fg[1]);
    g.addColorStop(1, col.fg[2]);
    return g;
  })();
  const ch = rank.chevrons!;

  if (ch.device === 'eagle' && ch.up === 0) {
    // Specialist: spade shape (broad arched top, concave sides to a point) with the eagle
    ctx.fillStyle = col.bg;
    ctx.beginPath();
    ctx.moveTo(W / 2, H);
    ctx.bezierCurveTo(W * 0.42, H * 0.78, W * 0.06, H * 0.56, 0, H * 0.41);
    ctx.bezierCurveTo(W * 0.02, H * 0.14, W * 0.26, 0, W / 2, 0);
    ctx.bezierCurveTo(W * 0.74, 0, W * 0.98, H * 0.14, W, H * 0.41);
    ctx.bezierCurveTo(W * 0.94, H * 0.56, W * 0.58, H * 0.78, W / 2, H);
    ctx.fill();
    drawEagle(ctx, W / 2, H * 0.37, W * 0.8, fg);
    return c;
  }

  const geo = chevronGeometry(rank, small);
  const X = (x: number) => W / 2 + x * k;
  const Y = (y: number) => y * k;
  const { band, edge } = geo.s;
  const trace = (pl: [number, number][], move = true) =>
    pl.forEach(([x, y], i) => (i === 0 && move ? ctx.moveTo(X(x), Y(y)) : ctx.lineTo(X(x), Y(y))));
  const strokeAll = (width: number, style: string | CanvasGradient) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width * k;
    [...geo.chevrons, ...geo.rockers].forEach((pl) => {
      ctx.beginPath();
      trace(pl);
      ctx.stroke();
    });
  };
  ctx.lineJoin = 'miter';
  ctx.miterLimit = 20;
  ctx.lineCap = 'butt';
  const clipTo = (inset: number) => {
    ctx.beginPath();
    ctx.rect(X(-geo.hw + inset), 0, (geo.width - 2 * inset) * k, H);
    ctx.clip();
  };

  // 1. background: bands widened by the edging (fills the spaces too) + the center field
  ctx.save();
  clipTo(0);
  strokeAll(band + 2 * edge, col.bg);
  if (geo.hasField && geo.chevrons.length) {
    ctx.fillStyle = col.bg;
    ctx.beginPath();
    trace(geo.chevrons[geo.chevrons.length - 1]);
    trace([...geo.rockers[0]].reverse(), false);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // 2. gold bands, inset by the edging at the sides
  ctx.save();
  clipTo(edge);
  strokeAll(band, fg);
  ctx.restore();

  // 3. center device (1SG lozenge, SGM star, CSM star in wreath)
  if (ch.device && ch.device !== 'none') {
    const cy = Y(geo.fieldCenter);
    const r = 0.26 * k;
    ctx.fillStyle = fg;
    if (ch.device === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(W / 2, cy - r * 1.3);
      ctx.lineTo(W / 2 + r * 0.8, cy);
      ctx.lineTo(W / 2, cy + r * 1.3);
      ctx.lineTo(W / 2 - r * 0.8, cy);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = col.bg; // "pierced" lozenge
      ctx.beginPath();
      ctx.moveTo(W / 2, cy - r * 0.55);
      ctx.lineTo(W / 2 + r * 0.32, cy);
      ctx.lineTo(W / 2, cy + r * 0.55);
      ctx.lineTo(W / 2 - r * 0.32, cy);
      ctx.closePath();
      ctx.fill();
    } else {
      star(ctx, W / 2, cy, r);
      if (ch.device === 'wreath-star') {
        ctx.strokeStyle = fg;
        ctx.lineWidth = 0.07 * k;
        ctx.beginPath();
        ctx.arc(W / 2, cy, r * 1.55, Math.PI * 0.12, Math.PI * 0.88);
        ctx.stroke();
      }
    }
  }
  return c;
}

/**
 * Stylized heraldic eagle for the Specialist insignia: raised wings, head
 * turned to its right, olive branch and arrows in the talons.
 */
function drawEagle(ctx: CanvasRenderingContext2D, cx: number, cy: number, span: number, fill: string | CanvasGradient) {
  const s = span / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = fill;
  ctx.strokeStyle = fill;
  // wings (mirrored), with feather tips
  [1, -1].forEach((d) => {
    ctx.beginPath();
    ctx.moveTo(d * s * 0.1, -s * 0.05);
    ctx.bezierCurveTo(d * s * 0.3, -s * 0.35, d * s * 0.55, -s * 0.62, d * s * 0.95, -s * 0.72);
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const x = d * s * (0.95 - t * 0.55);
      const y = -s * (0.72 - t * 0.62);
      ctx.lineTo(x - d * s * 0.04, y + s * 0.12);
      ctx.lineTo(x - d * s * 0.12, y + s * 0.1);
    }
    ctx.lineTo(d * s * 0.12, s * 0.12);
    ctx.closePath();
    ctx.fill();
  });
  // body and tail
  ctx.beginPath();
  ctx.ellipse(0, s * 0.08, s * 0.17, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.14, s * 0.32);
  ctx.lineTo(-s * 0.24, s * 0.62);
  ctx.lineTo(0, s * 0.52);
  ctx.lineTo(s * 0.24, s * 0.62);
  ctx.lineTo(s * 0.14, s * 0.32);
  ctx.closePath();
  ctx.fill();
  // head and beak, turned to the eagle's right (viewer's left)
  ctx.beginPath();
  ctx.arc(-s * 0.04, -s * 0.28, s * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-s * 0.12, -s * 0.3);
  ctx.lineTo(-s * 0.26, -s * 0.24);
  ctx.lineTo(-s * 0.12, -s * 0.2);
  ctx.fill();
  // olive branch (eagle's right) and arrows (eagle's left)
  ctx.lineWidth = s * 0.04;
  ctx.beginPath();
  ctx.moveTo(-s * 0.18, s * 0.3);
  ctx.quadraticCurveTo(-s * 0.5, s * 0.25, -s * 0.68, s * 0.05);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const t = 0.25 + i * 0.2;
    const x = -s * (0.18 + 0.5 * t);
    const y = s * (0.3 - 0.25 * t * t);
    ctx.beginPath();
    ctx.ellipse(x, y - s * 0.06, s * 0.035, s * 0.08, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(s * 0.18, s * 0.32);
    const ex = s * (0.6 + i * 0.06);
    const ey = s * (0.0 + i * 0.1);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - s * 0.09, ey + s * 0.01);
    ctx.lineTo(ex - s * 0.03, ey + s * 0.08);
    ctx.fill();
  }
  ctx.restore();
}

/** A stack of diagonal service stripes, lower end toward the front of the sleeve. 21-28. */
function drawServiceStripes(count: number, uniform: 'AGSU' | 'ASU', small: boolean, wIn: number, hIn: number) {
  const { c, ctx, W, H } = canvas(wIn, hIn);
  const k = W / wIn;
  const sp = serviceStripeSpec(small, uniform);
  const box = serviceStripesSize(1, small, uniform);
  const col = SEWN[uniform];
  const hb = (box.pl * Math.sin(box.angle) + box.pw * Math.cos(box.angle)) / 2;
  for (let i = 0; i < count; i++) {
    ctx.save();
    ctx.translate(W / 2, H - (hb + i * box.pitch) * k);
    ctx.rotate(-box.angle);
    ctx.fillStyle = col.bg;
    ctx.fillRect((-box.pl / 2) * k, (-box.pw / 2) * k, box.pl * k, box.pw * k);
    ctx.fillStyle = col.fg[1];
    ctx.fillRect((-sp.length / 2) * k, (-sp.width / 2) * k, sp.length * k, sp.width * k);
    ctx.restore();
  }
  return c;
}

/** Stack of horizontal overseas service bars, first bar at the bottom. 21-29. */
function drawOverseasBars(count: number, uniform: 'AGSU' | 'ASU', small: boolean, wIn: number, hIn: number) {
  const { c, ctx, W } = canvas(wIn, hIn);
  const k = W / wIn;
  const sp = overseasBarSpec(small);
  const pw = sp.width + 2 * sp.border;
  const col = SEWN[uniform];
  for (let i = 0; i < count; i++) {
    const top = hIn - pw - i * (pw + sp.spacing);
    ctx.fillStyle = col.bg;
    ctx.fillRect(0, top * k, W, pw * k);
    ctx.fillStyle = col.fg[1];
    ctx.fillRect(sp.border * k, (top + sp.border) * k, sp.length * k, sp.width * k);
  }
  return c;
}

function drawOfficerRank(rank: Rank, ctx: CanvasRenderingContext2D, W: number, H: number) {
  const silver = metal(ctx, H, SILVER);
  const gold = metal(ctx, H, GOLD);
  const id = rank.id;
  if (rank.category === 'warrant') {
    const n = id === 'WO1' ? 1 : parseInt(id.slice(2), 10) - 1;
    ctx.fillStyle = id === 'CW5' ? silver : id === 'WO1' ? silver : silver;
    roundRect(ctx, W * 0.32, H * 0.08, W * 0.36, H * 0.84, 4);
    ctx.fill();
    ctx.fillStyle = '#111';
    if (id === 'CW5') ctx.fillRect(W * 0.47, H * 0.12, W * 0.06, H * 0.76);
    else for (let i = 0; i < n; i++) ctx.fillRect(W * 0.38, H * (0.18 + i * 0.22), W * 0.24, H * 0.12);
    return;
  }
  switch (id) {
    case '2LT':
    case '1LT':
      ctx.fillStyle = id === '2LT' ? gold : silver;
      roundRect(ctx, W * 0.35, H * 0.08, W * 0.3, H * 0.84, 3);
      ctx.fill();
      break;
    case 'CPT':
      ctx.fillStyle = silver;
      roundRect(ctx, W * 0.18, H * 0.08, W * 0.24, H * 0.84, 3);
      ctx.fill();
      roundRect(ctx, W * 0.58, H * 0.08, W * 0.24, H * 0.84, 3);
      ctx.fill();
      break;
    case 'MAJ':
    case 'LTC':
      ctx.fillStyle = id === 'MAJ' ? gold : silver;
      ctx.beginPath();
      ctx.ellipse(W / 2, H / 2, W * 0.32, H * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2, H * 0.12);
      ctx.lineTo(W / 2, H * 0.88);
      ctx.stroke();
      break;
    case 'COL':
      ctx.fillStyle = silver;
      ctx.beginPath();
      ctx.moveTo(W * 0.5, H * 0.15);
      ctx.lineTo(W * 0.95, H * 0.3);
      ctx.lineTo(W * 0.6, H * 0.55);
      ctx.lineTo(W * 0.5, H * 0.9);
      ctx.lineTo(W * 0.4, H * 0.55);
      ctx.lineTo(W * 0.05, H * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    default: {
      const n = { BG: 1, MG: 2, LTG: 3, GEN: 4 }[id as 'BG'] ?? 1;
      ctx.fillStyle = silver;
      for (let i = 0; i < n; i++) star(ctx, W * (0.5 + (i - (n - 1) / 2) * (0.9 / Math.max(n, 2))), H / 2, Math.min(W / (n * 2.3), H * 0.42));
    }
  }
}

// ------------------------------------------------------------------ dispatcher

export function textureFor(spec: TextureSpec, wIn: number, hIn: number): THREE.CanvasTexture {
  const key = JSON.stringify([spec, wIn.toFixed(2), hIn.toFixed(2), artVersion()]);
  const hit = cache.get(key);
  if (hit) return hit;

  let tex: THREE.CanvasTexture | null = null;
  const update = () => {
    if (tex) tex.needsUpdate = true;
  };
  let c: HTMLCanvasElement;

  switch (spec.type) {
    case 'rack':
      c = drawRack(spec, wIn, hIn);
      break;
    case 'badge':
      c = drawBadge(spec, wIn, hIn);
      break;
    case 'art':
      c = drawArt(spec.art, wIn, hIn, update);
      break;
    case 'chevrons':
      c = drawChevrons(spec.rank, spec.uniform, spec.small, wIn, hIn);
      break;
    case 'serviceStripes':
      c = drawServiceStripes(spec.count, spec.uniform, spec.small, wIn, hIn);
      break;
    case 'overseasBars':
      c = drawOverseasBars(spec.count, spec.uniform, spec.small, wIn, hIn);
      break;
    default: {
      const k = canvas(wIn, hIn);
      c = k.c;
      const { ctx, W, H } = k;
      switch (spec.type) {
        case 'nameplate':
          ctx.fillStyle = '#0d0d0d';
          roundRect(ctx, 0, 0, W, H, H * 0.12);
          ctx.fill();
          ctx.strokeStyle = '#ddd';
          ctx.lineWidth = H * 0.06;
          roundRect(ctx, H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12, H * 0.1);
          ctx.stroke();
          ctx.fillStyle = '#fff';
          ctx.font = `bold ${H * 0.5}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(spec.text.slice(0, 18), W / 2, H * 0.54, W * 0.9);
          break;
        case 'disk': {
          ctx.fillStyle = metal(ctx, H, GOLD);
          ctx.beginPath();
          ctx.arc(W / 2, H / 2, W / 2 - 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = GOLD[2];
          ctx.lineWidth = W * 0.05;
          ctx.stroke();
          ctx.fillStyle = GOLD[2];
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `bold ${H * (spec.variant === 'us' ? 0.36 : 0.5)}px serif`;
          ctx.fillText(spec.variant === 'us' ? 'U.S.' : spec.branch.glyph, W / 2, H * 0.53);
          break;
        }
        case 'usLetters':
          ctx.fillStyle = metal(ctx, H, GOLD);
          ctx.font = `bold ${H * 0.9}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('U.S.', W / 2, H * 0.55);
          break;
        case 'branchPin':
          ctx.fillStyle = metal(ctx, H, GOLD);
          ctx.font = `bold ${H * 0.85}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(spec.branch.glyph, W / 2, H * 0.55);
          break;
        case 'officerRank':
          drawOfficerRank(spec.rank, ctx, W, H);
          break;
        case 'shoulderStrap': {
          ctx.fillStyle = '#16203a';
          roundRect(ctx, 0, 0, W, H, H * 0.45);
          ctx.fill();
          ctx.strokeStyle = metal(ctx, H, GOLD);
          ctx.lineWidth = H * 0.1;
          roundRect(ctx, H * 0.06, H * 0.06, W - H * 0.12, H - H * 0.12, H * 0.4);
          ctx.stroke();
          ctx.save();
          ctx.translate(W * 0.6, 0);
          drawOfficerRank(spec.rank, ctx, H * 0.9, H);
          ctx.restore();
          break;
        }
        case 'tab': {
          const tabImg = spec.id ? artImage(spec.id) : undefined;
          if (tabImg) {
            drawImageFit(ctx, tabImg, W, H);
            break;
          }
          const palette: Record<string, [string, string]> = {
            RANGER: ['#111', '#f1c40f'],
            'SPECIAL FORCES': ['#0b6e6e', '#f1c40f'],
            SAPPER: ['#111', '#fff'],
            "PRESIDENT'S HUNDRED": ['#b5a26a', '#111'],
            "GOVERNOR'S TWENTY": ['#1f3a93', '#f1c40f'],
            AIRBORNE: ['#111', '#f1c40f'],
          };
          const [bg, fg] = spec.color ? [spec.color, '#222'] : palette[spec.label] ?? ['#222', '#eee'];
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.moveTo(0, H * 0.25);
          ctx.quadraticCurveTo(W / 2, -H * 0.2, W, H * 0.25);
          ctx.lineTo(W, H);
          ctx.quadraticCurveTo(W / 2, H * 0.55, 0, H);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = fg;
          ctx.font = `bold ${Math.min(H * 0.45, (W / spec.label.length) * 1.5)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(spec.label, W / 2, H * 0.55);
          break;
        }
        case 'rdi':
          ctx.fillStyle = metal(ctx, H, GOLD);
          shapePath(ctx, 'shield', W, H);
          ctx.fill();
          ctx.fillStyle = spec.branch.primary;
          ctx.beginPath();
          ctx.arc(W / 2, H * 0.45, W * 0.22, 0, Math.PI * 2);
          ctx.fill();
          break;
      }
    }
  }

  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(key, tex);
  return tex;
}
