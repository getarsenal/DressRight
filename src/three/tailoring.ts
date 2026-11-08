/**
 * Tailoring detail texture for the coat front, drawn in layout inches.
 * Produces a color map and a matching bump map (raised lapels and flaps,
 * recessed seams) that are UV-mapped onto the front of the torso.
 */
import * as THREE from 'three';
import type { Build } from '../regs/build';
import type { CoatGeometry } from '../regs/layout';
import type { BodyParams } from './body';

export const FABRIC = { AGSU: '#4a4733', ASU: '#1d2747' } as const;
const SHIRT = { AGSU: '#cdbb9b', ASU: '#f3f3f1' } as const;
const TIE = { AGSU: '#3a3626', ASU: '#121212' } as const;
const PPI = 48;

export interface DetailMaps {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  rect: { x0: number; y0: number; w: number; h: number };
}

const shade = (hex: string, k: number) => {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return `#${c.getHexString()}`;
};

/** Outline of one lapel + collar (side 1 = wearer's left), in inches. */
export function lapelPoints(g: CoatGeometry, p: BodyParams, side: 1 | -1): [number, number][] {
  const neckTop = p.top + p.shoulderRise * 0.92;
  const pts: [number, number][] = [
    [p.neckR * 0.72, neckTop],
    [0, g.topButtonY],
    [g.notchX + 1.4, g.notchY + 0.2],
    [g.notchX + 0.8, g.notchY],
    [g.notchX + 1.6, g.notchY + 1.0],
    [p.neckR + 1.5, p.top + p.shoulderRise * 0.55],
    [p.neckR + 0.2, neckTop + 0.1],
  ];
  return pts.map(([x, y]) => [side * x, y]);
}

export function tailoringMaps(b: Pick<Build, 'uniform' | 'sex'>, g: CoatGeometry, p: BodyParams): DetailMaps {
  const xMax = Math.max(p.hw(p.hem), g.width / 2) + 1.5;
  const rect = { x0: -xMax, y0: p.hem - 0.5, w: xMax * 2, h: p.top + p.shoulderRise + 1 - (p.hem - 0.5) };
  const W = Math.round(rect.w * PPI);
  const H = Math.round(rect.h * PPI);
  const make = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  };
  const cc = make();
  const bc = make();
  const ctx = cc.getContext('2d')!;
  const bx = bc.getContext('2d')!;
  const X = (x: number) => (x - rect.x0) * PPI;
  const Y = (y: number) => (rect.y0 + rect.h - y) * PPI;
  const fabric = FABRIC[b.uniform];
  const male = b.sex === 'male';
  const agsu = b.uniform === 'AGSU';

  // ---- base cloth with a fine twill
  ctx.fillStyle = fabric;
  ctx.fillRect(0, 0, W, H);
  bx.fillStyle = '#808080';
  bx.fillRect(0, 0, W, H);
  for (let i = -H; i < W; i += 3) {
    ctx.strokeStyle = 'rgba(255,255,255,0.025)';
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + H, H);
    ctx.stroke();
    bx.strokeStyle = 'rgba(0,0,0,0.06)';
    bx.beginPath();
    bx.moveTo(i, 0);
    bx.lineTo(i + H, H);
    bx.stroke();
  }

  const path = (c: CanvasRenderingContext2D, pts: [number, number][]) => {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y))));
    c.closePath();
  };
  const stitch = (c: CanvasRenderingContext2D, color: string, pts: [number, number][], close = true, width = 1.2) => {
    c.save();
    c.strokeStyle = color;
    c.lineWidth = width;
    c.setLineDash([3, 2]);
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(X(x), Y(y)) : c.moveTo(X(x), Y(y))));
    if (close) c.closePath();
    c.stroke();
    c.restore();
  };
  const seam = (pts: [number, number][]) => {
    ctx.save();
    ctx.strokeStyle = shade(fabric, 0.72);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.stroke();
    ctx.restore();
    bx.save();
    bx.strokeStyle = '#4a4a4a';
    bx.lineWidth = 2;
    bx.beginPath();
    pts.forEach(([x, y], i) => (i ? bx.lineTo(X(x), Y(y)) : bx.moveTo(X(x), Y(y))));
    bx.stroke();
    bx.restore();
  };

  // ---- side seams / darts
  [1, -1].forEach((s) => {
    seam([
      [s * (p.hw(p.top - 6) - 2.2), p.top - 6],
      [s * (p.hw(p.hem + 12) - 1.4), p.hem + 12],
      [s * (p.hw(p.hem) - 1.0), p.hem],
    ]);
  });

  // ---- front opening (top panel overlaps toward the wearer's right on men's coats)
  const ov = male ? -1 : 1;
  const tb = g.topButtonY;
  const edge: [number, number][] = [
    [0, tb],
    [ov * 0.9, tb - 0.8],
    [ov * 0.9, p.hem + 2],
    [ov * 1.6, p.hem],
  ];
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = ov * 2;
  seam(edge);
  ctx.restore();

  // ---- shirt and tie in the V
  const neckTop = p.top + p.shoulderRise * 0.92;
  path(ctx, [
    [-p.neckR * 0.74, neckTop + 0.4],
    [p.neckR * 0.74, neckTop + 0.4],
    [0, tb],
  ]);
  ctx.fillStyle = SHIRT[b.uniform];
  ctx.fill();
  // collar points
  ctx.strokeStyle = shade(SHIRT[b.uniform], 0.8);
  ctx.lineWidth = 1.5;
  [1, -1].forEach((s) => {
    path(ctx, [
      [s * 0.25, neckTop - 0.3],
      [s * p.neckR * 0.7, neckTop + 0.3],
      [s * 1.0, neckTop - 2.3],
    ]);
    ctx.stroke();
  });
  ctx.fillStyle = TIE[b.uniform];
  path(ctx, [
    [-0.45, neckTop - 0.4],
    [0.45, neckTop - 0.4],
    [0.3, neckTop - 1.3],
    [0.75, tb + 2.5],
    [0, tb + 1.2],
    [-0.75, tb + 2.5],
    [-0.3, neckTop - 1.3],
  ]);
  ctx.fill();
  bx.fillStyle = '#5a5a5a';
  path(bx, [
    [-p.neckR, neckTop + 0.4],
    [p.neckR, neckTop + 0.4],
    [0, tb],
  ]);
  bx.fill();

  // ---- lapels + collar
  [1, -1].forEach((s) => {
    const pts = lapelPoints(g, p, s as 1 | -1);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
    ctx.shadowOffsetX = s * 2;
    path(ctx, pts);
    ctx.fillStyle = shade(fabric, 1.07);
    ctx.fill();
    ctx.restore();
    // roll highlight along the inner edge
    const grad = ctx.createLinearGradient(X(pts[0][0]), 0, X(pts[2][0]), 0);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(1, 'rgba(0,0,0,0.06)');
    path(ctx, pts);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = shade(fabric, 0.62);
    ctx.lineWidth = 1.8;
    ctx.stroke();
    stitch(ctx, shade(fabric, 0.8), pts.map(([x, y]) => [x - s * 0.15 * Math.sign(x || s), y]), true, 1);
    // gorge seam (collar meets lapel at the notch)
    seam([
      [s * (g.notchX + 0.8), g.notchY],
      [s * (p.neckR * 0.9), g.notchY + 2.4],
    ]);
    path(bx, pts);
    bx.fillStyle = '#b4b4b4';
    bx.fill();
    bx.strokeStyle = '#3c3c3c';
    bx.lineWidth = 3;
    bx.stroke();
  });

  // ---- pockets
  const flapShape = (cx: number, top: number, w: number, fh: number, point: number): [number, number][] => [
    [cx - w / 2 - 0.1, top],
    [cx + w / 2 + 0.1, top],
    [cx + w / 2 + 0.1, top - fh + 0.3],
    [cx, top - fh - point],
    [cx - w / 2 - 0.1, top - fh + 0.3],
  ];
  const flap = (pts: [number, number][]) => {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 4;
    path(ctx, pts);
    ctx.fillStyle = shade(fabric, 1.05);
    ctx.fill();
    ctx.restore();
    path(ctx, pts);
    ctx.strokeStyle = shade(fabric, 0.6);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    stitch(ctx, shade(fabric, 0.8), pts.map(([x, y], i) => [x + (i === 0 ? 0.15 : i === 1 ? -0.15 : 0), y - (i < 2 ? 0.15 : -0.15)]));
    path(bx, pts);
    bx.fillStyle = '#b0b0b0';
    bx.fill();
    bx.strokeStyle = '#404040';
    bx.lineWidth = 2.5;
    bx.stroke();
  };
  const patch = (cx: number, top: number, w: number, h: number, pleat: boolean) => {
    const pts: [number, number][] = [
      [cx - w / 2, top],
      [cx + w / 2, top],
      [cx + w / 2, top - h],
      [cx - w / 2, top - h],
    ];
    path(ctx, pts);
    ctx.strokeStyle = shade(fabric, 0.66);
    ctx.lineWidth = 1.6;
    ctx.stroke();
    stitch(ctx, shade(fabric, 0.82), pts.map(([x, y], i) => [x + (i === 0 || i === 3 ? 0.15 : -0.15), y + (i < 2 ? 0 : 0.15)]));
    path(bx, pts);
    bx.fillStyle = '#909090';
    bx.fill();
    bx.strokeStyle = '#484848';
    bx.lineWidth = 2;
    bx.stroke();
    if (pleat) {
      [-0.75, 0.75].forEach((o) => seam([[cx + o, top], [cx + o, top - h]]));
    }
  };

  if (g.pocket) {
    [1, -1].forEach((s) => {
      const pk = g.pocket!;
      const cx = s * pk.cx;
      if (pk.style === 'flap') {
        patch(cx, pk.top - 0.2, pk.width, pk.height, pk.pleat);
        flap(flapShape(cx, pk.top, pk.width, pk.flap, 0.35));
      } else {
        // welt pocket
        path(ctx, [
          [cx - pk.width / 2, pk.top],
          [cx + pk.width / 2, pk.top],
          [cx + pk.width / 2, pk.top - 0.35],
          [cx - pk.width / 2, pk.top - 0.35],
        ]);
        ctx.strokeStyle = shade(fabric, 0.6);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
  }
  // lower pockets
  const lw = male ? 5.8 : 4.9;
  const ly = tb - (male ? 6.6 : 7.4);
  [1, -1].forEach((s) => {
    const cx = s * (male ? 4.9 : 4.1);
    if (agsu) {
      patch(cx, ly - 0.3, lw, male ? 6.4 : 4.6, false);
      flap(flapShape(cx, ly, lw, 2.4, 0.3));
    } else {
      flap(flapShape(cx, ly, lw, 2.1, 0));
    }
  });

  const map = new THREE.CanvasTexture(cc);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(bc);
  return { map, bump, rect };
}

/** Points where buttons sit, so geometry buttons line up with the drawing. */
export function buttonSpots(b: Pick<Build, 'uniform' | 'sex'>, g: CoatGeometry): [number, number, number][] {
  const male = b.sex === 'male';
  const out: [number, number, number][] = g.buttons.map((y) => [0, y, 0.42]);
  if (g.pocket?.style === 'flap') [1, -1].forEach((s) => out.push([s * g.pocket!.cx, g.pocket!.top - g.pocket!.flap - 0.0, 0.3]));
  const ly = g.topButtonY - (male ? 6.6 : 7.4);
  [1, -1].forEach((s) => out.push([s * (male ? 4.9 : 4.1), ly - (b.uniform === 'AGSU' ? 2.25 : 1.95), 0.32]));
  return out;
}
