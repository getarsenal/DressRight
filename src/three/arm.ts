/**
 * Shoulder + sleeve as one continuous swept tube.
 *
 * The tube starts low on the shoulder near the collar (hidden inside the
 * torso), runs out along the shoulder line, rolls over the shoulder point and
 * hangs down as the sleeve. Its top surface is the shoulder line, so the
 * shoulder is rounded and padded and there is no open sleeve end to see into.
 *
 * Cross-sections are ellipses: semi-axis `a` along the frame normal N (up on
 * the shoulder, outward on the arm) and `b` along the binormal B (front-back).
 * Frames are rotation-minimizing (double reflection), so the tube doesn't
 * twist through the bend.
 */
import * as THREE from 'three';

export interface ArmFrame {
  c: THREE.Vector3;
  t: THREE.Vector3;
  n: THREE.Vector3;
  b: THREE.Vector3;
  a: number;
  bb: number;
}

export interface ArmSweep {
  total: number;
  /** arc length of the shoulder seam (where layout's `along` = 0) */
  sSeam: number;
  /** arc length where the sleeve reaches the bend (end of the shoulder top) */
  sBend: number;
  frame(s: number): ArmFrame;
  /** arc length for "inches below the shoulder seam" (0 … sleeveLength) */
  sForAlong(along: number): number;
  /** arc length on the shoulder top where the centerline is at |x| */
  sForX(absX: number): number;
}

export interface ArmSpec {
  side: 1 | -1;
  /** centerline control points for side = +1 (x is mirrored for side = -1) */
  points: [number, number, number][];
  /** semi-axis along N and along B at each control point */
  a: number[];
  b: number[];
  /** index of the control point at the bend, and the seam position between bend-1 and bend (0..1) */
  bendIndex: number;
  seamT: number;
  sleeveLength: number;
}

const SAMPLES = 400;

export function buildArm(spec: ArmSpec): ArmSweep {
  const pts = spec.points.map(([x, y, z]) => new THREE.Vector3(x * spec.side, y, z));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const total = curve.getLength();

  const P: THREE.Vector3[] = [];
  const T: THREE.Vector3[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    P.push(curve.getPointAt(i / SAMPLES));
    T.push(curve.getTangentAt(i / SAMPLES).normalize());
  }
  // rotation-minimizing frames (Wang et al., double reflection)
  const N: THREE.Vector3[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  N.push(up.clone().addScaledVector(T[0], -up.dot(T[0])).normalize());
  for (let i = 0; i < SAMPLES; i++) {
    const v1 = P[i + 1].clone().sub(P[i]);
    const c1 = v1.dot(v1) || 1e-9;
    const rL = N[i].clone().addScaledVector(v1, (-2 / c1) * v1.dot(N[i]));
    const tL = T[i].clone().addScaledVector(v1, (-2 / c1) * v1.dot(T[i]));
    const v2 = T[i + 1].clone().sub(tL);
    const c2 = v2.dot(v2);
    N.push(c2 < 1e-12 ? rL.normalize() : rL.addScaledVector(v2, (-2 / c2) * v2.dot(rL)).normalize());
  }
  // binormal pointing to the front (+z) at the start, kept consistent along the tube
  const flip = new THREE.Vector3().crossVectors(T[0], N[0]).z < 0 ? -1 : 1;
  const B = T.map((t, i) => new THREE.Vector3().crossVectors(t, N[i]).multiplyScalar(flip).normalize());

  // arc length of each control point (nearest sample)
  const sOf = (q: THREE.Vector3) => {
    let best = 0;
    let bd = Infinity;
    P.forEach((p, i) => {
      const d = p.distanceToSquared(q);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return (best / SAMPLES) * total;
  };
  const sKeys = pts.map(sOf);
  const lerpKeys = (vals: number[], s: number) => {
    if (s <= sKeys[0]) return vals[0];
    for (let i = 1; i < sKeys.length; i++) {
      if (s <= sKeys[i]) {
        const k = (s - sKeys[i - 1]) / Math.max(1e-6, sKeys[i] - sKeys[i - 1]);
        const e = k * k * (3 - 2 * k);
        return vals[i - 1] + (vals[i] - vals[i - 1]) * e;
      }
    }
    return vals[vals.length - 1];
  };

  const sBend = sKeys[spec.bendIndex];
  const sSeam = sKeys[spec.bendIndex - 1] + (sBend - sKeys[spec.bendIndex - 1]) * spec.seamT;

  const frame = (s: number): ArmFrame => {
    const f = Math.min(SAMPLES, Math.max(0, (s / total) * SAMPLES));
    const i = Math.min(SAMPLES - 1, Math.floor(f));
    const k = f - i;
    const c = P[i].clone().lerp(P[i + 1], k);
    const t = T[i].clone().lerp(T[i + 1], k).normalize();
    const n = N[i].clone().lerp(N[i + 1], k).normalize();
    const b = B[i].clone().lerp(B[i + 1], k).normalize();
    return { c, t, n, b, a: lerpKeys(spec.a, s), bb: lerpKeys(spec.b, s) };
  };

  const sForAlong = (along: number) => sSeam + (Math.max(0, along) / spec.sleeveLength) * (total - sSeam);

  const sForX = (absX: number) => {
    // centerline x increases monotonically along the shoulder part
    const iEnd = Math.round((sBend / total) * SAMPLES);
    for (let i = 0; i < iEnd; i++) {
      const x0 = Math.abs(P[i].x);
      const x1 = Math.abs(P[i + 1].x);
      if (absX >= x0 && absX <= x1) return ((i + (absX - x0) / Math.max(1e-6, x1 - x0)) / SAMPLES) * total;
    }
    return absX < Math.abs(P[0].x) ? 0 : sBend;
  };

  return { total, sSeam, sBend, frame, sForAlong, sForX };
}

/** Point and outward normal on the elliptical cross-section at angle θ (0 = N). */
export function armPoint(f: ArmFrame, theta: number) {
  const cs = Math.cos(theta);
  const sn = Math.sin(theta);
  const pos = f.c.clone().addScaledVector(f.n, f.a * cs).addScaledVector(f.b, f.bb * sn);
  const normal = f.n
    .clone()
    .multiplyScalar(cs / f.a)
    .addScaledVector(f.b, sn / f.bb)
    .normalize();
  return { pos, normal };
}
