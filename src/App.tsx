import { useEffect, useMemo, useState } from 'react';
import { loadBuild, lockVerified, saveBuild, type Build } from './regs/build';
import { layout } from './regs/layout';
import { validate } from './regs/validate';
import { loadArt } from './ui/art';
import { CoatScreen } from './ui/screens/CoatScreen';
import { AwardsScreen } from './ui/screens/AwardsScreen';
import { UnitScreen } from './ui/screens/UnitScreen';
import { MoreScreen } from './ui/screens/MoreScreen';
import { Onboarding } from './ui/screens/Onboarding';
import { AskPanel } from './ui/AskPanel';
import { VersionBanner } from './ui/VersionBanner';
import { Icon } from './ui/components/Icons';

type Tab = 'coat' | 'awards' | 'unit' | 'ask' | 'more';

const TABS: [Tab, string, () => JSX.Element][] = [
  ['coat', 'Uniform', Icon.coat],
  ['awards', 'Awards', Icon.medal],
  ['unit', 'Unit', Icon.shield],
  ['ask', 'Can I wear?', Icon.ask],
  ['more', 'Profile', Icon.more],
];

export default function App() {
  const [build, setBuild] = useState<Build>(loadBuild);
  const [tab, setTab] = useState<Tab>('coat');
  const [setup, setSetup] = useState(!build.onboarded);

  useEffect(() => saveBuild(build), [build]);
  useEffect(() => {
    loadArt();
  }, []);

  const items = useMemo(() => layout(build), [build]);
  const findings = useMemo(() => validate(build), [build]);
  const errors = findings.filter((f) => f.severity === 'error').length;
  const update = (patch: Partial<Build>) => setBuild((b) => lockVerified({ ...b, ...patch }));

  if (setup)
    return (
      <Onboarding
        build={build}
        update={update}
        onDone={() => {
          update({ onboarded: true });
          setSetup(false);
          setTab('coat');
        }}
      />
    );

  return (
    <div className="shell">
      <nav className="tabbar" aria-label="Main">
        <div className="rail-brand"><span className="logo">★</span> DressRight</div>
        {TABS.map(([t, label, I]) => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)} aria-current={tab === t ? 'page' : undefined}>
            <I />
            <span>{label}</span>
            {t === 'coat' && errors > 0 && <i className="badge-dot">{errors}</i>}
          </button>
        ))}
      </nav>
      <main className={`content tab-${tab}`}>
        {tab !== 'coat' && <VersionBanner compact />}
        {tab === 'coat' && <CoatScreen build={build} update={update} items={items} findings={findings} />}
        {tab === 'awards' && <AwardsScreen build={build} update={update} />}
        {tab === 'unit' && <UnitScreen build={build} update={update} />}
        {tab === 'ask' && <AskPanel build={build} />}
        {tab === 'more' && <MoreScreen build={build} update={update} onRestartSetup={() => setSetup(true)} />}
      </main>
    </div>
  );
}
