/**
 * Parametric coat body.
 *
 * The torso is a stack of super-ellipse cross-sections whose half-width,
 * half-depth and forward offset vary with height (shoulders → chest → waist
 * suppression → skirt flare). Because the surface is analytic we can answer
 * "where is the cloth at (x, y)?" exactly, which lets every insignia wrap onto
 * the curved front instead of floating as a flat card.
 *
 * Everything is in inches. +x = wearer's left, +y up, +z toward the viewer.
 *
 * The `BodySurface` interface is what the decals use. A sculpted Blender
 * model (GLB) can implement the same interface by ray-casting, so the layout
 * engine and decals don't change when the model does (see docs/3d-model.md).
 */
import * as THREE from 'three';
import type { CoatGeometry } from '../regs/layout';
import { armPoint, buildArm, type ArmSweep } from './arm';

export interface SurfaceHit {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
}

export interface BodySurface {
  /** front of the torso at (x, y) */
  front(x: number, y: number): SurfaceHit;
  /** a point on a sleeve: `along` inches below the shoulder seam, `around` radians from straight outward (+ toward the front) */
  sleeve(side: 1 | -1, along: number, around: number): SurfaceHit;
  /** a point on the top of the shoulder: `t` inches out from the neck end of the shoulder loop */
  shoulder(side: 1 | -1, t: number, zOff?: number): SurfaceHit;
  /** optional: a sleeve point `across` inches around the surface from straight outward (+ toward the front) */
  sleeveAcross?(side: 1 | -1, along: number, across: number): SurfaceHit;
}

const smooth = (a: number, b: number, t: number) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
/** piecewise-smooth interpolation through [y, value] keys (y ascending) */
function profile(keys: [number, number][], y: number) {
  if (y <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [y1, v1] = keys[i];
    const [y0, v0] = keys[i - 1];
    if (y <= y1) return v0 + (v1 - v0) * smooth(y0, y1, y);
  }
  return keys[keys.length - 1][1];
}

export interface BodyParams {
  g: CoatGeometry;
  hem: number;
  top: number;
  neckR: number;
  shoulderRise: number;
  n: number;
  hw: (y: number) => number;
  hd: (y: number) => number;
  cz: (y: number) => number;
  /** height of the torso's shoulder cap at |x| (rises toward the neck) */
  capY: (absX: number) => number;
  /** the shoulder + sleeve tube for each side */
  arm: (side: 1 | -1) => ArmSweep;
  /** front-back semi-axis of the sleeve at `along` (arc length per radian around the outer side) */
  sleeveR: (along: number) => number;
}

export function bodyParams(g: CoatGeometry, male: boolean): BodyParams {
  const top = g.top;
  const hem = g.top - g.height;
  const W = g.width / 2;
  const D = g.depth / 2;
  // [y, value] keys from hem to shoulder line
  const hwKeys: [number, number][] = male
    ? [[hem, W - 0.2], [hem + 9, W - 1.3], [hem + 13, W - 1.5], [top - 12, W - 0.2], [top - 4, W], [top, W - 0.6]]
    : [[hem, W + 0.4], [hem + 7, W - 1.4], [hem + 11, W - 1.7], [top - 10, W - 0.3], [top - 3, W - 0.3], [top, W - 0.8]];
  const hdKeys: [number, number][] = male
    ? [[hem, D - 0.6], [hem + 12, D - 1.0], [top - 11, D], [top - 3, D - 0.4], [top, D - 1.6]]
    : [[hem, D - 0.4], [hem + 10, D - 1.0], [top - 9, D + 0.2], [top - 3, D - 0.4], [top, D - 1.5]];
  const czKeys: [number, number][] = [[hem, 0], [top - 12, 0.4], [top - 4, 0.2], [top, -0.3]];

  const neckR = male ? 2.6 : 2.3;
  const shoulderRise = 1.9;
  const hw = (y: number) => profile(hwKeys, y);
  const cz = (y: number) => profile(czKeys, y);
  const span = hw(top) + 0.8 - neckR;
  const capY = (absX: number) => top + shoulderRise * Math.pow(1 - Math.min(1, Math.max(0, (absX - neckR) / span)), 1.3);

  // shoulder + sleeve tube (control points for the wearer's left; mirrored for the right)
  const k = male ? 1 : 0.9; // female coat: smaller sleeve
  const czTop = cz(top) * 0.5;
  const x0 = neckR + 0.7;
  const x1 = W - 2.4;
  const bend: [number, number, number] = [W + 0.55 * k, top - 2.6 * k, czTop - 0.1];
  const L = g.sleeveLength;
  const armSpec = (side: 1 | -1) => ({
    side,
    points: [
      [x0, capY(x0) - 0.55, czTop],
      [x1, capY(x1) - 0.95 * k, czTop],
      [W - 0.4, top - 0.7 * k, czTop],
      bend,
      [bend[0] + 0.15, bend[1] - L * 0.19, bend[2] + 0.2],
      [bend[0], bend[1] - L * 0.48, bend[2] + 0.5],
      [bend[0] - 0.05, bend[1] - L * 0.69, bend[2] + 1.5],
      [bend[0] + 0.15, bend[1] - L * 0.9, bend[2] + 2.7],
    ] as [number, number, number][],
    a: [0.55, 1.0 * k, 1.5 * k, 2.45 * k, 2.5 * k, 2.3 * k, 2.15 * k, 2.0 * k],
    b: [1.3, 2.4 * k, 2.7 * k, 2.7 * k, 2.6 * k, 2.4 * k, 2.25 * k, 2.1 * k],
    bendIndex: 3,
    seamT: 0.35,
    sleeveLength: L,
  });
  const arms = new Map<number, ArmSweep>();
  const arm = (side: 1 | -1) => {
    let a = arms.get(side);
    if (!a) {
      a = buildArm(armSpec(side));
      arms.set(side, a);
    }
    return a;
  };
  const sleeveR = (along: number) => {
    const a = arm(1);
    return a.frame(a.sForAlong(along)).bb;
  };

  return {
    g,
    hem,
    top,
    neckR,
    shoulderRise,
    n: 2.7,
    hw,
    hd: (y) => profile(hdKeys, y),
    cz,
    capY,
    arm,
    sleeveR,
  };
}

// ------------------------------------------------------------- analytic surface

export function analyticSurface(p: BodyParams): BodySurface {
  const frontZ = (x: number, y: number) => {
    const w = p.hw(y);
    const ax = Math.min(0.999, Math.abs(x) / w);
    return p.cz(y) + p.hd(y) * Math.pow(1 - Math.pow(ax, p.n), 1 / p.n);
  };
  const e = 0.05;
  const front = (x: number, y: number): SurfaceHit => {
    const yy = Math.min(y, p.top);
    const z = frontZ(x, yy);
    const dzdx = (frontZ(x + e, yy) - frontZ(x - e, yy)) / (2 * e);
    const dzdy = (frontZ(x, yy + e) - frontZ(x, yy - e)) / (2 * e);
    return { pos: new THREE.Vector3(x, yy, z), normal: new THREE.Vector3(-dzdx, -dzdy, 1).normalize() };
  };

  const sleeve = (side: 1 | -1, along: number, around: number): SurfaceHit => {
    const arm = p.arm(side);
    return armPoint(arm.frame(arm.sForAlong(along)), around);
  };

  const shoulder = (side: 1 | -1, t: number, zOff = 0): SurfaceHit => {
    const x = p.neckR + 0.9 + t;
    const arm = p.arm(side);
    const f = arm.frame(arm.sForX(x));
    // top of the elliptical section, offset front/back across the loop
    const z = Math.max(-f.bb * 0.95, Math.min(f.bb * 0.95, zOff));
    const lift = f.a * Math.sqrt(Math.max(0, 1 - (z / f.bb) ** 2));
    const pos = f.c.clone().addScaledVector(f.n, lift).addScaledVector(f.b, z);
    return { pos, normal: f.n.clone() };
  };

  return { front, sleeve, shoulder };
}

// ------------------------------------------------------------- geometry

/**
 * Torso mesh. Front-facing vertices get UVs from their (x, y) position so the
 * tailoring-detail texture (lapels, pockets, seams) lines up with the layout
 * coordinates; group 0 = front half (detail material), group 1 = back.
 */
export function torsoGeometry(p: BodyParams, uvRect: { x0: number; y0: number; w: number; h: number }) {
  const segU = 128;
  const segV = 72;
  const capRings = 10;
  const pos: number[] = [];
  const uv: number[] = [];
  const ring = (y: number, scale = 1, lift = 0) => {
    const w = p.hw(y) * scale;
    const d = p.hd(y) * scale;
    const c = p.cz(y);
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= segU; i++) {
      const th = (i / segU) * Math.PI * 2;
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      const x = w * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / p.n);
      const z = c + d * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p.n);
      let yy = y;
      if (lift) {
        const span = p.hw(p.top) + 0.8 - p.neckR;
        yy = y + lift * p.shoulderRise * Math.pow(1 - Math.min(1, Math.max(0, (Math.abs(x) - p.neckR) / span)), 1.3);
      }
      pts.push([x, yy, z]);
    }
    return pts;
  };
  const rows: [number, number, number][][] = [];
  for (let j = 0; j <= segV; j++) rows.push(ring(p.hem + (j / segV) * (p.top - p.hem)));
  // shoulder cap: rings shrink toward the neck while rising
  for (let k = 1; k <= capRings; k++) {
    const s = 1 - (k / capRings) * (1 - (p.neckR / p.hw(p.top)) * 1.05);
    rows.push(ring(p.top, s, 1).map(([x, y, z]) => [x, y, z * (0.45 + 0.55 * s)]));
  }
  rows.forEach((r) =>
    r.forEach(([x, y, z]) => {
      pos.push(x, y, z);
      uv.push((x - uvRect.x0) / uvRect.w, (y - uvRect.y0) / uvRect.h);
    }),
  );
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const front: number[] = [];
  const back: number[] = [];
  const stride = segU + 1;
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      const isFront = Math.sin(((i + 0.5) / segU) * Math.PI * 2) > -0.02;
      (isFront ? front : back).push(a, c, b, b, c, d);
    }
  }
  geo.setIndex([...front, ...back]);
  geo.addGroup(0, front.length, 0);
  geo.addGroup(front.length, back.length, 1);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Make triangle winding agree with the supplied vertex normals. Mirrored
 * geometry (left vs right arm) otherwise ends up inside-out, and with
 * double-sided materials three.js then lights it from the inside (black).
 */
export function orientIndices(pos: number[], nor: number[], idx: number[]) {
  let score = 0;
  const v = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
  for (let t = 0; t < idx.length; t += 3 * Math.max(1, Math.floor(idx.length / 300))) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const face = new THREE.Vector3().crossVectors(v(b).sub(v(a)), v(c).sub(v(a)));
    score += face.dot(new THREE.Vector3(nor[a * 3], nor[a * 3 + 1], nor[a * 3 + 2]));
  }
  if (score < 0) for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
  return idx;
}

/** Shoulder + sleeve tube: elliptical sections swept along the arm curve. */
export function sleeveGeometry(p: BodyParams, side: 1 | -1) {
  const arm = p.arm(side);
  const segA = 56;
  const segL = 110;
  const pos: number[] = [];
  const nor: number[] = [];
  for (let j = 0; j <= segL; j++) {
    const f = arm.frame((j / segL) * arm.total);
    for (let i = 0; i <= segA; i++) {
      const h = armPoint(f, (i / segA) * Math.PI * 2);
      pos.push(h.pos.x, h.pos.y, h.pos.z);
      nor.push(h.normal.x, h.normal.y, h.normal.z);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < segL; j++)
    for (let i = 0; i < segA; i++) {
      const a = j * (segA + 1) + i;
      const c = a + segA + 1;
      idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  orientIndices(pos, nor, idx);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

/** Closes the cuff opening so the sleeve doesn't read as a hollow tube. */
export function cuffCap(p: BodyParams, side: 1 | -1) {
  const arm = p.arm(side);
  const f = arm.frame(arm.total - 0.2);
  const seg = 48;
  const pos: number[] = [f.c.x, f.c.y, f.c.z];
  for (let i = 0; i <= seg; i++) {
    const h = armPoint({ ...f, a: f.a * 0.97, bb: f.bb * 0.97 }, (i / seg) * Math.PI * 2);
    pos.push(h.pos.x, h.pos.y, h.pos.z);
  }
  const idx: number[] = [];
  for (let i = 1; i <= seg; i++) idx.push(0, i, i + 1);
  const nor: number[] = [];
  for (let i = 0; i < pos.length / 3; i++) nor.push(f.t.x, f.t.y, f.t.z);
  orientIndices(pos, nor, idx);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return geo;
}

/**
 * A grid patch conformed to the body surface. `place(u, v)` maps local patch
 * coordinates (inches, centered) to a surface hit.
 */
export function conformalPatch(
  w: number,
  h: number,
  place: (u: number, v: number) => SurfaceHit,
  offset: number,
  segs = 10,
) {
  const sx = segs;
  const sy = Math.max(2, Math.round((segs * h) / Math.max(w, 0.01)));
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  for (let j = 0; j <= sy; j++)
    for (let i = 0; i <= sx; i++) {
      const u = (i / sx - 0.5) * w;
      const v = (j / sy - 0.5) * h;
      const hit = place(u, v);
      const pnt = hit.pos.clone().addScaledVector(hit.normal, offset);
      pos.push(pnt.x, pnt.y, pnt.z);
      nor.push(hit.normal.x, hit.normal.y, hit.normal.z);
      uv.push(i / sx, j / sy);
    }
  const idx: number[] = [];
  for (let j = 0; j < sy; j++)
    for (let i = 0; i < sx; i++) {
      const a = j * (sx + 1) + i;
      const c = a + sx + 1;
      idx.push(a, a + 1, c, a + 1, c + 1, c);
    }
  orientIndices(pos, nor, idx);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}
