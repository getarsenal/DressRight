import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { Build } from '../../regs/build';
import type { Finding } from '../../regs/types';
import type { PlacedItem } from '../../regs/layout';
import { rankById } from '../../regs/catalog/ranks';
import { branchById } from '../../regs/catalog/branches';
import { Coat } from '../../three/Coat';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Sheet, type Snap } from '../components/Sheet';
import { Icon } from '../components/Icons';
import { Citations } from '../Citations';
import { FindingList } from '../Findings';

/** soft studio reflections (generated locally, no HDR download) */
function Studio() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    return () => {
      scene.environment = null;
      env.dispose();
      pm.dispose();
    };
  }, [gl, scene]);
  return null;
}

/**
 * Frames the whole coat for the current screen shape: on a tall phone the
 * width (sleeve to sleeve) is the limit, on a wide screen the height is.
 * `bottomInset` is the share of the canvas covered by the bottom sheet.
 */
function FitCamera({ controls, bottomInset }: { controls: RefObject<OrbitControlsImpl>; bottomInset: number }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const visibleH = size.height * (1 - bottomInset);
    const aspect = size.width / Math.max(1, visibleH);
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const coatH = 42; // hem to top of the neck, plus margin (inches)
    const coatW = 42; // sleeve to sleeve, plus margin
    const dist = Math.max(coatH / 2 / tan, coatW / 2 / (tan * aspect));
    // shift the target down so the coat is centered in the uncovered area
    const shift = (bottomInset * 2 * dist * tan) / 2;
    const target = new THREE.Vector3(0, 1.5 - shift, 0);
    cam.position.set(0, target.y + 6, dist);
    cam.lookAt(target);
    cam.updateProjectionMatrix();
    const c = controls.current;
    if (c) {
      c.target.copy(target);
      c.maxDistance = dist * 1.6;
      c.update();
      c.saveState();
    }
  }, [camera, size.width, size.height, bottomInset, controls]);
  return null;
}

export function CoatScreen({ build, update, items, findings }: {
  build: Build;
  update: (p: Partial<Build>) => void;
  items: PlacedItem[];
  findings: Finding[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snap>('peek');
  const [panel, setPanel] = useState<'item' | 'check'>('item');
  const [measure, setMeasure] = useState(false);
  const controls = useRef<OrbitControlsImpl>(null);
  const item = items.find((i) => i.key === selected) ?? null;
  const errors = findings.filter((f) => f.severity === 'error').length;
  const warnings = findings.filter((f) => f.severity === 'warning').length;
  const rank = rankById(build.rankId);

  const select = (k: string | null) => {
    setSelected(k);
    if (k) {
      setPanel('item');
      setSnap((s) => (s === 'peek' ? 'half' : s));
    }
  };

  const camera = useMemo(() => ({ position: [0, 9, 62] as [number, number, number], fov: 34 }), []);
  const [vw, setVw] = useState(() => window.innerWidth);
  const [vh, setVh] = useState(() => window.innerHeight);
  useEffect(() => {
    const r = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    window.addEventListener('resize', r);
    return () => window.removeEventListener('resize', r);
  }, []);
  const wide = vw >= 1024;

  return (
    <div className="coat-screen">
      <div className="viewport">
        <Canvas camera={camera} dpr={[1, 2]} onPointerMissed={() => setSelected(null)}>
          <color attach="background" args={['#121512']} />
          <Studio />
          <hemisphereLight args={['#eef2f7', '#2b2a22', 0.7]} />
          <directionalLight position={[14, 26, 30]} intensity={2.0} />
          <directionalLight position={[-22, 12, 18]} intensity={0.7} />
          <directionalLight position={[0, 10, -30]} intensity={0.6} />
          <Coat build={build} items={items} selected={selected} onSelect={select} showMeasures={measure} />
          <ContactShadows position={[0, -16.5, 0]} opacity={0.45} scale={44} blur={2.6} far={20} />
          <OrbitControls ref={controls} minDistance={12} enablePan={false} />
          <FitCamera controls={controls} bottomInset={wide ? 0 : 118 / Math.max(400, vh)} />
        </Canvas>

        <div className="coat-top">
          <div className="seg pill-seg">
            {(['AGSU', 'ASU'] as const).map((u) => (
              <button key={u} className={build.uniform === u ? 'on' : ''} onClick={() => update({ uniform: u })}>
                {u === 'AGSU' ? 'Greens' : 'Blues'}
              </button>
            ))}
          </div>
          <button
            className={`status ${errors ? 'bad' : warnings ? 'warn' : 'good'}`}
            onClick={() => {
              setPanel('check');
              setSnap('half');
            }}
          >
            {errors ? <Icon.alert /> : <Icon.check />}
            {errors ? `${errors} to fix` : warnings ? `${warnings} to check` : 'Squared away'}
          </button>
        </div>

        <div className="fabs">
          <button className={`fab ${measure ? 'on' : ''}`} onClick={() => setMeasure(!measure)} aria-label="Show all measurements" title="Show all measurements">
            <Icon.ruler />
          </button>
          <button className="fab" onClick={() => controls.current?.reset()} aria-label="Reset view" title="Reset view">
            <Icon.reset />
          </button>
        </div>
      </div>

      <Sheet
        snap={snap}
        onSnap={setSnap}
        header={
          <div className="sheet-head">
            <div className="tabs-mini">
              <button className={panel === 'item' ? 'on' : ''} onClick={(e) => { e.stopPropagation(); setPanel('item'); }}>Placement</button>
              <button className={panel === 'check' ? 'on' : ''} onClick={(e) => { e.stopPropagation(); setPanel('check'); }}>
                Wear check {findings.length > 0 && <span className={`count ${errors ? 'bad' : ''}`}>{findings.length}</span>}
              </button>
            </div>
          </div>
        }
      >
        {panel === 'item' ? (
          item ? (
            <div className="item-detail">
              <h2>{item.label}</h2>
              <p className="rule">{item.rule}</p>
              {item.measures?.some((m) => m.label) && (
                <div className="measure-chips">
                  {item.measures.filter((m) => m.label).map((m, i) => <span key={i} className="chip on">{m.label}</span>)}
                </div>
              )}
              <Citations items={item.citations} />
            </div>
          ) : (
            <div className="item-empty">
              <p><strong>{rank.abbr} {build.lastName}</strong> · {branchById(build.branchId).name} · {build.uniform === 'AGSU' ? 'Army Green Service Uniform' : 'Army Blue Service Uniform'}</p>
              <p className="muted">Tap anything on the coat to see exactly where it goes, the measurement, and the paragraph that says so. Drag to turn the coat; pinch to zoom.</p>
            </div>
          )
        ) : (
          <FindingList findings={findings} />
        )}
      </Sheet>
    </div>
  );
}
