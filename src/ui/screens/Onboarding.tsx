import { useState } from 'react';
import type { Build } from '../../regs/build';
import { RANKS } from '../../regs/catalog/ranks';
import { BRANCHES } from '../../regs/catalog/branches';
import { STATES } from '../../regs/catalog/states';
import { Icon } from '../components/Icons';

type Step = 'component' | 'state' | 'status' | 'rank' | 'branch' | 'coat' | 'name';

export function Onboarding({ build, update, onDone }: { build: Build; update: (p: Partial<Build>) => void; onDone: () => void }) {
  const steps: Step[] = ['component', ...(build.component === 'ARNG' ? (['state', 'status'] as Step[]) : []), 'rank', 'branch', 'coat', 'name'];
  const [i, setI] = useState(0);
  const step = steps[Math.min(i, steps.length - 1)];
  const next = () => (i + 1 >= steps.length ? onDone() : setI(i + 1));
  const pick = (p: Partial<Build>) => {
    update(p);
    // let the component step re-compute the step list before advancing
    setTimeout(() => setI((n) => n + 1), 0);
  };
  const [rankCat, setRankCat] = useState<'enlisted' | 'warrant' | 'officer'>('enlisted');

  const Option = ({ on, title, sub, onClick }: { on: boolean; title: string; sub?: string; onClick: () => void }) => (
    <button className={`opt ${on ? 'on' : ''}`} onClick={onClick}>
      <span>
        <strong>{title}</strong>
        {sub && <small>{sub}</small>}
      </span>
      {on ? <Icon.check /> : <Icon.chevron />}
    </button>
  );

  return (
    <div className="onboard">
      <header className="onboard-top">
        {i > 0 ? (
          <button className="iconbtn" onClick={() => setI(i - 1)} aria-label="Back"><Icon.back /></button>
        ) : (
          <span className="iconbtn" />
        )}
        <div className="dots">
          {steps.map((s, k) => <span key={s} className={k <= i ? 'on' : ''} />)}
        </div>
        <button className="link" onClick={onDone}>Skip</button>
      </header>

      {step === 'component' && (
        <section>
          <h1>Let's set up your uniform</h1>
          <p className="lead">Your component decides which rules apply to you, like whether you can wear state awards.</p>
          <Option on={build.component === 'RA'} title="Regular Army" sub="Active duty" onClick={() => pick({ component: 'RA', dutyStatus: 'T10' })} />
          <Option on={build.component === 'USAR'} title="Army Reserve" onClick={() => pick({ component: 'USAR', dutyStatus: 'T10' })} />
          <Option on={build.component === 'ARNG'} title="Army National Guard" onClick={() => pick({ component: 'ARNG', dutyStatus: build.dutyStatus === 'T10' && build.component !== 'ARNG' ? 'T32' : build.dutyStatus })} />
        </section>
      )}

      {step === 'state' && (
        <section>
          <h1>Which state?</h1>
          <p className="lead">State awards, like the Governor's Twenty, follow your state's regulation.</p>
          <div className="statelist">
            {STATES.map(([code, name]) => (
              <button key={code} className={`chip ${build.state === code ? 'on' : ''}`} onClick={() => pick({ state: code })}>
                {name}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 'status' && (
        <section>
          <h1>What status are you in now?</h1>
          <p className="lead">This changes what you're allowed to wear. You can switch it any time, for example when you mobilize.</p>
          <Option on={build.dutyStatus === 'T32'} title="Title 32" sub="Drill, annual training, AGR (T32): under the Governor" onClick={() => pick({ dutyStatus: 'T32' })} />
          <Option on={build.dutyStatus === 'SAD'} title="State Active Duty" onClick={() => pick({ dutyStatus: 'SAD' })} />
          <Option on={build.dutyStatus === 'T10'} title="Title 10" sub="Mobilized or on federal orders" onClick={() => pick({ dutyStatus: 'T10' })} />
        </section>
      )}

      {step === 'rank' && (
        <section>
          <h1>Your rank</h1>
          <div className="seg big">
            {(['enlisted', 'warrant', 'officer'] as const).map((c) => (
              <button key={c} className={rankCat === c ? 'on' : ''} onClick={() => setRankCat(c)}>{c[0].toUpperCase() + c.slice(1)}</button>
            ))}
          </div>
          <div className="rankgrid">
            {RANKS.filter((r) => r.category === rankCat).map((r) => (
              <button key={r.id} className={`rank ${build.rankId === r.id ? 'on' : ''}`} onClick={() => pick({ rankId: r.id })}>
                <strong>{r.abbr}</strong>
                <small>{r.grade}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 'branch' && (
        <section>
          <h1>Your branch</h1>
          <div className="list-opts">
            {BRANCHES.map((b) => (
              <button key={b.id} className={`opt ${build.branchId === b.id ? 'on' : ''}`} onClick={() => pick({ branchId: b.id })}>
                <span className="swatch" style={{ background: `linear-gradient(135deg, ${b.primary} 50%, ${b.secondary} 50%)` }} />
                <span><strong>{b.name}</strong></span>
                {build.branchId === b.id ? <Icon.check /> : <Icon.chevron />}
              </button>
            ))}
          </div>
        </section>
      )}

      {step === 'coat' && (
        <section>
          <h1>Coat cut</h1>
          <p className="lead">Placement rules differ between the male and female coats.</p>
          <Option on={build.sex === 'male'} title="Male coat" onClick={() => pick({ sex: 'male' })} />
          <Option on={build.sex === 'female'} title="Female coat" onClick={() => pick({ sex: 'female' })} />
        </section>
      )}

      {step === 'name' && (
        <section>
          <h1>Name plate</h1>
          <p className="lead">Your last name, as it goes on the name plate.</p>
          <input className="bigfield" value={build.lastName} maxLength={18} autoFocus onChange={(e) => update({ lastName: e.target.value.toUpperCase() })} />
          <button className="primary block" onClick={next}>Build my uniform</button>
        </section>
      )}
    </div>
  );
}
