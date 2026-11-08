import { useState } from 'react';
import { DEFAULT_BUILD, type Build } from '../../regs/build';
import { RANKS, rankById } from '../../regs/catalog/ranks';
import { BRANCHES, branchById } from '../../regs/catalog/branches';
import { STATES, stateName } from '../../regs/catalog/states';
import { ChangesPanel } from '../ChangesPanel';
import { SourcesPanel } from '../SourcesPanel';
import { Icon } from '../components/Icons';

type Page = 'home' | 'changes' | 'sources';
const COMPONENT = { RA: 'Regular Army', USAR: 'Army Reserve', ARNG: 'Army National Guard' } as const;

export function MoreScreen({ build, update, onRestartSetup }: { build: Build; update: (p: Partial<Build>) => void; onRestartSetup: () => void }) {
  const [page, setPage] = useState<Page>('home');
  if (page !== 'home')
    return (
      <div className="screen">
        <header className="screen-head">
          <button className="iconbtn" onClick={() => setPage('home')} aria-label="Back"><Icon.back /></button>
          <h1>{page === 'changes' ? 'What changed' : 'Sources'}</h1>
        </header>
        {page === 'changes' ? <ChangesPanel /> : <SourcesPanel />}
      </div>
    );

  const rank = rankById(build.rankId);
  return (
    <div className="screen">
      <header className="screen-head">
        <h1>Profile</h1>
      </header>

      <div className="profile-card">
        <div className="avatar">{rank.abbr}</div>
        <div>
          <strong>{rank.name} {build.lastName}</strong>
          <small>
            {build.component === 'ARNG' && build.state ? `${build.state} ARNG` : COMPONENT[build.component]} · {branchById(build.branchId).name}
          </small>
        </div>
      </div>

      <section className="form card">
        <label>
          Rank
          <select value={build.rankId} onChange={(e) => update({ rankId: e.target.value })}>
            {(['enlisted', 'warrant', 'officer'] as const).map((c) => (
              <optgroup key={c} label={c[0].toUpperCase() + c.slice(1)}>
                {RANKS.filter((r) => r.category === c).map((r) => <option key={r.id} value={r.id}>{r.abbr}: {r.name}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          Branch
          <select value={build.branchId} onChange={(e) => update({ branchId: e.target.value })}>
            {BRANCHES.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <label>
          Component
          <select value={build.component} onChange={(e) => {
            const component = e.target.value as Build['component'];
            update({ component, dutyStatus: component === 'ARNG' ? (build.dutyStatus === 'T10' ? 'T32' : build.dutyStatus) : 'T10' });
          }}>
            {Object.entries(COMPONENT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        {build.component === 'ARNG' && (
          <>
            <label>
              State
              <select value={build.state} onChange={(e) => update({ state: e.target.value })}>
                <option value="">Choose…</option>
                {STATES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
            </label>
            <label>
              Current status
              <select value={build.dutyStatus} onChange={(e) => update({ dutyStatus: e.target.value as Build['dutyStatus'] })}>
                <option value="T32">Title 32 (under the Governor)</option>
                <option value="SAD">State Active Duty</option>
                <option value="T10">Title 10 (mobilized / federal)</option>
              </select>
            </label>
          </>
        )}
        <label>
          Coat
          <select value={build.sex} onChange={(e) => update({ sex: e.target.value as Build['sex'] })}>
            <option value="male">Male coat</option>
            <option value="female">Female coat</option>
          </select>
        </label>
        <label>
          Last name
          <input value={build.lastName} maxLength={18} onChange={(e) => update({ lastName: e.target.value.toUpperCase() })} />
        </label>
        <div className="two">
          <label>
            Years of service
            <input type="number" inputMode="numeric" min={0} max={45} value={build.yearsService} onChange={(e) => update({ yearsService: Math.max(0, +e.target.value) })} />
          </label>
          <label>
            Months deployed (hostile-fire areas)
            <input type="number" inputMode="numeric" min={0} max={240} value={build.monthsHostile} onChange={(e) => update({ monthsHostile: Math.max(0, +e.target.value) })} />
          </label>
        </div>
      </section>

      <nav className="menu card">
        <button onClick={() => setPage('changes')}><span>What changed in AR 670-1</span><Icon.chevron /></button>
        <button onClick={() => setPage('sources')}><span>Sources & how this stays current</span><Icon.chevron /></button>
        <button onClick={onRestartSetup}><span>Run setup again</span><Icon.chevron /></button>
        <button
          className="danger"
          onClick={() => {
            if (confirm('Clear your uniform and start over?')) update({ ...DEFAULT_BUILD, onboarded: false });
          }}
        >
          <span>Start over</span>
        </button>
      </nav>
      {build.component === 'ARNG' && build.state && (
        <p className="muted pad small">State awards follow {stateName(build.state)}'s awards regulation for eligibility and precedence.</p>
      )}
      <p className="muted pad small">DressRight is not an official Army product. The official publications and your chain of command always win.</p>
    </div>
  );
}
