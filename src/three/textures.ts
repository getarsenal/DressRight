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

function drawChevrons(rank: Rank, uniform: 'AGSU' | 'ASU', wIn: number, hIn: number) {
  const { c, ctx, W, H } = canvas(wIn, hIn);
  const bg = uniform === 'ASU' ? '#16203a' : '#3a3828';
  const fg = metal(ctx, H, GOLD);
  const ch = rank.chevrons!;
  if (ch.device === 'eagle' && ch.up === 0) {
    // Specialist
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(W * 0.1, H * 0.25);
    ctx.lineTo(W * 0.5, H * 0.05);
    ctx.lineTo(W * 0.9, H * 0.25);
    ctx.lineTo(W * 0.9, H * 0.6);
    ctx.quadraticCurveTo(W * 0.5, H * 0.95, W * 0.1, H * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = fg;
    ctx.lineWidth = W * 0.03;
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(W * 0.5, H * 0.25);
    ctx.lineTo(W * 0.7, H * 0.45);
    ctx.lineTo(W * 0.5, H * 0.6);
    ctx.lineTo(W * 0.3, H * 0.45);
    ctx.closePath();
    ctx.fill();
    return c;
  }
  const lw = H * 0.085;
  const gap = H * 0.035;
  ctx.lineCap = 'butt';
  for (let i = 0; i < ch.up; i++) {
    const y = H * 0.12 + i * (lw + gap);
    ctx.strokeStyle = bg;
    ctx.lineWidth = lw + 6;
    ctx.beginPath();
    ctx.moveTo(W * 0.05, y + H * 0.28);
    ctx.lineTo(W * 0.5, y);
    ctx.lineTo(W * 0.95, y + H * 0.28);
    ctx.stroke();
    ctx.strokeStyle = fg;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
  for (let i = 0; i < ch.rockers; i++) {
    const y = H * 0.62 + i * (lw + gap);
    ctx.strokeStyle = bg;
    ctx.lineWidth = lw + 6;
    ctx.beginPath();
    ctx.moveTo(W * 0.05, y - H * 0.08);
    ctx.quadraticCurveTo(W * 0.5, y + H * 0.14, W * 0.95, y - H * 0.08);
    ctx.stroke();
    ctx.strokeStyle = fg;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
  if (ch.device && ch.device !== 'none') {
    const cy = H * 0.58;
    ctx.fillStyle = fg;
    if (ch.device === 'diamond') {
      ctx.beginPath();
      ctx.moveTo(W / 2, cy - H * 0.1);
      ctx.lineTo(W / 2 + H * 0.07, cy);
      ctx.lineTo(W / 2, cy + H * 0.1);
      ctx.lineTo(W / 2 - H * 0.07, cy);
      ctx.closePath();
      ctx.fill();
    } else {
      star(ctx, W / 2, cy, H * 0.09);
      if (ch.device === 'wreath-star') {
        ctx.strokeStyle = fg;
        ctx.lineWidth = H * 0.025;
        ctx.beginPath();
        ctx.arc(W / 2, cy, H * 0.13, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
      }
    }
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
      c = drawChevrons(spec.rank, spec.uniform, wIn, hIn);
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
        case 'serviceStripes':
          ctx.fillStyle = metal(ctx, H, GOLD);
          for (let i = 0; i < spec.count; i++) {
            ctx.save();
            ctx.translate(W / 2, H - (i + 0.5) * (H / spec.count));
            ctx.rotate(-Math.PI / 4);
            ctx.fillStyle = spec.uniform === 'ASU' ? '#16203a' : '#3a3828';
            ctx.fillRect(-W * 0.48, -H * 0.06 - 3, W * 0.96, H * 0.12 / Math.max(1, spec.count / 2) + 6);
            ctx.fillStyle = metal(ctx, H, GOLD);
            ctx.fillRect(-W * 0.45, -H * 0.06, W * 0.9, H * 0.12 / Math.max(1, spec.count / 2));
            ctx.restore();
          }
          break;
        case 'overseasBars':
          for (let i = 0; i < spec.count; i++) {
            const bh = H / spec.count;
            ctx.fillStyle = metal(ctx, H, GOLD);
            ctx.fillRect(0, i * bh + bh * 0.2, W, bh * 0.55);
          }
          break;
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
