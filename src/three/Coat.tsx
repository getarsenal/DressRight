import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { Html, Line } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { Build } from '../regs/build';
import { coatGeometry, sleeveBraid, type Measure, type PlacedItem } from '../regs/layout';
import { textureFor } from './textures';
import { useArtVersion } from '../ui/art';
import {
  analyticSurface,
  bodyParams,
  cuffCap,
  conformalPatch,
  sleeveGeometry,
  torsoGeometry,
  type BodySurface,
  type SurfaceHit,
} from './body';
import { FABRIC, buttonSpots, tailoringMaps } from './tailoring';

const BRASS = '#c9a227';

interface Props {
  build: Build;
  items: PlacedItem[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  showMeasures: boolean;
}

type Placer = (u: number, v: number) => SurfaceHit;

/** Maps an item's local (u, v) inches to the body surface. */
function placerFor(item: PlacedItem, surf: BodySurface, sleeveR: (a: number) => number): Placer {
  const rot = item.rot ?? 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  switch (item.surface) {
    case 'front':
      return (u, v) => surf.front(item.x + c * u - s * v, item.y + s * u + c * v);
    case 'leftSleeve':
    case 'rightSleeve': {
      const side = item.surface === 'leftSleeve' ? 1 : -1;
      return (u, v) => {
        const along = item.y - v;
        return surf.sleeve(side, along, (-side * (item.x + u)) / sleeveR(along));
      };
    }
    default: {
      const side = item.surface === 'leftLoop' ? 1 : -1;
      const alongLoop = item.key.startsWith('strap-') || item.key.startsWith('orank-');
      return alongLoop
        ? (u, v) => surf.shoulder(side, item.x + u, -side * v)
        : (u, v) => surf.shoulder(side, item.x - v, -side * u);
    }
  }
}

function surfacePoint(surface: PlacedItem['surface'], x: number, y: number, surf: BodySurface, sleeveR: (a: number) => number) {
  if (surface === 'front') return surf.front(x, y);
  const side = surface === 'leftSleeve' ? 1 : -1;
  return surf.sleeve(side, y, (-side * x) / sleeveR(y));
}

function Decal({ item, place, selected, onSelect, offset, artV }: {
  artV: number;
  item: PlacedItem;
  place: Placer;
  selected: boolean;
  onSelect: Props['onSelect'];
  offset: number;
}) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tex = useMemo(() => textureFor(item.tex, item.w, item.h), [item.tex, item.w, item.h, artV]);
  const geo = useMemo(() => conformalPatch(item.w, item.h, place, offset, item.w > 2 ? 14 : 6), [item, place, offset]);
  const halo = useMemo(
    () => (selected ? conformalPatch(item.w + 0.35, item.h + 0.35, place, offset - 0.01, 8) : null),
    [selected, item, place, offset],
  );
  const [hover, setHover] = useState(false);
  return (
    <group>
      <mesh
        geometry={geo}
        renderOrder={3}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onSelect(item.key);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={() => {
          setHover(false);
          document.body.style.cursor = '';
        }}
      >
        <meshStandardMaterial
          map={tex}
          transparent
          alphaTest={0.05}
          metalness={0.2}
          roughness={0.5}
          emissive={hover && !selected ? '#333' : '#000'}
          polygonOffset
          polygonOffsetFactor={-4}
        />
      </mesh>
      {halo && (
        <mesh geometry={halo} renderOrder={2}>
          <meshBasicMaterial color="#ffd166" transparent opacity={0.55} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      )}
    </group>
  );
}

function Callout({ m, surface, surf, sleeveR }: { m: Measure; surface: PlacedItem['surface']; surf: BodySurface; sleeveR: (a: number) => number }) {
  const pts = useMemo(() => {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const x = m.from[0] + (m.to[0] - m.from[0]) * t;
      const y = m.from[1] + (m.to[1] - m.from[1]) * t;
      const h = surfacePoint(surface, x, y, surf, sleeveR);
      out.push(h.pos.clone().addScaledVector(h.normal, 0.12));
    }
    return out;
  }, [m, surface, surf, sleeveR]);
  const mid = pts[4];
  return (
    <group>
      <Line points={pts} color="#ffffff" lineWidth={2} depthTest={false} renderOrder={10} />
      {m.label && (
        <Html position={mid} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <span className="callout">{m.label}</span>
        </Html>
      )}
    </group>
  );
}

export function Coat({ build, items, selected, onSelect, showMeasures }: Props) {
  const artV = useArtVersion();
  const g = useMemo(() => coatGeometry(build), [build.uniform, build.sex]);
  const p = useMemo(() => bodyParams(g, build.sex === 'male'), [g, build.sex]);
  const surf = useMemo(() => analyticSurface(p), [p]);
  const maps = useMemo(() => tailoringMaps(build, g, p), [build.uniform, build.sex, g, p]);
  const torso = useMemo(() => torsoGeometry(p, maps.rect), [p, maps.rect]);
  const sleeves = useMemo(() => [sleeveGeometry(p, 1, surf), sleeveGeometry(p, -1, surf)], [p, surf]);
  const fabric = FABRIC[build.uniform];
  const cloth = useMemo(
    () => ({
      front: new THREE.MeshStandardMaterial({ map: maps.map, bumpMap: maps.bump, bumpScale: 1.2, roughness: 0.92, side: THREE.DoubleSide }),
      plain: new THREE.MeshStandardMaterial({ color: fabric, roughness: 0.92, side: THREE.DoubleSide }),
    }),
    [maps, fabric],
  );
  const placers = useMemo(() => {
    const m = new Map<string, Placer>();
    items.forEach((i) => m.set(i.key, placerFor(i, surf, p.sleeveR)));
    return m;
  }, [items, surf, p]);

  const braidSpec = sleeveBraid(build);
  const loopLen = g.width / 2 - g.notchX - 0.5;
  const sleeveLen = g.sleeveLength;
  const cuffs = useMemo(() => [cuffCap(p, 1), cuffCap(p, -1)], [p]);

  // belt band (AGSU)
  const belt = useMemo(() => {
    if (build.uniform !== 'AGSU') return null;
    const yc = g.buttons[g.buttons.length - 2] - 1.9;
    return conformalBand(p, yc, 1.6);
  }, [build.uniform, g, p]);

  const braid = useMemo(
    () =>
      braidSpec
        ? ([1, -1] as const).map((side) => {
            const along = sleeveLen - 3 - braidSpec.width / 2;
            return conformalPatch(2 * Math.PI * p.sleeveR(along) + 0.2, braidSpec.width, (u, v) => surf.sleeve(side, along - v, u / p.sleeveR(along)), 0.03, 40);
          })
        : [],
    [braidSpec?.width, sleeveLen, p, surf],
  );

  const loops = useMemo(
    () => ([1, -1] as const).map((side) => conformalPatch(loopLen, 2, (u, v) => surf.shoulder(side, loopLen / 2 + u, v), 0.08, 12)),
    [loopLen, surf],
  );

  return (
    <group>
      <mesh geometry={torso} material={[cloth.front, cloth.plain]} />
      {sleeves.map((s, i) => (
        <mesh key={i} geometry={s} material={cloth.plain} />
      ))}
      {cuffs.map((geo, i) => (
        <mesh key={`cuff${i}`} geometry={geo}>
          <meshStandardMaterial color="#0d0e0b" roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* mannequin neck */}
      <mesh position={[0, p.top + p.shoulderRise + 1.2, -0.4]}>
        <cylinderGeometry args={[p.neckR * 0.78, p.neckR * 0.85, 3.2, 32]} />
        <meshStandardMaterial color="#8d8f93" roughness={0.6} />
      </mesh>
      <mesh position={[0, p.top + p.shoulderRise + 0.2, -0.4]}>
        <cylinderGeometry args={[p.neckR * 0.9, p.neckR * 0.92, 1.4, 32, 1, true]} />
        <meshStandardMaterial color={build.uniform === 'AGSU' ? '#cdbb9b' : '#f3f3f1'} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>

      {/* shoulder loops */}
      {loops.map((geo, i) => (
        <mesh key={i} geometry={geo}>
          <meshStandardMaterial color={new THREE.Color(fabric).multiplyScalar(1.06)} roughness={0.85} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {([1, -1] as const).map((side) => {
        const h = surf.shoulder(side, 0.5);
        return <Button key={side} hit={h} r={0.3} lift={0.16} />;
      })}

      {/* buttons */}
      {buttonSpots(build, g).map(([x, y, r]) => (
        <Button key={`${x},${y}`} hit={surf.front(x, y)} r={r} lift={y > g.topButtonY - 15 ? 0.12 : 0.12} />
      ))}

      {belt && (
        <group>
          <mesh geometry={belt}>
            <meshStandardMaterial color={new THREE.Color(fabric).multiplyScalar(0.95)} roughness={0.85} side={THREE.DoubleSide} />
          </mesh>
          {(() => {
            const yc = g.buttons[g.buttons.length - 2] - 1.9;
            const h = surf.front(0, yc);
            return (
              <mesh position={h.pos.clone().addScaledVector(h.normal, 0.35)} quaternion={new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), h.normal)}>
                <boxGeometry args={[1.5, 1.3, 0.12]} />
                <meshStandardMaterial color={BRASS} metalness={0.85} roughness={0.25} />
              </mesh>
            );
          })()}
        </group>
      )}

      {braid.map((geo, i) => (
        <mesh key={i} geometry={geo}>
          {braidSpec?.color === 'gold' ? (
            <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} side={THREE.DoubleSide} />
          ) : (
            <meshStandardMaterial color={new THREE.Color(fabric).multiplyScalar(0.8)} roughness={0.7} side={THREE.DoubleSide} />
          )}
        </mesh>
      ))}

      {items.map((i) => {
        const onLapel = i.key.startsWith('disk') || i.key.startsWith('us-') || i.key.startsWith('br-');
        const onLoop = i.surface === 'leftLoop' || i.surface === 'rightLoop';
        const offset = onLoop ? (i.key.startsWith('strap-') ? 0.12 : 0.16) : onLapel ? 0.1 : 0.05;
        return <Decal key={i.key} artV={artV} item={i} place={placers.get(i.key)!} selected={selected === i.key} onSelect={onSelect} offset={offset} />;
      })}

      {items
        .filter((i) => i.measures && (showMeasures || selected === i.key))
        .flatMap((i) => i.measures!.map((m, k) => <Callout key={`${i.key}-${k}`} m={m} surface={i.surface} surf={surf} sleeveR={p.sleeveR} />))}
    </group>
  );
}

function Button({ hit, r, lift }: { hit: SurfaceHit; r: number; lift: number }) {
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), hit.normal), [hit]);
  return (
    <mesh position={hit.pos.clone().addScaledVector(hit.normal, lift * 0.5)} quaternion={q} castShadow>
      <cylinderGeometry args={[r, r * 0.92, lift, 24]} />
      <meshStandardMaterial color={BRASS} metalness={0.9} roughness={0.25} />
    </mesh>
  );
}

/** A band hugging the torso at height yc (used for the AGSU belt). */
function conformalBand(p: ReturnType<typeof bodyParams>, yc: number, h: number) {
  const seg = 128;
  const pos: number[] = [];
  const idx: number[] = [];
  const rows = [yc - h / 2, yc + h / 2];
  rows.forEach((y) => {
    const w = p.hw(y) + 0.12;
    const d = p.hd(y) + 0.12;
    const c = p.cz(y);
    for (let i = 0; i <= seg; i++) {
      const th = (i / seg) * Math.PI * 2;
      const cs = Math.cos(th);
      const sn = Math.sin(th);
      pos.push(w * Math.sign(cs) * Math.pow(Math.abs(cs), 2 / p.n), y, c + d * Math.sign(sn) * Math.pow(Math.abs(sn), 2 / p.n));
    }
  });
  for (let i = 0; i < seg; i++) idx.push(i, seg + 1 + i, i + 1, i + 1, seg + 1 + i, seg + 2 + i);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}
