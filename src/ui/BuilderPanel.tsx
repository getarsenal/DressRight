import { useState, type ReactNode } from 'react';
import type { Build, RibbonEntry } from '../regs/build';
import { RANKS, rankById } from '../regs/catalog/ranks';
import { BRANCHES } from '../regs/catalog/branches';
import { RIBBONS, UNIT_AWARDS, ribbonById, type DeviceKind } from '../regs/catalog/ribbons';
import { BADGES, badgeById, type BadgeKind } from '../regs/catalog/badges';
import { sortedRibbons } from '../regs/layout';
import { InsigniaEditor } from './InsigniaEditor';

type Update = (p: Partial<Build>) => void;

const DEVICE_LABEL: Record<DeviceKind, string> = {
  olc: 'Oak leaf cluster',
  knot: 'Clasp knot',
  star: 'Service star',
  numeral: 'Numeral',
  V: '"V" device',
  C: '"C" device',
  R: '"R" device',
  M: '"M" device',
  hourglass: 'Hourglass',
};

const KIND_LABEL: Record<BadgeKind, string> = {
  combat: 'Combat badges',
  skill: 'Special skill badges',
  marksmanship: 'Marksmanship',
  id: 'Identification badges',
  foreign: 'Foreign badges',
  tab: 'Special skill tabs',
  state: 'State awards (ARNG)',
};

function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="sec">
      <button className="sec-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span>{title}</span>
        <span>{open ? '–' : '+'}</span>
      </button>
      {open && <div className="sec-body">{children}</div>}
    </section>
  );
}

function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  );
}

export function BuilderPanel({ build: b, update }: { build: Build; update: Update }) {
  const rank = rankById(b.rankId);

  const setRibbon = (i: number, p: Partial<RibbonEntry>) =>
    update({ ribbons: b.ribbons.map((r, j) => (j === i ? { ...r, ...p } : r)) });
  const moveRibbon = (i: number, d: -1 | 1) => {
    const r = [...b.ribbons];
    const j = i + d;
    if (j < 0 || j >= r.length) return;
    [r[i], r[j]] = [r[j], r[i]];
    update({ ribbons: r, manualRibbonOrder: true });
  };
  const displayedRibbons = b.manualRibbonOrder
    ? b.ribbons.map((r, i) => ({ r, i }))
    : sortedRibbons({ ...b, stateRibbons: [] }).map((rr) => {
        const i = b.ribbons.findIndex((x) => ribbonById(x.id)?.name === rr.name);
        return { r: b.ribbons[i], i };
      });

  return (
    <div className="panel">
      <Section title="Uniform">
        <Seg value={b.uniform} options={[['AGSU', 'AGSU (greens)'], ['ASU', 'ASU (blues)']]} onChange={(uniform) => update({ uniform })} />
        <Seg value={b.sex} options={[['male', 'Male coat'], ['female', 'Female coat']]} onChange={(sex) => update({ sex })} />
      </Section>

      <Section title="Soldier">
        <div className="grid2">
          <label>
            Rank
            <select value={b.rankId} onChange={(e) => update({ rankId: e.target.value })}>
              {(['enlisted', 'warrant', 'officer'] as const).map((cat) => (
                <optgroup key={cat} label={cat[0].toUpperCase() + cat.slice(1)}>
                  {RANKS.filter((r) => r.category === cat).map((r) => (
                    <option key={r.id} value={r.id}>{r.abbr} ({r.grade})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            Branch
            <select value={b.branchId} onChange={(e) => update({ branchId: e.target.value })}>
              {BRANCHES.map((br) => <option key={br.id} value={br.id}>{br.name}</option>)}
            </select>
          </label>
          <label>
            Last name
            <input value={b.lastName} maxLength={18} onChange={(e) => update({ lastName: e.target.value.toUpperCase() })} />
          </label>
          <label>
            Component
            <select
              value={b.component}
              onChange={(e) => {
                const component = e.target.value as Build['component'];
                update({ component, dutyStatus: component === 'ARNG' ? b.dutyStatus : 'T10' });
              }}
            >
              <option value="RA">Regular Army</option>
              <option value="USAR">Army Reserve</option>
              <option value="ARNG">Army National Guard</option>
            </select>
          </label>
          {b.component === 'ARNG' && (
            <label className="span2">
              Current duty status
              <select value={b.dutyStatus} onChange={(e) => update({ dutyStatus: e.target.value as Build['dutyStatus'] })}>
                <option value="T32">Title 32 (drill, AT, AGR-T32): under the Governor</option>
                <option value="SAD">State Active Duty</option>
                <option value="T10">Title 10 (mobilized / federal orders)</option>
              </select>
              <span className="muted small">Duty status decides whether state awards can be worn.</span>
            </label>
          )}
          <label>
            Years of service
            <input type="number" min={0} max={45} value={b.yearsService} onChange={(e) => update({ yearsService: Math.max(0, +e.target.value) })} />
          </label>
          <label>
            Months in hostile-fire areas
            <input type="number" min={0} max={240} value={b.monthsHostile} onChange={(e) => update({ monthsHostile: Math.max(0, +e.target.value) })} />
          </label>
        </div>
        <p className="muted small">
          {rank.category === 'enlisted'
            ? `${Math.floor(b.yearsService / 3)} service stripe(s) · `
            : 'No service stripes (enlisted only) · '}
          {Math.floor(b.monthsHostile / 6)} overseas service bar(s)
        </p>
      </Section>

      <Section title="Unit insignia & crests">
        <InsigniaEditor label="Distinctive unit insignia (DUI / crest)" value={b.dui} onChange={(dui) => update({ dui })} hint="Worn on both shoulder loops. Upload your unit's crest, or design a stand-in." />
        <InsigniaEditor label="Shoulder sleeve insignia (current unit)" value={b.ssi} onChange={(ssi) => update({ ssi })} hint="Left sleeve: the unit you are assigned to now." />
        <label className="check">
          <input type="checkbox" checked={b.airborneTab} onChange={(e) => update({ airborneTab: e.target.checked })} />
          My unit's SSI includes an Airborne tab
        </label>
        <label className="check">
          <input type="checkbox" checked={b.hasCombatPatch} onChange={(e) => update({ hasCombatPatch: e.target.checked })} />
          I have an SSI-MOHC (combat patch, formerly SSI-FWTS)
        </label>
        {b.hasCombatPatch && (
          <InsigniaEditor label="SSI-MOHC (right sleeve)" value={b.combatPatch} onChange={(combatPatch) => update({ combatPatch })} hint="The unit you served with during qualifying service in a hostile area." />
        )}
        <label className="check">
          <input type="checkbox" checked={b.rdi} onChange={(e) => update({ rdi: e.target.checked })} />
          Regimental distinctive insignia (regimental affiliation)
        </label>
      </Section>

      <Section title={`Ribbons (${b.ribbons.length + b.stateRibbons.length})`}>
        <label className="check">
          <input type="checkbox" checked={!b.manualRibbonOrder} onChange={(e) => update({ manualRibbonOrder: !e.target.checked })} />
          Automatic order of precedence
        </label>
        <ul className="list">
          {displayedRibbons.map(({ r, i }) => {
            const def = ribbonById(r.id)!;
            return (
              <li key={r.id + i}>
                <div className="row">
                  <span className="grow">{def.name}</span>
                  {b.manualRibbonOrder && (
                    <>
                      <button className="icon" onClick={() => moveRibbon(i, -1)} aria-label="Move up">↑</button>
                      <button className="icon" onClick={() => moveRibbon(i, 1)} aria-label="Move down">↓</button>
                    </>
                  )}
                  <button className="icon" onClick={() => update({ ribbons: b.ribbons.filter((_, j) => j !== i) })} aria-label="Remove">✕</button>
                </div>
                {def.devices && (
                  <div className="row small">
                    <select value={r.device ?? ''} onChange={(e) => setRibbon(i, { device: (e.target.value || undefined) as DeviceKind | undefined, count: r.count ?? 1 })}>
                      <option value="">No device</option>
                      {def.devices.map((d) => <option key={d} value={d}>{DEVICE_LABEL[d]}</option>)}
                    </select>
                    {r.device && (
                      <input type="number" min={1} max={9} value={r.count ?? 1} onChange={(e) => setRibbon(i, { count: Math.max(1, +e.target.value) })} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
        <select
          value=""
          onChange={(e) => e.target.value && update({ ribbons: [...b.ribbons, { id: e.target.value }] })}
        >
          <option value="">+ Add ribbon…</option>
          {RIBBONS.filter((r) => !b.ribbons.some((x) => x.id === r.id)).map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>

        <h5>State awards</h5>
        <p className="muted small">ARNG only, and only while under the Governor (Title 32 / SAD).</p>
        {b.stateRibbons.map((s, i) => (
          <div key={s.key} className="row">
            <input className="grow" value={s.name} onChange={(e) => update({ stateRibbons: b.stateRibbons.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
            {s.colors.map((c, ci) => (
              <input
                key={ci}
                type="color"
                value={c}
                onChange={(e) =>
                  update({
                    stateRibbons: b.stateRibbons.map((x, j) =>
                      j === i ? { ...x, colors: x.colors.map((cc, k) => (k === ci ? e.target.value : cc)) } : x,
                    ),
                  })
                }
              />
            ))}
            <button className="icon" onClick={() => update({ stateRibbons: b.stateRibbons.filter((_, j) => j !== i) })} aria-label="Remove">✕</button>
          </div>
        ))}
        <button
          className="ghost"
          onClick={() =>
            update({
              stateRibbons: [
                ...b.stateRibbons,
                { key: `STATE:${Date.now()}`, name: 'State Service Ribbon', colors: ['#1f3a93', '#f1c40f', '#ffffff'] },
              ],
            })
          }
        >
          + Add state ribbon
        </button>
      </Section>

      <Section title={`Unit awards (${b.unitAwards.length})`} defaultOpen={false}>
        <ul className="list">
          {b.unitAwards.map((u, i) => (
            <li key={u.id} className="row">
              <span className="grow">{UNIT_AWARDS.find((d) => d.id === u.id)?.name}</span>
              <label className="check small">
                <input type="checkbox" checked={u.permanent} onChange={(e) => update({ unitAwards: b.unitAwards.map((x, j) => (j === i ? { ...x, permanent: e.target.checked } : x)) })} />
                I was in the unit for the award period
              </label>
              <button className="icon" onClick={() => update({ unitAwards: b.unitAwards.filter((_, j) => j !== i) })} aria-label="Remove">✕</button>
            </li>
          ))}
        </ul>
        <select value="" onChange={(e) => e.target.value && update({ unitAwards: [...b.unitAwards, { id: e.target.value, permanent: false }] })}>
          <option value="">+ Add unit award…</option>
          {UNIT_AWARDS.filter((u) => !b.unitAwards.some((x) => x.id === u.id)).map((u) => (
            <option key={u.id} value={u.id}>{u.name}</option>
          ))}
        </select>
      </Section>

      <Section title={`Badges & tabs (${b.badges.length})`}>
        <ul className="list">
          {b.badges.map((e, i) => {
            const d = badgeById(e.id)!;
            return (
              <li key={e.id} className="row">
                <span className="grow">
                  {d.name}
                  {d.group && <span className="tag">group {d.group}</span>}
                </span>
                {d.levels && (
                  <select value={e.level ?? d.levels[0]} onChange={(ev) => update({ badges: b.badges.map((x, j) => (j === i ? { ...x, level: ev.target.value } : x)) })}>
                    {d.levels.map((l) => <option key={l}>{l}</option>)}
                  </select>
                )}
                <button className="icon" onClick={() => update({ badges: b.badges.filter((_, j) => j !== i) })} aria-label="Remove">✕</button>
              </li>
            );
          })}
        </ul>
        <select
          value=""
          onChange={(e) => {
            const d = badgeById(e.target.value);
            if (d) update({ badges: [...b.badges, { id: d.id, level: d.levels?.[0] }] });
          }}
        >
          <option value="">+ Add badge or tab…</option>
          {(Object.keys(KIND_LABEL) as BadgeKind[]).map((k) => (
            <optgroup key={k} label={KIND_LABEL[k]}>
              {BADGES.filter((d) => d.kind === k && !b.badges.some((x) => x.id === d.id)).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </Section>
    </div>
  );
}
