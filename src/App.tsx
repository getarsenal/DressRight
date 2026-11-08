import { useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { loadBuild, saveBuild, type Build } from './regs/build';
import { layout } from './regs/layout';
import { validate } from './regs/validate';
import { Coat } from './three/Coat';
import { BuilderPanel } from './ui/BuilderPanel';
import { Inspector } from './ui/Inspector';
import { Findings } from './ui/Findings';
import { AskPanel } from './ui/AskPanel';
import { ChangesPanel } from './ui/ChangesPanel';
import { SourcesPanel } from './ui/SourcesPanel';
import { VersionBanner } from './ui/VersionBanner';

type View = 'builder' | 'ask' | 'changes' | 'sources';

export default function App() {
  const [build, setBuild] = useState<Build>(loadBuild);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>('builder');

  useEffect(() => saveBuild(build), [build]);

  const items = useMemo(() => layout(build), [build]);
  const findings = useMemo(() => validate(build), [build]);
  const selectedItem = items.find((i) => i.key === selected) ?? null;
  const errors = findings.filter((f) => f.severity === 'error').length;

  const update = (patch: Partial<Build>) => setBuild((b) => ({ ...b, ...patch }));

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">★</span> DressRight
          <small>AR 670-1 uniform builder</small>
        </div>
        <nav>
          {(
            [
              ['builder', 'Builder'],
              ['ask', 'Can I wear…?'],
              ['changes', 'What changed'],
              ['sources', 'Sources'],
            ] as [View, string][]
          ).map(([v, label]) => (
            <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      <VersionBanner onOpenSources={() => setView('sources')} />

      {view === 'builder' && (
        <main className="builder">
          <aside className="left">
            <BuilderPanel build={build} update={update} />
          </aside>
          <section className="stage">
            <div className="stage-head">
              <strong>
                {build.uniform === 'AGSU' ? 'Army Green Service Uniform' : 'Army Blue Service Uniform'} coat ·{' '}
                {build.sex === 'male' ? 'male' : 'female'}
              </strong>
              <span className={errors ? 'pill bad' : 'pill good'}>
                {errors ? `${errors} problem${errors > 1 ? 's' : ''}` : 'No problems found'}
              </span>
            </div>
            <Canvas onPointerMissed={() => setSelected(null)} shadows camera={{ position: [0, 16, 50], fov: 38 }} dpr={[1, 2]}>
              <color attach="background" args={['#14171c']} />
              <ambientLight intensity={1.1} />
              <directionalLight position={[15, 30, 25]} intensity={2.2} castShadow />
              <directionalLight position={[-20, 10, 20]} intensity={0.9} />
              <hemisphereLight args={['#dfe6ef', '#2a2620', 0.9]} />
              <Coat build={build} items={items} selected={selected} onSelect={setSelected} />
              <ContactShadows position={[0, -16, 0]} opacity={0.4} scale={50} blur={2.5} />
              <OrbitControls target={[0, 3, 0]} minDistance={12} maxDistance={90} enablePan />
            </Canvas>
            <p className="hint">Drag to rotate · scroll to zoom · click any item to see its placement rule</p>
          </section>
          <aside className="right">
            <Inspector item={selectedItem} />
            <Findings findings={findings} />
          </aside>
        </main>
      )}
      {view === 'ask' && <AskPanel build={build} />}
      {view === 'changes' && <ChangesPanel />}
      {view === 'sources' && <SourcesPanel />}
    </div>
  );
}
