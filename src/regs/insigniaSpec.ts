/**
 * Physical dimensions of sewn-on enlisted insignia, from DA PAM 670-1
 * (26 Jan 2021) paras 21-7b (grade insignia), 21-28a–b (service stripes) and
 * 21-29a–b (overseas service bars). All values in inches. Both the layout
 * engine (how big the item is on the sleeve) and the texture code (how it's
 * drawn) use these, so the drawing can't drift from the spec.
 */
import type { Rank } from './types';

export interface ChevronSpec {
  width: number;
  /** width of each chevron and arc */
  band: number;
  /** space between chevrons and arcs */
  gap: number;
  /** edging around the entire insignia */
  edge: number;
}

/** 21-7b(1)(a) large: 5/16" bands, 3/16" spaces, 3" wide, 1/8" edging. 21-7b(2)(a) small: 1/4", 5/32", 2-1/2". */
export const chevronSpec = (small: boolean): ChevronSpec =>
  small ? { width: 2.5, band: 0.25, gap: 5 / 32, edge: 0.125 } : { width: 3, band: 5 / 16, gap: 3 / 16, edge: 0.125 };

type Pt = [number, number];

/** Offset a polyline by `d` along its "downward" normal (y grows downward). */
function offsetPolyline(pts: Pt[], d: number): Pt[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b[0] - a[0];
    let ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    // perpendicular pointing to +y
    let nx = -ty;
    let ny = tx;
    if (ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return [p[0] + nx * d, p[1] + ny * d];
  });
}

/**
 * Geometry of a chevron insignia (x = 0 at center, y = 0 at the top, y down).
 * Proportions measured from the issued insignia: chevron arms are steep near
 * the point and flatten toward the sides; chevrons and arcs are parallel
 * offsets of one base curve, one band + one space apart (21-7b), cut by the
 * straight sides of the patch. Returns centerlines as polylines that run past
 * the sides; the drawing clips them to the patch.
 */
export function chevronGeometry(rank: Rank, small: boolean) {
  const s = chevronSpec(small);
  const ch = rank.chevrons ?? { up: 0, rockers: 0 };
  const W = s.width;
  const pitch = s.band + s.gap;
  const hw = W / 2;
  const reach = hw + s.band * 1.5; // run past the sides before clipping
  const u = W / 3; // proportions measured on a 3-inch insignia

  // base chevron centerline, left arm from the apex outward (quadratic bezier, concave)
  const apex0 = s.edge + s.band / 2 + 0.17 * u;
  const side: Pt = [-reach, apex0 + 1.62 * u + (reach - 1.6 * u) * 0.577];
  const ctrl: Pt = [-1.06 * u, apex0 + 1.31 * u - 0.82 * u + 0.82 * u];
  const leftArm: Pt[] = Array.from({ length: 41 }, (_, i) => {
    const t = i / 40;
    const x = (1 - t) ** 2 * 0 + 2 * (1 - t) * t * ctrl[0] + t * t * side[0];
    const y = (1 - t) ** 2 * apex0 + 2 * (1 - t) * t * ctrl[1] + t * t * side[1];
    return [x, y];
  });
  const chevron = (k: number): Pt[] => {
    const arm = offsetPolyline(leftArm, k * pitch);
    // trim where the offset arm crosses the centerline, then mirror
    const out: Pt[] = [];
    for (let i = 0; i < arm.length; i++) {
      const p = arm[i];
      if (p[0] <= 0) out.push(p);
      else if (i + 1 < arm.length && arm[i + 1][0] <= 0) {
        const q = arm[i + 1];
        const t = p[0] / (p[0] - q[0]);
        out.push([0, p[1] + (q[1] - p[1]) * t]);
      }
    }
    if (out[0][0] !== 0) out.unshift([0, out[0][1] - 1e-3]);
    const left = out.reverse(); // side → apex
    return [...left, ...left.slice(0, -1).reverse().map(([x, y]) => [-x, y] as Pt)];
  };
  const chevrons = Array.from({ length: ch.up }, (_, k) => chevron(k));
  const apexY = (pl: Pt[]) => Math.min(...pl.map((p) => p[1]));

  // base arc: parabola dipping ~1 inch from the sides to the center
  const dip = 1.02 * u;
  const lastApex = chevrons.length ? apexY(chevrons[chevrons.length - 1]) : apex0;
  // y of a polyline where it crosses x (interpolated)
  const yAt = (pl: Pt[], x: number) => {
    for (let i = 0; i + 1 < pl.length; i++) {
      const [x1, y1] = pl[i];
      const [x2, y2] = pl[i + 1];
      if ((x1 - x) * (x2 - x) <= 0 && x1 !== x2) return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
    }
    return pl[0][1];
  };
  const lastSide = chevrons.length ? yAt(chevrons[chevrons.length - 1], -hw) : apex0;
  // arc sits under the chevrons: proportional spacing, but never with its ends above the last chevron's ends
  // the top arc's ends meet the last chevron's ends at the sides (as on the issued PFC and SFC insignia)
  const rocker0Center = Math.max(lastApex + 1.71 * u, lastSide + dip * (hw / (1.6 * u)) ** 2);
  const baseArc: Pt[] = Array.from({ length: 41 }, (_, i) => {
    const x = -reach + (2 * reach * i) / 40;
    return [x, rocker0Center - dip * (x / (1.6 * u)) ** 2];
  });
  const rockers = Array.from({ length: ch.rockers }, (_, j) => offsetPolyline(baseArc, j * pitch));

  const lowest = (pl: Pt[]) => Math.max(...pl.filter((p) => Math.abs(p[0]) <= hw).map((p) => p[1]));
  const last = rockers.length ? rockers[rockers.length - 1] : chevrons[chevrons.length - 1];
  const height = last ? lowest(last) + s.band / 2 + s.edge + (rockers.length ? 0 : 0.1) : 1;
  const hasField = rockers.length > 0;
  const fieldCenter = hasField ? (lastApex + s.band + rocker0Center - s.band) / 2 + 0.1 * u : 0;
  return { s, hw, chevrons, rockers, height, width: W, fieldCenter, hasField };
}

export function chevronSize(rank: Rank, small: boolean): { w: number; h: number } {
  // Specialist: 2-7/8 in wide (large) or 2-1/2 in (small), spade-shaped (21-7b(1)(b), (2)(b))
  if (rank.chevrons?.device === 'eagle' && rank.chevrons.up === 0) return small ? { w: 2.5, h: 2.95 } : { w: 2.875, h: 3.4 };
  const g = chevronGeometry(rank, small);
  return { w: g.width, h: g.height };
}

/** One embroidered stripe/bar plus its background border. 21-28a/b, 21-29a/b. */
export interface StripeSpec {
  length: number;
  width: number;
  border: number;
  /** space between stripes */
  spacing: number;
}

export const serviceStripeSpec = (small: boolean, uniform: 'AGSU' | 'ASU'): StripeSpec => ({
  length: small ? 1.25 : 1 + 5 / 16,
  width: small ? 5 / 32 : 3 / 16,
  border: small ? 5 / 64 : 3 / 32,
  spacing: uniform === 'AGSU' ? 1 / 8 : 1 / 16,
});

/** 21-29a large bar 3/16 x 1-5/16; 21-29b small bar 5/32 x 13/32 (as printed). */
export const overseasBarSpec = (small: boolean): StripeSpec => ({
  length: small ? 13 / 32 : 1 + 5 / 16,
  width: small ? 5 / 32 : 3 / 16,
  border: small ? 5 / 64 : 3 / 32,
  spacing: 1 / 16,
});

/** ASU 45°, AGSU 30° (21-28c). */
export const stripeAngle = (uniform: 'AGSU' | 'ASU') => (uniform === 'AGSU' ? 30 : 45);

/** Bounding box of a stack of `n` diagonal service stripes. */
export function serviceStripesSize(n: number, small: boolean, uniform: 'AGSU' | 'ASU') {
  const sp = serviceStripeSpec(small, uniform);
  const a = (stripeAngle(uniform) * Math.PI) / 180;
  const pl = sp.length + 2 * sp.border; // patch length
  const pw = sp.width + 2 * sp.border; // patch width
  const pitch = (pw + sp.spacing) / Math.cos(a); // vertical distance between stripes
  return { w: pl * Math.cos(a) + pw * Math.sin(a), h: pl * Math.sin(a) + pw * Math.cos(a) + (n - 1) * pitch, pitch, angle: a, pl, pw };
}

export function overseasBarsSize(n: number, small: boolean) {
  const sp = overseasBarSpec(small);
  const pw = sp.width + 2 * sp.border;
  return { w: sp.length + 2 * sp.border, h: n * pw + (n - 1) * sp.spacing, pw };
}
