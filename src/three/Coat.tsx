import { useMemo, useState } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import type { Build } from '../regs/build';
import { coatGeometry, type CoatGeometry, type PlacedItem } from '../regs/layout';
import { textureFor } from './textures';

const FABRIC = { AGSU: '#4b4936', ASU: '#202b4d' };
const SHIRT = { AGSU: '#c8b89a', ASU: '#f2f2f2' };
const TIE = { AGSU: '#2b2a22', ASU: '#111111' };
const BRASS = '#c9a227';

interface Props {
  build: Build;
  items: PlacedItem[];
  selected: string | null;
  onSelect: (key: string | null) => void;
}

/** One side's lapel + collar outline (x>0 = wearer's left), in front-face coordinates. */
function lapelShape(g: CoatGeometry, side: 1 | -1) {
  const s = new THREE.Shape();
  const open = 2;
  const pts: [number, number][] = [
    [open, g.top],
    [0, g.topButtonY],
    [g.notchX + 1.7, g.notchY + 0.2],
    [g.notchX + 1.0, g.notchY],
    [g.notchX + 1.9, g.notchY + 1.0],
    [g.notchX + 0.8, g.top],
  ];
  pts.forEach(([x, y], i) => (i ? s.lineTo(side * x, y) : s.moveTo(side * x, y)));
  s.closePath();
  return s;
}

function Decal({ item, selected, onSelect, z }: { item: PlacedItem; selected: boolean; onSelect: Props['onSelect']; z: number }) {
  const tex = useMemo(() => textureFor(item.tex, item.w, item.h), [item.tex, item.w, item.h]);
  const [hover, setHover] = useState(false);
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(item.key);
  };
  return (
    <group position={[item.x, item.y, z]} rotation={[0, 0, item.rot ?? 0]}>
      <mesh
        onClick={click}
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
        <planeGeometry args={[item.w, item.h]} />
        <meshStandardMaterial map={tex} transparent alphaTest={0.05} metalness={0.25} roughness={0.55} />
      </mesh>
      {(selected || hover) && (
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[item.w + 0.3, item.h + 0.3]} />
          <meshBasicMaterial color={selected ? '#ffd166' : '#ffffff'} transparent opacity={selected ? 0.55 : 0.25} />
        </mesh>
      )}
    </group>
  );
}

/** A decal wrapped around part of a cylinder (sleeves). */
function SleeveDecal({ item, radius, top, outward, selected, onSelect }: {
  item: PlacedItem;
  radius: number;
  top: number;
  outward: 1 | -1;
  selected: boolean;
  onSelect: Props['onSelect'];
}) {
  const tex = useMemo(() => textureFor(item.tex, item.w, item.h), [item.tex, item.w, item.h]);
  const r = radius + 0.04;
  const len = item.w / r;
  const center = outward === 1 ? Math.PI / 2 : -Math.PI / 2;
  return (
    <group position={[0, top - item.y, 0]}>
      <mesh
        onClick={(e) => {
          e.stopPropagation();
          onSelect(item.key);
        }}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <cylinderGeometry args={[r, r, item.h, 24, 1, true, center - len / 2, len]} />
        <meshStandardMaterial map={tex} transparent alphaTest={0.05} side={THREE.FrontSide} roughness={0.6} />
      </mesh>
      {selected && (
        <mesh>
          <cylinderGeometry args={[r - 0.01, r - 0.01, item.h + 0.3, 24, 1, true, center - len / 2 - 0.1, len + 0.2]} />
          <meshBasicMaterial color="#ffd166" transparent opacity={0.5} />
        </mesh>
      )}
    </group>
  );
}

export function Coat({ build, items, selected, onSelect }: Props) {
  const g = useMemo(() => coatGeometry(build), [build.uniform, build.sex]);
  const fabric = FABRIC[build.uniform];
  const front = g.depth / 2;
  const lapels = useMemo(() => [lapelShape(g, 1), lapelShape(g, -1)], [g]);
  const shirt = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-2, g.top);
    s.lineTo(2, g.top);
    s.lineTo(0, g.topButtonY);
    s.closePath();
    return s;
  }, [g]);
  const tie = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.45, g.top - 0.3);
    s.lineTo(0.45, g.top - 0.3);
    s.lineTo(0.7, g.topButtonY + 2.5);
    s.lineTo(0, g.topButtonY + 1.2);
    s.lineTo(-0.7, g.topButtonY + 2.5);
    s.closePath();
    return s;
  }, [g]);

  const sleeveTilt = 0.1;
  const sleeveX = g.width / 2 + g.sleeveRadius * 0.55;
  const sleeveTopY = g.top - 1.2;
  const loopLen = g.width / 2 - g.notchX - 0.5;

  const officerBraid = build.uniform === 'ASU' && items.some((i) => i.key.startsWith('strap-'));

  const sleeve = (side: 1 | -1) => {
    const surface = side === 1 ? 'leftSleeve' : 'rightSleeve';
    return (
      <group position={[side * sleeveX, sleeveTopY, 0]} rotation={[0, 0, side * sleeveTilt]}>
        <mesh position={[0, -g.sleeveLength / 2, 0]} castShadow>
          <cylinderGeometry args={[g.sleeveRadius, g.sleeveRadius * 0.85, g.sleeveLength, 32]} />
          <meshStandardMaterial color={fabric} roughness={0.9} />
        </mesh>
        {/* shoulder cap */}
        <mesh position={[0, 0, 0]}>
          <sphereGeometry args={[g.sleeveRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={fabric} roughness={0.9} />
        </mesh>
        {officerBraid && (
          <mesh position={[0, -g.sleeveLength + 3.4, 0]}>
            <cylinderGeometry args={[g.sleeveRadius * 0.89, g.sleeveRadius * 0.89, 0.75, 32, 1, true]} />
            <meshStandardMaterial color={BRASS} metalness={0.6} roughness={0.35} />
          </mesh>
        )}
        {items
          .filter((i) => i.surface === surface)
          .map((i) => (
            <SleeveDecal
              key={i.key}
              item={i}
              radius={g.sleeveRadius * (1 - (0.15 * i.y) / g.sleeveLength)}
              top={0}
              outward={side}
              selected={selected === i.key}
              onSelect={onSelect}
            />
          ))}
      </group>
    );
  };

  const loop = (side: 1 | -1) => {
    const surface = side === 1 ? 'leftLoop' : 'rightLoop';
    const x0 = side * (g.notchX + 0.5);
    return (
      <group position={[x0, g.top + 0.08, 0]}>
        <mesh position={[(side * loopLen) / 2, 0, 0]}>
          <boxGeometry args={[loopLen, 0.12, 2]} />
          <meshStandardMaterial color={fabric} roughness={0.85} />
        </mesh>
        <mesh position={[side * 0.5, 0.12, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.12, 20]} />
          <meshStandardMaterial color={BRASS} metalness={0.8} roughness={0.3} />
        </mesh>
        {items
          .filter((i) => i.surface === surface)
          .map((i) => {
            // Straps and officer grade run along the loop; the DUI's top points toward the neck.
            const alongLoop = i.key.startsWith('strap-') || i.key.startsWith('orank-');
            const rz = alongLoop ? (side === 1 ? 0 : Math.PI) : side * (Math.PI / 2);
            return (
              <group key={i.key} position={[side * i.x, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                <group rotation={[0, 0, rz]}>
                  <Decal item={{ ...i, x: 0, y: 0 }} selected={selected === i.key} onSelect={onSelect} z={i.key.startsWith('strap-') ? 0 : 0.03} />
                </group>
              </group>
            );
          })}
      </group>
    );
  };

  const pocket = (side: 1 | -1, cy: number, w: number, h: number, flap: number, style: 'flap' | 'welt') => (
    <group position={[side * (g.pocket?.cx ?? 5), cy, front + 0.03]}>
      {style === 'flap' ? (
        <>
          <mesh position={[0, -h / 2, 0]}>
            <planeGeometry args={[w, h]} />
            <meshStandardMaterial color={fabric} roughness={0.95} polygonOffset polygonOffsetFactor={-1} />
          </mesh>
          <mesh position={[0, -flap / 2, 0.05]}>
            <boxGeometry args={[w + 0.2, flap, 0.08]} />
            <meshStandardMaterial color={fabric} roughness={0.85} />
          </mesh>
          <mesh position={[0, -flap + 0.45, 0.12]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.28, 0.28, 0.1, 20]} />
            <meshStandardMaterial color={BRASS} metalness={0.8} roughness={0.3} />
          </mesh>
        </>
      ) : (
        <mesh position={[0, -0.1, 0.02]}>
          <boxGeometry args={[w, 0.3, 0.05]} />
          <meshStandardMaterial color={fabric} roughness={0.8} />
        </mesh>
      )}
    </group>
  );

  return (
    <group>
      {/* torso */}
      <RoundedBox args={[g.width, g.height, g.depth]} radius={1.2} smoothness={4} castShadow receiveShadow>
        <meshStandardMaterial color={fabric} roughness={0.9} />
      </RoundedBox>

      {/* neck + shirt + tie */}
      <mesh position={[0, g.top + 1.5, -0.5]}>
        <cylinderGeometry args={[2.2, 2.4, 3.5, 32]} />
        <meshStandardMaterial color="#9a9a9a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0, front + 0.01]}>
        <shapeGeometry args={[shirt]} />
        <meshStandardMaterial color={SHIRT[build.uniform]} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0, front + 0.03]}>
        <shapeGeometry args={[tie]} />
        <meshStandardMaterial color={TIE[build.uniform]} roughness={0.6} />
      </mesh>

      {/* lapels/collar */}
      {lapels.map((s, i) => (
        <mesh key={i} position={[0, 0, front + 0.08]}>
          <extrudeGeometry args={[s, { depth: 0.08, bevelEnabled: false }]} />
          <meshStandardMaterial color={new THREE.Color(fabric).multiplyScalar(1.08)} roughness={0.8} />
        </mesh>
      ))}

      {/* buttons */}
      {g.buttons.map((y) => (
        <mesh key={y} position={[0, y, front + 0.12]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.38, 0.38, 0.14, 24]} />
          <meshStandardMaterial color={BRASS} metalness={0.85} roughness={0.25} />
        </mesh>
      ))}

      {/* AGSU belt */}
      {build.uniform === 'AGSU' && (
        <group position={[0, g.buttons[g.buttons.length - 2] - 1.6, 0]}>
          <mesh>
            <boxGeometry args={[g.width + 0.12, 1.6, g.depth + 0.12]} />
            <meshStandardMaterial color={new THREE.Color(fabric).multiplyScalar(0.92)} roughness={0.85} />
          </mesh>
          <mesh position={[0, 0, front + 0.1]}>
            <boxGeometry args={[1.6, 1.3, 0.1]} />
            <meshStandardMaterial color={BRASS} metalness={0.85} roughness={0.25} />
          </mesh>
        </group>
      )}

      {/* pockets */}
      {g.pocket && [1, -1].map((s) => <group key={s}>{pocket(s as 1 | -1, g.pocket!.top, g.pocket!.width, g.pocket!.height, g.pocket!.flap, g.pocket!.style)}</group>)}
      {[1, -1].map((s) => (
        <group key={`low${s}`}>{pocket(s as 1 | -1, g.topButtonY - 7, build.sex === 'male' ? 6.5 : 5.5, build.uniform === 'AGSU' ? 6 : 0.3, build.uniform === 'AGSU' ? 2.4 : 0.3, build.uniform === 'AGSU' ? 'flap' : 'welt')}</group>
      ))}

      {loop(1)}
      {loop(-1)}
      {sleeve(1)}
      {sleeve(-1)}

      {/* front decals */}
      {items
        .filter((i) => i.surface === 'front')
        .map((i) => {
          const onLapel = i.key.startsWith('disk') || i.key.startsWith('us-') || i.key.startsWith('br-');
          const onFlap = i.key.startsWith('flap-') || i.key === 'nameplate';
          const z = front + (onLapel ? 0.2 : onFlap ? 0.16 : 0.07);
          return <Decal key={i.key} item={i} selected={selected === i.key} onSelect={onSelect} z={z} />;
        })}
    </group>
  );
}
