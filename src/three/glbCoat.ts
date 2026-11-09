/**
 * The sculpted coat (Blender → GLB, see tools/blender/coat.py and docs/3d-model.md).
 *
 * The exported model is already in the app's frame: inches, +y up, +z toward
 * the viewer, +x = wearer's left, origin at the top button. Decals find the
 * cloth by ray-casting against it, so the layout engine doesn't change.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { acceleratedRaycast, computeBoundsTree } from 'three-mesh-bvh';
import type { BodySurface, SurfaceHit } from './body';

export interface CoatModel {
  scene: THREE.Object3D;
  surface: BodySurface;
  sleeveLength: number;
  /** sleeve radius at `along`, for converting inches across into radians */
  sleeveR: (along: number) => number;
}

/** meshes insignia sit on (buttons, shirt, tie and the mannequin are excluded) */
const CLOTH = /^(Coat|Sleeve|Lapel|BreastBody|BreastFlap|BreastPleat|LowerFlap|Belt|Loop\d|Loop-)/;

export function modelUrl(uniform: string, sex: string) {
  return `${import.meta.env.BASE_URL}models/coat-${uniform.toLowerCase()}-${sex}.glb`;
}

const UNDER = { polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 60 };

const cache = new Map<string, Promise<CoatModel | null>>();

export function loadCoatModel(uniform: string, sex: string, fabric: string): Promise<CoatModel | null> {
  if (sex !== 'male') return Promise.resolve(null);
  const url = modelUrl(uniform, sex);
  const key = `${url}|${fabric}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      new GLTFLoader()
        .setMeshoptDecoder(MeshoptDecoder)
        .loadAsync(url)
        .then((gltf) => prepare(gltf.scene, fabric))
        .catch(() => null),
    );
  }
  return cache.get(key)!;
}

function prepare(scene: THREE.Object3D, fabric: string): CoatModel {
  scene.updateMatrixWorld(true);
  const weave = weaveNormalMap();
  const cloth = new THREE.MeshStandardMaterial({
    color: fabric,
    roughness: 0.9,
    normalMap: weave,
    normalScale: new THREE.Vector2(0.55, 0.55),
    side: THREE.DoubleSide,
  });
  const targets: THREE.Mesh[] = [];
  const coatMeshes: THREE.Mesh[] = [];
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = m.material as THREE.MeshStandardMaterial;
    const name = mat?.name ?? '';
    if (name.startsWith('Fabric')) {
      // compressed normals band on the big smooth surfaces: rebuild them
      if (/^(Coat|Sleeve)/.test(nodeName(m))) {
        m.geometry.deleteAttribute('normal');
        m.geometry.computeVertexNormals();
      }
      boxUV(m.geometry, m.matrixWorld, 2.2);
      m.material = cloth;
    } else if (name === 'Brass') {
      m.material = new THREE.MeshStandardMaterial({ color: '#c9a227', metalness: 0.9, roughness: 0.28 });
    } else if (name === 'Mannequin') {
      m.material = new THREE.MeshStandardMaterial({ color: '#9a9ca0', roughness: 0.65, ...UNDER });
    } else if (mat) {
      // shirt, tie
      m.material = new THREE.MeshStandardMaterial({ color: mat.color, roughness: 0.85, side: THREE.DoubleSide });
    }
    const n = nodeName(m);
    if (CLOTH.test(n) || n === 'Coat') {
      // a BVH makes the thousands of decal ray-casts cheap
      (m.geometry as THREE.BufferGeometry & { computeBoundsTree: typeof computeBoundsTree }).computeBoundsTree = computeBoundsTree;
      (m.geometry as THREE.BufferGeometry & { computeBoundsTree: typeof computeBoundsTree }).computeBoundsTree();
      m.raycast = acceleratedRaycast;
    }
    if (CLOTH.test(n)) targets.push(m);
    if (n === 'Coat' || n.startsWith('Sleeve')) coatMeshes.push(m);
  });

  const root = scene.getObjectByName('DressRightCoat') ?? scene;
  const extras = (root.userData ?? {}) as Record<string, unknown>;
  const sleeveLength = Number(extras.dr_sleeve_length) || 22.9;
  const arms = { 1: anchors(scene, 'L'), [-1]: anchors(scene, 'R') } as Record<1 | -1, THREE.Vector3[]>;

  const ray = new THREE.Raycaster();
  const cast = (from: THREE.Vector3, dir: THREE.Vector3, meshes: THREE.Mesh[], far = 60): SurfaceHit | null => {
    ray.set(from, dir);
    ray.far = far;
    (ray as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit) return null;
    const normal = (hit.normal ?? hit.face?.normal ?? new THREE.Vector3(0, 0, 1)).clone();
    normal.transformDirection(hit.object.matrixWorld);
    // face toward where the ray came from
    if (normal.dot(dir) > 0) normal.negate();
    normal.normalize();
    return { pos: hit.point.clone(), normal };
  };

  const down = new THREE.Vector3(0, -1, 0);
  const back = new THREE.Vector3(0, 0, -1);
  const frontCache = new Map<string, SurfaceHit>();
  const front = (x: number, y: number): SurfaceHit => {
    const k = `${x.toFixed(3)},${y.toFixed(3)}`;
    let h = frontCache.get(k);
    if (!h) {
      h = cast(new THREE.Vector3(x, y, 30), back, targets) ?? { pos: new THREE.Vector3(x, y, 4.5), normal: new THREE.Vector3(0, 0, 1) };
      frontCache.set(k, h);
    }
    return h;
  };

  /**
   * Outward from inside the sleeve. The cloth is a thin solid shell, so take
   * its outer face: the last hit within a hair of the first.
   */
  const castOut = (from: THREE.Vector3, dir: THREE.Vector3, far: number): (SurfaceHit & { d: number }) | null => {
    ray.set(from, dir);
    ray.far = far;
    (ray as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = false;
    const hits = ray.intersectObjects(coatMeshes, false);
    if (!hits.length) return null;
    let h = hits[0];
    for (const k of hits) if (k.distance - hits[0].distance < 0.3) h = k;
    const normal = (h.normal ?? h.face?.normal ?? dir).clone().transformDirection(h.object.matrixWorld).normalize();
    if (normal.dot(dir) < 0) normal.negate();
    return { pos: h.point.clone(), normal, d: h.distance };
  };

  /**
   * Each sleeve is measured on its outer surface from the shoulder seam:
   * first over the shoulder cap (rays fanned from a point inside the joint),
   * then down the arm (rays outward from the centerline anchors).
   */
  const up = new THREE.Vector3(0, 1, 0);
  const fwd = new THREE.Vector3(0, 0, 1);
  const frameAt = (pts: THREE.Vector3[], i: number, side: 1 | -1) => {
    const tan = pts[Math.min(i + 1, pts.length - 1)].clone().sub(pts[Math.max(0, Math.min(i, pts.length - 2))]).normalize();
    return new THREE.Vector3(side, 0, 0).addScaledVector(tan, -tan.x * side).normalize();
  };
  const sleeves = new Map<number, ReturnType<typeof buildSleeve>>();
  const buildSleeve = (side: 1 | -1) => {
    const pts = arms[side];
    const out = new THREE.Vector3(side, 0, 0);
    const P = new THREE.Vector3(side * 7.4, pts[0].y + 0.3, pts[0].z);
    const capDir = (th: number) => up.clone().multiplyScalar(Math.cos(th)).addScaledVector(out, Math.sin(th));
    const seam = cast(new THREE.Vector3(side * 7.2, 30, pts[0].z), down, coatMeshes);
    const thS = seam ? Math.atan2((seam.pos.x - P.x) * side, seam.pos.y - P.y) : 0;
    const h0 = castOut(pts[0], frameAt(pts, 0, side), 6);
    const thE = h0 ? Math.atan2((h0.pos.x - P.x) * side, h0.pos.y - P.y) : Math.PI / 2;
    const capTh: number[] = [];
    const capS: number[] = [];
    let prev: THREE.Vector3 | null = null;
    let s = 0;
    for (let i = 0; i <= 16; i++) {
      const th = thS + ((thE - thS) * i) / 16;
      const h = castOut(P, capDir(th), 8);
      const pnt = h ? h.pos : P.clone().addScaledVector(capDir(th), 2.8);
      if (prev) s += pnt.distanceTo(prev);
      prev = pnt;
      capTh.push(th);
      capS.push(s);
    }
    const armS: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const h = castOut(pts[i], frameAt(pts, i, side), 6);
      const pnt = h ? h.pos : pts[i].clone().addScaledVector(frameAt(pts, i, side), 2.6);
      if (prev) s += pnt.distanceTo(prev);
      prev = pnt;
      armS.push(s);
    }
    const capLen = capS[capS.length - 1];
    // stretch to the coat's sleeve length so cuff-based measurements land on the cuff
    return { pts, P, capDir, capTh, capS, capLen, armS, scale: s / sleeveLength };
  };
  const sleeveOf = (side: 1 | -1) => {
    let m = sleeves.get(side);
    if (!m) sleeves.set(side, (m = buildSleeve(side)));
    return m;
  };
  const lookup = (keys: number[], s: number) => {
    let i = 1;
    while (i < keys.length - 1 && keys[i] < s) i++;
    const f = Math.min(1, Math.max(0, (s - keys[i - 1]) / Math.max(1e-6, keys[i] - keys[i - 1])));
    return { i, f };
  };
  /** ray origin and outward direction `along` inches below the seam, `around` radians toward the front */
  const sleeveRay = (side: 1 | -1, along: number, around: number) => {
    const m = sleeveOf(side);
    const s = Math.max(0, along) * m.scale;
    let from: THREE.Vector3;
    let base: THREE.Vector3;
    if (s <= m.capLen) {
      const { i, f } = lookup(m.capS, s);
      from = m.P;
      base = m.capDir(m.capTh[i - 1] + (m.capTh[i] - m.capTh[i - 1]) * f);
    } else {
      const { i, f } = lookup(m.armS, s);
      from = m.pts[i - 1].clone().lerp(m.pts[i], f);
      base = frameAt(m.pts, i - 1, side).lerp(frameAt(m.pts, i, side), f).normalize();
    }
    const dir = base.multiplyScalar(Math.cos(around)).addScaledVector(fwd, Math.sin(around)).normalize();
    return { from, dir };
  };
  const sleeve = (side: 1 | -1, along: number, around: number): SurfaceHit => {
    const { from, dir } = sleeveRay(side, along, around);
    // On the outer half come in from outside: the first hit is the cloth you can see,
    // even where the sleeve head has folds. On the inner half (toward the torso) go
    // from the centerline outward instead, so the torso beside the sleeve isn't hit.
    const inner = castOut(from, dir, 7);
    if (Math.abs(around) <= 1.9) {
      const outer = cast(from.clone().addScaledVector(dir, 6), dir.clone().negate(), coatMeshes, 6);
      const d = outer ? outer.pos.distanceTo(from) : Infinity;
      // accept it only if it's this sleeve's own outer layer, not the chest in front of it
      if (outer && d > 0.6 && ((Math.abs(around) <= 1.2 && d < 4.5) || (inner ? d <= inner.d + 1.1 : d < 3.6))) return outer;
    }
    return inner ? { pos: inner.pos, normal: inner.normal } : { pos: from.clone().addScaledVector(dir, 2.6), normal: dir };
  };
  /** arc length around the sleeve vs. angle, per height, so `across` is true inches on the cloth */
  const arcs = new Map<string, { th: number[]; s: number[] }>();
  const arcTable = (side: 1 | -1, along: number) => {
    const key = `${side}|${along}`;
    let t = arcs.get(key);
    if (!t) {
      const th: number[] = [];
      const pts: THREE.Vector3[] = [];
      for (let i = -26; i <= 26; i++) {
        th.push(i * 0.1);
        pts.push(sleeve(side, along, i * 0.1).pos);
      }
      const s0: number[] = [0];
      for (let i = 1; i < pts.length; i++) s0.push(s0[i - 1] + pts[i].distanceTo(pts[i - 1]));
      const mid = s0[26];
      t = { th, s: s0.map((v) => v - mid) };
      arcs.set(key, t);
    }
    return t;
  };
  const sleeveAcross = (side: 1 | -1, along: number, across: number): SurfaceHit => {
    const a = Math.round(along * 4) / 4;
    const lo = arcTable(side, a);
    const { i, f } = lookup(lo.s, across);
    const th = lo.th[i - 1] + (lo.th[i] - lo.th[i - 1]) * f;
    return sleeve(side, along, th);
  };
  const radius = new Map<number, number>();
  const sleeveR = (along: number) => {
    const k = Math.round(along * 2) / 2;
    let r = radius.get(k);
    if (r === undefined) {
      const { from, dir } = sleeveRay(1, k, 0);
      r = Math.max(1.0, Math.min(4, castOut(from, dir, 7)?.d ?? 2.4));
      radius.set(k, r);
    }
    return r;
  };

  // shoulder loops run from the button (x ≈ 3.9) out to the seam (x ≈ 7.2)
  const loopZ = { 1: loopCenterZ(scene, '1'), [-1]: loopCenterZ(scene, '-1') } as Record<1 | -1, number>;
  const shoulder = (side: 1 | -1, t: number, zOff = 0): SurfaceHit => {
    const x = side * (3.6 + t);
    const h = cast(new THREE.Vector3(x, 30, loopZ[side] + zOff), down, targets);
    return h ?? { pos: new THREE.Vector3(x, 8, loopZ[side] + zOff), normal: new THREE.Vector3(0, 1, 0) };
  };

  return { scene, surface: { front, sleeve, shoulder, sleeveAcross }, sleeveLength, sleeveR };
}

function nodeName(m: THREE.Object3D) {
  // glTF meshes with several primitives become a Group with child meshes
  return m.name && !/^mesh_\d|_\d+$/.test(m.name) ? m.name : (m.parent?.name ?? m.name);
}

function anchors(scene: THREE.Object3D, s: 'L' | 'R') {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 40; i++) {
    const o = scene.getObjectByName(`dr_arm_${s}_${String(i).padStart(2, '0')}`);
    if (!o) break;
    pts.push(o.getWorldPosition(new THREE.Vector3()));
  }
  return pts.length >= 2 ? pts : [new THREE.Vector3(s === 'L' ? 8.5 : -8.5, 4.4, 0), new THREE.Vector3(s === 'L' ? 10 : -10, -14.5, 0.5)];
}

function loopCenterZ(scene: THREE.Object3D, side: string) {
  const b = scene.getObjectByName(`LoopButton${side}`);
  return b ? b.getWorldPosition(new THREE.Vector3()).z : 0;
}

/** box-projected UVs (inches / scale) so the weave map tiles evenly over the cloth */
function boxUV(geo: THREE.BufferGeometry, world: THREE.Matrix4, scale: number) {
  if (geo.getAttribute('uv')) return;
  const pos = geo.getAttribute('position');
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  const nor = geo.getAttribute('normal');
  const uv = new Float32Array(pos.count * 2);
  // positions may be quantized (KHR_mesh_quantization): work in world inches
  const nm = new THREE.Matrix3().getNormalMatrix(world);
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i).applyMatrix4(world);
    n.fromBufferAttribute(nor, i).applyMatrix3(nm);
    const ax = Math.abs(n.x);
    const ay = Math.abs(n.y);
    const az = Math.abs(n.z);
    const x = p.x / scale;
    const y = p.y / scale;
    const z = p.z / scale;
    if (ax >= ay && ax >= az) uv.set([z, y], i * 2);
    else if (ay >= az) uv.set([x, z], i * 2);
    else uv.set([x, y], i * 2);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

let weaveTex: THREE.Texture | null = null;
/** a 2/1 twill (diagonal rib) as a tangent-space normal map */
function weaveNormalMap() {
  if (weaveTex) return weaveTex;
  const N = 128;
  const ribs = 22; // ribs per tile: ~10 per inch at a 2.2 in tile
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const d = ((x + y) / N) * ribs;
      const rib = 0.5 + 0.5 * Math.cos(d * Math.PI * 2);
      const yarn = 0.5 + 0.5 * Math.cos(((x - y) / N) * ribs * 3 * Math.PI * 2);
      h[y * N + x] = rib * 0.8 + yarn * 0.2;
    }
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const at = (i: number, j: number) => h[((j + N) % N) * N + ((i + N) % N)];
      const dx = (at(x + 1, y) - at(x - 1, y)) * 1.5;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 1.5;
      const v = new THREE.Vector3(-dx, -dy, 1).normalize();
      const o = (y * N + x) * 4;
      data[o] = (v.x * 0.5 + 0.5) * 255;
      data[o + 1] = (v.y * 0.5 + 0.5) * 255;
      data[o + 2] = (v.z * 0.5 + 0.5) * 255;
      data[o + 3] = 255;
    }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  weaveTex = t;
  return t;
}
